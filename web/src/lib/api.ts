import { mockApi } from "./mockApi";
import type { AssistantRequest, AssistantResponse } from "../types";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "/api/v1";
// Local Vite runs should work without Docker. The production Docker image
// explicitly builds with VITE_USE_MOCK_API=false and talks to the gateway.
export const isMockMode = import.meta.env.VITE_USE_MOCK_API !== "false";

export class ApiError extends Error {
  constructor(message: string, public readonly status: number) { super(message); }
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
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

export function formatVnd(value: number): string {
  return new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(value);
}
