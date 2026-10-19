import { ApiError } from "../../api/client";

/** Translation keys (under "users.errors") for what the server or the network can answer. */
export function userErrorKey(err: unknown): string {
  if (err instanceof ApiError) {
    switch (err.code) {
      case "network":
        return "network";
      case "last_admin":
        return "lastAdmin";
      case "email_taken":
        return "emailTaken";
      case "weak_password":
        return "weakPassword";
      case "invalid_email":
        return "invalidEmail";
      case "unknown_role":
        return "unknownRole";
      case "user_not_found":
        return "notFound";
      case "password_change_required":
        return "passwordChangeRequired";
    }
  }
  return "other";
}
