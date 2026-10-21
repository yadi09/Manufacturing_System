import { request } from "../../api/client";

export interface SetupColour {
  colour_id: string;
  cycle_s: string;
}

/** A mould on a machine. The standard cycle time only starts each day's plan. */
export interface Setup {
  mould_id: string;
  /** Seconds; null while not known. */
  standard_cycle_s: string | null;
  /** false once the mould is taken off the machine. */
  active: boolean;
  colours: SetupColour[];
}

export interface Workspace {
  id: string;
  kind: "machine" | "qc" | "recycling";
  name: string;
  name_am: string;
  runs_24h: boolean;
  active: boolean;
  setups: Setup[];
}

export interface WorkspaceInput {
  kind?: Workspace["kind"];
  name: string;
  name_am: string;
  runs_24h?: boolean;
  active?: boolean;
}

export interface SetupInput {
  standard_cycle_s: string | null;
  active?: boolean;
  colours: SetupColour[];
}

export interface Mould {
  id: string;
  product_id: string;
  name: string;
  name_am: string;
  /** null while not known. */
  cavities: number | null;
  active: boolean;
}

export interface MouldInput {
  product_id?: string;
  name: string;
  name_am: string;
  cavities: number | null;
  active?: boolean;
}

export interface Shift {
  id: string;
  name: string;
  name_am: string;
  /** HH:MM, local time. */
  start_time: string;
  end_time: string;
  position: number;
  active: boolean;
  /** Ends the next day; its work belongs to the day it started. */
  crosses_midnight: boolean;
}

export interface ShiftInput {
  name: string;
  name_am: string;
  start_time: string;
  end_time: string;
  position?: number;
  active?: boolean;
  /** Needed when the times of an existing shift change. */
  reason?: string;
}

export interface Reason {
  id: string;
  kind: "damage" | "downtime";
  name: string;
  name_am: string;
  active: boolean;
}

export interface ReasonInput {
  kind?: Reason["kind"];
  name: string;
  name_am: string;
  active?: boolean;
}

export interface Location {
  key: "raw_store" | "regrind_store" | "qc_area" | "staging_area" | "fg_store";
  holds_stock: boolean;
  name: string;
  name_am: string;
}

export interface Profession {
  id: string;
  name: string;
  name_am: string;
  active: boolean;
  /** Active employees with this profession. */
  employees: number;
}

export interface ProfessionInput {
  name: string;
  name_am: string;
  active?: boolean;
}

export interface Employee {
  id: string;
  full_name: string;
  name_am: string | null;
  profession_id: string;
  /** null: no sign-in account (operators). */
  user_id: string | null;
  email: string | null;
  active: boolean;
}

export interface EmployeeInput {
  full_name: string;
  name_am: string | null;
  profession_id: string;
  user_id: string | null;
  active?: boolean;
}

export interface Settings {
  display_time_zone: string;
  login_max_attempts: number;
  login_lockout_minutes: number;
  rest_rotation_minutes: number;
  bom_warn_pct: number;
  bom_crit_pct: number;
}

export const listWorkspaces = () => request<Workspace[]>("GET", "/api/workspaces");
export const createWorkspace = (w: WorkspaceInput) => request<Workspace>("POST", "/api/workspaces", w);
export const updateWorkspace = (id: string, w: WorkspaceInput) => request<Workspace>("PATCH", `/api/workspaces/${id}`, w);
export const setMould = (workspaceId: string, mouldId: string, s: SetupInput) => request<Workspace>("PUT", `/api/workspaces/${workspaceId}/moulds/${mouldId}`, s);

export const listMoulds = () => request<Mould[]>("GET", "/api/moulds");
export const createMould = (m: MouldInput) => request<Mould>("POST", "/api/moulds", m);
export const updateMould = (id: string, m: MouldInput) => request<Mould>("PATCH", `/api/moulds/${id}`, m);

export const listShifts = () => request<Shift[]>("GET", "/api/shifts");
export const createShift = (s: ShiftInput) => request<Shift>("POST", "/api/shifts", s);
export const updateShift = (id: string, s: ShiftInput) => request<Shift>("PATCH", `/api/shifts/${id}`, s);

export const listReasons = () => request<Reason[]>("GET", "/api/reasons");
export const createReason = (r: ReasonInput) => request<Reason>("POST", "/api/reasons", r);
export const updateReason = (id: string, r: ReasonInput) => request<Reason>("PATCH", `/api/reasons/${id}`, r);

export const listLocations = () => request<Location[]>("GET", "/api/locations");
export const renameLocation = (key: string, l: { name: string; name_am: string }) => request<Location>("PATCH", `/api/locations/${key}`, l);

export const listProfessions = () => request<Profession[]>("GET", "/api/professions");
export const createProfession = (p: ProfessionInput) => request<Profession>("POST", "/api/professions", p);
export const updateProfession = (id: string, p: ProfessionInput) => request<Profession>("PATCH", `/api/professions/${id}`, p);

export const listEmployees = () => request<Employee[]>("GET", "/api/employees");
export const createEmployee = (e: EmployeeInput) => request<Employee>("POST", "/api/employees", e);
export const updateEmployee = (id: string, e: EmployeeInput) => request<Employee>("PATCH", `/api/employees/${id}`, e);

export const getSettings = () => request<Settings>("GET", "/api/settings");
export const updateSettings = (s: Partial<Settings>) => request<Settings>("PATCH", "/api/settings", s);
