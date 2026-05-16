import { apiDelete, apiGet, apiPost, apiPut } from "@/lib/api";

function actorHeaders(actorKey: string) {
  return { "x-actor": actorKey };
}

export function remindersGet<T>(path: string, actorKey: string) {
  return apiGet<T>(path, { headers: actorHeaders(actorKey) });
}

export function remindersPost<T>(path: string, body: unknown, actorKey: string) {
  return apiPost<T>(path, body, { headers: actorHeaders(actorKey) });
}

export function remindersPut<T>(path: string, body: unknown, actorKey: string) {
  return apiPut<T>(path, body, { headers: actorHeaders(actorKey) });
}

export function remindersDelete<T>(path: string, actorKey: string) {
  return apiDelete<T>(path, { headers: actorHeaders(actorKey) });
}
