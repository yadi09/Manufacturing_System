import { ApiError, request } from "../../api/client";

export interface Role {
  key: string;
  name: string;
}

export interface User {
  id: string;
  email: string;
  full_name: string;
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
