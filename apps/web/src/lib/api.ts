export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

async function responseError(response: Response) {
  const text = await response.text();
  try {
    const data = JSON.parse(text) as { error?: string; message?: string };
    return new Error(data.error ?? data.message ?? text);
  } catch {
    return new Error(text || `Request failed: ${response.status}`);
  }
}

export async function apiGet<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, { cache: "no-store", ...init });
  if (!response.ok) throw await responseError(response);
  return response.json() as Promise<T>;
}

export async function apiPost<T>(path: string, body?: unknown, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    method: "POST",
    headers: body instanceof FormData ? init?.headers : { "Content-Type": "application/json", ...init?.headers },
    body: body instanceof FormData ? body : JSON.stringify(body ?? {}),
  });
  if (!response.ok) throw await responseError(response);
  return response.json() as Promise<T>;
}

export async function apiPut<T>(path: string, body: unknown, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    method: "PUT",
    headers: { "Content-Type": "application/json", ...init?.headers },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw await responseError(response);
  return response.json() as Promise<T>;
}

export async function apiDelete<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, { ...init, method: "DELETE" });
  if (!response.ok) throw await responseError(response);
  return response.json() as Promise<T>;
}
