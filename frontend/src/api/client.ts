/** Error from the API. `code` is the stable code the server sends; the UI translates it. */
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    /** Seconds from the Retry-After header, when the server sent one. */
    public retryAfter?: number,
  ) {
    super(`${status} ${code}`);
  }
}

const base = import.meta.env.VITE_API_URL ?? "";

export async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${base}${path}`, {
      method,
      credentials: "include",
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "network");
  }
  if (res.status === 204) return undefined as T;
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) {
    const retry = Number(res.headers.get("Retry-After"));
    throw new ApiError(res.status, data.error ?? "unknown", Number.isFinite(retry) && retry > 0 ? retry : undefined);
  }
  return data as T;
}
