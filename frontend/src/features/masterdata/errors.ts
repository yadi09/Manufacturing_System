import { ApiError } from "../../api/client";

/** Translation key under "master.errors" for what the server (or the network) said. */
export function masterErrorKey(err: unknown): string {
  if (err instanceof ApiError) {
    switch (err.code) {
      case "network":
        return "network";
      case "duplicate_name":
        return "duplicateName";
      case "unit_locked":
        return "unitLocked";
      case "invalid_quantity":
        return "invalidQuantity";
      case "invalid_input":
        return "invalidInput";
      case "not_found":
        return "notFound";
      case "version_conflict":
        return "versionConflict";
    }
  }
  return "other";
}
