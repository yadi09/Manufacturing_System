import { request } from "../../api/client";

export const changePassword = (current: string, next: string) =>
  request<void>("POST", "/api/auth/password", { current_password: current, new_password: next });
