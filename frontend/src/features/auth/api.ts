import { ApiError, request } from "../../api/client";

export interface Role {
  key: string;
  name: string;
  name_am: string;
}

export interface User {
  id: string;
  email: string;
  full_name: string;
  /** True after a new user or a reset: the API allows only changing the password until it is done. */
  must_change_password: boolean;
  roles: Role[];
  permissions: string[];
}

export const login = (email: string, password: string) => request<User>("POST", "/api/auth/login", { email, password });
export const logout = () => request<void>("POST", "/api/auth/logout");

/** The signed-in user, or null when there is no valid session. */
export async function getMe(): Promise<User | null> {
  try {
    return await request<User>("GET", "/api/auth/me");
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) return null;
    throw e;
  }
}
