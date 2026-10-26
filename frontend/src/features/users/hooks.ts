import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createUser, listRoles, listUsers, resetPassword, updateUser, type NewUser, type UserUpdate } from "./api";

const USERS = ["users"];

export const useUsers = () => useQuery({ queryKey: USERS, queryFn: listUsers, retry: false });
export const useRoles = () => useQuery({ queryKey: ["roles"], queryFn: listRoles, retry: false, staleTime: 5 * 60_000 });

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (u: NewUser) => createUser(u), onSuccess: () => qc.invalidateQueries({ queryKey: USERS }) });
}

export function useUpdateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...rest }: { id: string } & UserUpdate) => updateUser(id, rest),
    onSuccess: () => qc.invalidateQueries({ queryKey: USERS }),
  });
}

export function useResetPassword() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, password }: { id: string; password: string }) => resetPassword(id, password),
    onSuccess: () => qc.invalidateQueries({ queryKey: USERS }),
  });
}
