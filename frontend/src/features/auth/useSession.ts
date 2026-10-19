import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getMe, login, logout } from "./api";

const KEY = ["me"];

export function useMe() {
  return useQuery({ queryKey: KEY, queryFn: getMe, retry: false, staleTime: 60_000 });
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ email, password }: { email: string; password: string }) => login(email, password),
    onSuccess: (user) => qc.setQueryData(KEY, user),
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: logout, onSuccess: () => qc.setQueryData(KEY, null) });
}
