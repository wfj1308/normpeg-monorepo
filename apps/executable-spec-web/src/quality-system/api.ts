import type { CompactionInputs, Container } from "./models.ts";

const API_BASE = (import.meta.env.VITE_QUALITY_API_BASE as string | undefined)?.trim() || "http://localhost:8787";

type ExecutePayload = {
  containerId: string;
  spuId: string;
  inputs: CompactionInputs;
};

type SignPayload = {
  containerId: string;
  spuId: string;
  role: string;
  attemptIndex?: number;
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    ...init,
  });
  const payload = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(payload.error || `${response.status} ${response.statusText}`);
  }
  return payload;
}

export async function createContainer(payload: {
  slotRef: string;
  station: string;
  coordinateX: number;
  coordinateY: number;
  spuIds: string[];
}) {
  return request<{ container: Container }>("/container/create", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function executeSpu(payload: ExecutePayload) {
  return request<{ container: Container }>("/spu/execute", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function signSpu(payload: SignPayload) {
  return request<{ container: Container }>("/spu/sign", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getContainer(containerId: string) {
  return request<{ container: Container }>(`/container/${encodeURIComponent(containerId)}`);
}

export async function archiveContainer(containerId: string) {
  return request<{ container: Container }>("/container/archive", {
    method: "POST",
    body: JSON.stringify({ containerId }),
  });
}

export { API_BASE };
