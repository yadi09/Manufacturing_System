export interface Health {
  status: "ok" | "degraded";
  database: "up" | "down";
}

const base = import.meta.env.VITE_API_URL ?? "";

export async function getHealth(): Promise<Health> {
  const res = await fetch(`${base}/healthz`);
  return (await res.json()) as Health;
}
