import http from "k6/http";
import { check, sleep } from "k6";

export const options = {
  vus: 10,
  duration: "20s",
  thresholds: { http_req_duration: ["p(95)<750"], http_req_failed: ["rate<0.01"] }
};

const baseUrl = __ENV.BASE_URL || "http://localhost:8080/api/v1";

export default function () {
  const response = http.get(`${baseUrl}/admin/campaigns?status=PENDING_REVIEW`, { headers: { Authorization: `Bearer ${__ENV.ADMIN_TOKEN}` } });
  check(response, { "review queue available": (result) => result.status === 200 });
  sleep(0.5);
}

