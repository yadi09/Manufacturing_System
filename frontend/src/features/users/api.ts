import { request } from "../../api/client";

export interface UserSummary {
  id: string;
  email: string;
  full_name: string;
  active: boolean;
  must_change_password: boolean;
  roles: string[];
}

/** Names and descriptions come from the server (data), in both languages. */
export interface RoleInfo {
  key: string;
  name: string;
  name_am: string;
  description: string;
  description_am: string;
  permissions: string[];
}

export interface UserUpdate {
  full_name?: string;
  active?: boolean;
  roles?: string[];
}

export interface NewUser {
  email: string;
  full_name: string;
  password: string;
  roles: string[];
}

export const listUsers = () => request<UserSummary[]>("GET", "/api/users");
export const listRoles = () => request<RoleInfo[]>("GET", "/api/roles");
export const createUser = (u: NewUser) => request<unknown>("POST", "/api/users", u);
export const updateUser = (id: string, u: UserUpdate) => request<void>("PATCH", `/api/users/${id}`, u);
export const resetPassword = (id: string, password: string) => request<void>("POST", `/api/users/${id}/password`, { password });
