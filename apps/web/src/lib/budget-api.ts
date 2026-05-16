const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

async function budgetRequest<T>(
  method: string,
  path: string,
  body: unknown,
  actorKey: string,
): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "x-actor": actorKey,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    let message = `Request failed: ${response.status}`;
    try {
      const data = await response.json();
      if (data?.error) message = data.error;
    } catch {
      // Ignore parse errors.
    }
    throw new Error(message);
  }

  return response.json() as Promise<T>;
}

export function budgetGet<T>(path: string, actorKey: string): Promise<T> {
  return budgetRequest<T>("GET", path, undefined, actorKey);
}

export function budgetPost<T>(path: string, body: unknown, actorKey: string): Promise<T> {
  return budgetRequest<T>("POST", path, body, actorKey);
}

export function budgetPut<T>(path: string, body: unknown, actorKey: string): Promise<T> {
  return budgetRequest<T>("PUT", path, body, actorKey);
}

export function budgetDelete<T>(path: string, actorKey: string): Promise<T> {
  return budgetRequest<T>("DELETE", path, undefined, actorKey);
}

export function budgetExportUrl(actorKey: string) {
  return `${API_URL}/api/budget/export?actor=${encodeURIComponent(actorKey)}`;
}
