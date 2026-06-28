import http from "k6/http";
import { check, sleep } from "k6";

export const options = {
  scenarios: {
    donations: { executor: "constant-vus", vus: 20, duration: "30s" }
  },
  thresholds: {
    http_req_duration: ["p(95)<750"],
    http_req_failed: ["rate<0.01"]
  }
};

const baseUrl = __ENV.BASE_URL || "http://localhost:8080/api/v1";
const token = __ENV.DONOR_TOKEN;
const campaignId = __ENV.CAMPAIGN_ID;

export default function () {
  const response = http.post(`${baseUrl}/donations`, JSON.stringify({ campaign_id: campaignId, amount: 50000, anonymous: __ITER % 2 === 0 }), {
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }
  });
  check(response, { "donation completed": (result) => result.status === 201 });
  sleep(0.2);
}

