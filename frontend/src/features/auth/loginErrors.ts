import { ApiError } from "../../api/client";

export type LoginProblem =
  | { kind: "invalid" }
  | { kind: "locked"; minutes: number; until: number }
  | { kind: "offline" }
  | { kind: "other" };

/** Turns an API error into what the sign-in screen shows. `now` is a parameter so it can be tested. */
export function loginProblem(error: unknown, now: number = Date.now()): LoginProblem {
  if (error instanceof ApiError) {
    if (error.code === "invalid_credentials") return { kind: "invalid" };
    if (error.code === "too_many_attempts") {
      const seconds = error.retryAfter ?? 60;
      return { kind: "locked", minutes: Math.max(1, Math.ceil(seconds / 60)), until: now + seconds * 1000 };
    }
    if (error.code === "network") return { kind: "offline" };
  }
  return { kind: "other" };
}
