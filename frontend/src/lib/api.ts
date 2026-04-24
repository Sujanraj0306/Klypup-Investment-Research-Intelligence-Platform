import { auth } from './firebase';

const BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ||
  'http://localhost:8000';

export class ApiError extends Error {
  status: number;
  detail?: unknown;
  constructor(status: number, message: string, detail?: unknown) {
    super(message);
    this.status = status;
    this.detail = detail;
  }
}

async function authHeaders(): Promise<Record<string, string>> {
  const token = await auth.currentUser?.getIdToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function parseOr<T>(res: Response): Promise<T> {
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  if (!text) return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return text as unknown as T;
  }
}

async function request<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: { ...(await authHeaders()), ...(init.headers || {}) },
  });
  if (!res.ok) {
    const body = await parseOr<{ detail?: unknown } | string>(res);
    const message =
      (typeof body === 'object' && body && 'detail' in body
        ? typeof body.detail === 'string'
          ? body.detail
          : JSON.stringify(body.detail)
        : typeof body === 'string'
          ? body
          : undefined) || `API ${res.status}`;
    throw new ApiError(res.status, message, body);
  }
  return parseOr<T>(res);
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: 'POST',
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: 'PATCH',
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  delete: <T = void>(path: string) => request<T>(path, { method: 'DELETE' }),
  /**
   * SSE streaming POST. Parses each `event:` + `data:` pair and invokes
   * `onEvent({ event, data })` once per frame. `data` is JSON-parsed when
   * possible; otherwise passed through as a string. Used by the Phase 3
   * research agent.
   */
  stream: async (
    path: string,
    body: unknown,
    onEvent: (frame: { event: string; data: unknown }) => void,
    signal?: AbortSignal,
  ) => {
    const res = await fetch(`${BASE_URL}${path}`, {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify(body),
      signal,
    });
    if (!res.ok || !res.body) {
      throw new ApiError(res.status, `Stream failed (${res.status})`);
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    // sse_starlette emits `\r\n` between fields so frames are separated by
    // `\r\n\r\n`. Standard SSE also allows plain `\n\n`. Normalize to `\n`
    // so we can split on `\n\n` regardless of which line ending the server uses.
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
      let idx: number;
      while ((idx = buffer.indexOf('\n\n')) !== -1) {
        const frame = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        let eventName = 'message';
        const dataLines: string[] = [];
        for (const line of frame.split('\n')) {
          if (line.startsWith(':')) continue; // SSE comment / keepalive
          if (line.startsWith('event:')) {
            eventName = line.slice(6).trim();
          } else if (line.startsWith('data:')) {
            dataLines.push(line.slice(5).replace(/^ /, ''));
          }
        }
        if (!dataLines.length) continue;
        const raw = dataLines.join('\n');
        let parsed: unknown = raw;
        try {
          parsed = JSON.parse(raw);
        } catch {
          /* leave as string */
        }
        onEvent({ event: eventName, data: parsed });
      }
    }
  },
};

export const apiBaseUrl = BASE_URL;
