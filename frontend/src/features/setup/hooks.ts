import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as api from "./api";

export const WORKSPACES = ["workspaces"];
export const MOULDS = ["moulds"];
export const SHIFTS = ["shifts"];
export const REASONS = ["reasons"];
export const LOCATIONS = ["locations"];
export const PROFESSIONS = ["professions"];
export const EMPLOYEES = ["employees"];
export const SETTINGS = ["settings"];

export const useWorkspaces = () => useQuery({ queryKey: WORKSPACES, queryFn: api.listWorkspaces, retry: false });
export const useMoulds = () => useQuery({ queryKey: MOULDS, queryFn: api.listMoulds, retry: false });
export const useShifts = () => useQuery({ queryKey: SHIFTS, queryFn: api.listShifts, retry: false });
export const useReasons = () => useQuery({ queryKey: REASONS, queryFn: api.listReasons, retry: false });
export const useLocations = () => useQuery({ queryKey: LOCATIONS, queryFn: api.listLocations, retry: false });
export const useProfessions = () => useQuery({ queryKey: PROFESSIONS, queryFn: api.listProfessions, retry: false });
export const useEmployees = () => useQuery({ queryKey: EMPLOYEES, queryFn: api.listEmployees, retry: false });
export const useSettings = () => useQuery({ queryKey: SETTINGS, queryFn: api.getSettings, retry: false });

function useSaving<TVars, TData>(fn: (v: TVars) => Promise<TData>, keys: string[][]) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => Promise.all(keys.map((k) => qc.invalidateQueries({ queryKey: k }))) });
}

type WithId<T> = { id: string } & T;

export const useCreateWorkspace = () => useSaving((w: api.WorkspaceInput) => api.createWorkspace(w), [WORKSPACES]);
export const useUpdateWorkspace = () => useSaving(({ id, ...w }: WithId<api.WorkspaceInput>) => api.updateWorkspace(id, w), [WORKSPACES]);
export const useSetMould = () => useSaving(({ workspaceId, mouldId, ...s }: { workspaceId: string; mouldId: string } & api.SetupInput) => api.setMould(workspaceId, mouldId, s), [WORKSPACES]);
export const useCreateMould = () => useSaving((m: api.MouldInput) => api.createMould(m), [MOULDS]);
export const useUpdateMould = () => useSaving(({ id, ...m }: WithId<api.MouldInput>) => api.updateMould(id, m), [MOULDS]);
export const useCreateShift = () => useSaving((s: api.ShiftInput) => api.createShift(s), [SHIFTS]);
export const useUpdateShift = () => useSaving(({ id, ...s }: WithId<api.ShiftInput>) => api.updateShift(id, s), [SHIFTS]);
export const useCreateReason = () => useSaving((r: api.ReasonInput) => api.createReason(r), [REASONS]);
export const useUpdateReason = () => useSaving(({ id, ...r }: WithId<api.ReasonInput>) => api.updateReason(id, r), [REASONS]);
export const useRenameLocation = () => useSaving(({ key, ...l }: { key: string; name: string; name_am: string }) => api.renameLocation(key, l), [LOCATIONS]);
export const useCreateProfession = () => useSaving((p: api.ProfessionInput) => api.createProfession(p), [PROFESSIONS]);
export const useUpdateProfession = () => useSaving(({ id, ...p }: WithId<api.ProfessionInput>) => api.updateProfession(id, p), [PROFESSIONS, EMPLOYEES]);
export const useCreateEmployee = () => useSaving((e: api.EmployeeInput) => api.createEmployee(e), [EMPLOYEES, PROFESSIONS]);
export const useUpdateEmployee = () => useSaving(({ id, ...e }: WithId<api.EmployeeInput>) => api.updateEmployee(id, e), [EMPLOYEES, PROFESSIONS]);
export const useUpdateSettings = () => useSaving((s: Partial<api.Settings>) => api.updateSettings(s), [SETTINGS]);
