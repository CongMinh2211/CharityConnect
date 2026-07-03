const queryMock = jest.fn();
const sendMock = jest.fn();

jest.mock("../src/db", () => ({ pool: { query: queryMock } }));
jest.mock("googleapis", () => ({
  google: {
    auth: { OAuth2: jest.fn().mockImplementation(() => ({ setCredentials: jest.fn() })) },
    gmail: jest.fn(() => ({ users: { messages: { send: sendMock } } })),
  },
}));

import {
  claimNextEmail,
  deliverQueuedEmails,
  emailDeliveryMode,
  encodeMessage,
  renderEmail,
  sendWithGmail,
  type OutboxRow,
} from "../src/notifications";

const row: OutboxRow = {
  id: "email-1", template: "WELCOME", name: "An <script>", email: "an@example.vn",
  payload: {}, attempts: 0,
};

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.GMAIL_CLIENT_ID;
  delete process.env.GMAIL_CLIENT_SECRET;
  delete process.env.GMAIL_REFRESH_TOKEN;
  delete process.env.GMAIL_SENDER_EMAIL;
  process.env.PUBLIC_WEB_URL = "http://127.0.0.1:5173";
});

function configureGmail(): void {
  process.env.GMAIL_CLIENT_ID = "client";
  process.env.GMAIL_CLIENT_SECRET = "secret";
  process.env.GMAIL_REFRESH_TOKEN = "refresh";
  process.env.GMAIL_SENDER_EMAIL = "sender@example.vn";
}

it("queues only when Gmail OAuth is incomplete", async () => {
  expect(emailDeliveryMode()).toBe("QUEUED_ONLY");
  await deliverQueuedEmails();
  expect(queryMock).not.toHaveBeenCalled();
});

it("renders safe welcome and donation messages", () => {
  const welcome = renderEmail(row);
  expect(welcome.html).toContain("An &lt;script&gt;");
  expect(welcome.text).toContain("/dang-nhap");
  const update = renderEmail({
    ...row,
    template: "CAMPAIGN_UPDATE",
    payload: { campaign_title: "<Campaign>", message: "<Update>", path: "chien-dich/demo" },
  });
  expect(update.subject).toContain("<Campaign>");
  expect(update.html).toContain("&lt;Campaign&gt;");
  expect(update.html).toContain("http://127.0.0.1:5173/chien-dich/demo");
  const reset = renderEmail({
    ...row,
    template: "PASSWORD_RESET",
    payload: { reset_path: "/dat-lai-mat-khau?token=abc", expires_minutes: 15 },
  });
  expect(reset.text).toContain("15");
  expect(reset.html).toContain("token=abc");
  const thanks = renderEmail({
    ...row, template: "DONATION_THANK_YOU",
    payload: { receipt_number: "CC 001", amount: 250000, campaign_title: "<Trường học>" },
  });
  expect(thanks.subject).toContain("CC 001");
  expect(thanks.html).toContain("&lt;Trường học&gt;");
  expect(thanks.html).toContain("receipt=CC%20001");
});

it("encodes a Gmail MIME message without exposing raw HTML", () => {
  configureGmail();
  const encoded = encodeMessage("to@example.vn", "Cảm ơn", "Nội dung", "<b>Nội dung</b>");
  const decoded = Buffer.from(encoded, "base64url").toString();
  expect(decoded).toContain("sender@example.vn");
  expect(decoded).toContain("multipart/alternative");
  expect(decoded).not.toContain("<b>Nội dung</b>");
});

it("claims the next eligible outbox message", async () => {
  queryMock.mockResolvedValueOnce({ rows: [row] });
  await expect(claimNextEmail()).resolves.toEqual(row);
  queryMock.mockResolvedValueOnce({ rows: [] });
  await expect(claimNextEmail()).resolves.toBeNull();
});

it("sends through Gmail and returns provider id", async () => {
  configureGmail();
  sendMock.mockResolvedValueOnce({ data: { id: "gmail-1" } });
  await expect(sendWithGmail(row)).resolves.toBe("gmail-1");
  sendMock.mockResolvedValueOnce({ data: {} });
  await expect(sendWithGmail(row)).resolves.toBe("gmail-accepted");
});

it("marks a successful email as sent", async () => {
  configureGmail();
  queryMock
    .mockResolvedValueOnce({ rows: [{ count: "1" }] })
    .mockResolvedValueOnce({ rows: [row] })
    .mockResolvedValueOnce({ rows: [] });
  sendMock.mockResolvedValueOnce({ data: { id: "gmail-1" } });
  await deliverQueuedEmails();
  expect(queryMock.mock.calls[2][0]).toContain("status='SENT'");
  expect(queryMock.mock.calls[2][1]).toEqual(["gmail-1", row.id]);
});

it("retries delivery and moves the fifth failure to FAILED", async () => {
  configureGmail();
  const failing = { ...row, template: "DONATION_THANK_YOU" as const, attempts: 4 };
  queryMock
    .mockResolvedValueOnce({ rows: [{ count: "1" }] })
    .mockResolvedValueOnce({ rows: [failing] })
    .mockResolvedValueOnce({ rows: [] });
  sendMock.mockRejectedValueOnce(new Error("oauth unavailable"));
  await deliverQueuedEmails();
  expect(queryMock.mock.calls[2][1][0]).toBe("FAILED");
  expect(queryMock.mock.calls[2][1][1]).toBe(5);
  expect(queryMock.mock.calls[2][1][3]).toContain("oauth unavailable");
});

it("does nothing when the configured queue is empty", async () => {
  configureGmail();
  queryMock.mockResolvedValueOnce({ rows: [{ count: "0" }] }).mockResolvedValueOnce({ rows: [] });
  await deliverQueuedEmails();
  expect(sendMock).not.toHaveBeenCalled();
});
