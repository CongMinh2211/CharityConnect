import { mockApi } from "./mockApi";
import { roleFunctionGroups } from "../shared/lib/roleGuide";
import type { AnchorOnchainResponse, AssistantRequest, AssistantResponse, MerkleProofExport, Role, RoleGuideResponse, SourceAnalysis, SourceAnalysisRequest, TrustChainHealth } from "../types";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "/api/v1";
// Local Vite runs should work without Docker. The production Docker image
// explicitly builds with VITE_USE_MOCK_API=false and talks to the gateway.
export const isMockMode = import.meta.env.VITE_USE_MOCK_API !== "false";

export class ApiError extends Error {
  constructor(message: string, public readonly status: number) { super(message); }
}

// Gia hạn access token bằng refresh token (rotation): chỉ 1 request refresh chạy
// tại một thời điểm; các request 401 khác chờ chung kết quả.
let refreshInFlight: Promise<boolean> | null = null;

async function refreshAccessToken(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    const refreshToken = localStorage.getItem("cc_refresh_token");
    if (!refreshToken) return false;
    try {
      const response = await fetch(`${API_BASE}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });
      if (!response.ok) {
        localStorage.removeItem("cc_token");
        localStorage.removeItem("cc_refresh_token");
        return false;
      }
      const payload = await response.json() as { token: string; refresh_token: string };
      localStorage.setItem("cc_token", payload.token);
      localStorage.setItem("cc_refresh_token", payload.refresh_token);
      return true;
    } catch {
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

export async function api<T>(path: string, options: RequestInit = {}, retried = false): Promise<T> {
  if (isMockMode) {
    try {
      return await mockApi<T>(path, options);
    } catch (error) {
      const failure = error as Error & { status?: number };
      throw new ApiError(failure.message, failure.status ?? 500);
    }
  }

  const token = localStorage.getItem("cc_token");
  const headers = new Headers(options.headers);
  if (!(options.body instanceof FormData)) headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (response.status === 401 && !retried && !path.startsWith("/auth/") && await refreshAccessToken()) {
    return api<T>(path, options, true);
  }
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.includes("application/json")) {
    throw new ApiError("Máy chủ API đang cấu hình sai hoặc chưa được triển khai.", 502);
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(payload.message ?? payload.detail ?? "Không thể xử lý yêu cầu", response.status);
  return payload as T;
}

export async function downloadApi(path: string): Promise<Blob> {
  if (isMockMode) return mockApi<Blob>(path);
  const token = localStorage.getItem("cc_token");
  const response = await fetch(`${API_BASE}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : undefined });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({})) as { message?: string; detail?: string };
    throw new ApiError(payload.message ?? payload.detail ?? "Không thể tải tệp", response.status);
  }
  return response.blob();
}

export async function askAssistant(request: AssistantRequest): Promise<AssistantResponse> {
  if (!isMockMode) return api<AssistantResponse>("/assistant/chat", { method: "POST", body: JSON.stringify(request) });
  const assistantBase = import.meta.env.VITE_ASSISTANT_URL ?? "http://127.0.0.1:8001";
  try {
    const response = await fetch(`${assistantBase}/assistant/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request)
    });
    if (!response.ok) throw new Error("Assistant unavailable");
    return await response.json() as AssistantResponse;
  } catch {
    return mockApi<AssistantResponse>("/assistant/chat", { method: "POST", body: JSON.stringify(request) });
  }
}

// Công cụ phân tích nguồn/lời kêu gọi từ thiện (AI một lần, không phải chatbot).
export async function analyzeSource(request: SourceAnalysisRequest): Promise<SourceAnalysis> {
  if (!isMockMode) return api<SourceAnalysis>("/assistant/analyze-source", { method: "POST", body: JSON.stringify(request) });
  const assistantBase = import.meta.env.VITE_ASSISTANT_URL ?? "http://127.0.0.1:8001";
  try {
    const response = await fetch(`${assistantBase}/assistant/analyze-source`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request)
    });
    if (!response.ok) throw new Error("Analyzer unavailable");
    return await response.json() as SourceAnalysis;
  } catch {
    return mockApi<SourceAnalysis>("/assistant/analyze-source", { method: "POST", body: JSON.stringify(request) });
  }
}

export async function getAssistantRoleGuide(role: Role | "PUBLIC", path = "/"): Promise<RoleGuideResponse> {
  const assistantBase = import.meta.env.VITE_ASSISTANT_URL ?? "http://127.0.0.1:8001";
  try {
    const response = await fetch(`${assistantBase}/assistant/role-guide?role=${role}&path=${encodeURIComponent(path)}`);
    if (!response.ok) throw new Error("Role guide unavailable");
    return await response.json() as RoleGuideResponse;
  } catch {
    const sections = roleFunctionGroups
      .filter((group) => group.audience === "COMMON" || group.audience === role)
      .map((group) => ({
        title: group.title,
        description: group.subtitle,
        actions: group.items.map((item) => ({
          label: item.label,
          path: item.path,
          description: item.description,
          roles: item.roles ?? ["PUBLIC", "DONOR", "ORGANIZATION", "ADMIN"],
          requires_login: Boolean(item.requiresLogin)
        }))
      }));
    const locked_actions = roleFunctionGroups
      .flatMap((group) => group.items)
      .filter((item) => item.requiresLogin && (!item.roles || !item.roles.includes(role as Role)))
      .map((item) => ({
        label: item.label,
        path: item.path,
        description: item.description,
        roles: item.roles ?? ["PUBLIC", "DONOR", "ORGANIZATION", "ADMIN"],
        requires_login: Boolean(item.requiresLogin)
      }));
    return {
      role,
      path,
      sections,
      locked_actions,
      tips: ["Đây là hướng dẫn cục bộ khi trợ lý Python chưa sẵn sàng."],
      knowledge_version: "frontend-role-guide"
    };
  }
}

export async function verifyAnchorOnchain(anchorId: string): Promise<AnchorOnchainResponse> {
  return api<AnchorOnchainResponse>(`/transparency/anchors/${anchorId}/verify-onchain`);
}

export async function exportMerkleProof(position: number): Promise<MerkleProofExport> {
  return api<MerkleProofExport>(`/transparency/proofs/${position}/export`);
}

export async function getTrustChainHealth(): Promise<TrustChainHealth> {
  return api<TrustChainHealth>("/transparency/anchors/health");
}

export function formatVnd(value: number): string {
  return new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(value);
}
