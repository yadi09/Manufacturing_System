import { ApiError } from "../../api/client";

export type PasswordProblem = "wrong" | "short" | "same" | "offline" | "other";

/** What the server (or the network) said, as something the form can show. */
export function passwordProblem(err: unknown): PasswordProblem {
  if (err instanceof ApiError) {
    if (err.code === "wrong_password") return "wrong";
    if (err.code === "weak_password") return "short";
    if (err.code === "password_unchanged") return "same";
    if (err.code === "network") return "offline";
  }
  return "other";
}
