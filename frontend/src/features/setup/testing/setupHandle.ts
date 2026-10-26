// The fake API for machines, moulds, shifts, reasons, stores, employees and settings. It answers like the
// real server (including its refusals) so the screens can be tested without a database.
import type { Reply } from "../../users/testing/fakeServer";
import type { Product } from "../../masterdata/api";
import type { Employee, EmployeeInput, Location, Mould, MouldInput, Profession, ProfessionInput, Reason, ReasonInput, Settings, SetupInput, Shift, ShiftInput, Workspace, WorkspaceInput } from "../api";
import { EMPLOYEES, LOCATIONS, MOULDS, PROFESSIONS, REASONS, SETTINGS, SHIFTS, WORKSPACES } from "./setupFixtures";

export interface SetupData {
  workspaces?: Workspace[];
  moulds?: Mould[];
  shifts?: Shift[];
  reasons?: Reason[];
  locations?: Location[];
  professions?: Profession[];
  employees?: Employee[];
  settings?: Settings;
}

const copy = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
const clock = /^([01]\d|2[0-3]):[0-5]\d$/;
const cycleOk = (v: string) => /^\d{1,4}(\.\d{1,2})?$/.test(v) && Number(v) > 0 && Number(v) <= 3600;
const err = (status: number, error: string): Reply => ({ status, body: { error } });

export function createSetupData(d: SetupData = {}) {
  return {
    workspaces: copy(d.workspaces ?? WORKSPACES),
    moulds: copy(d.moulds ?? MOULDS),
    shifts: copy(d.shifts ?? SHIFTS),
    reasons: copy(d.reasons ?? REASONS),
    locations: copy(d.locations ?? LOCATIONS),
    professions: copy(d.professions ?? PROFESSIONS),
    employees: copy(d.employees ?? EMPLOYEES),
    settings: copy(d.settings ?? SETTINGS),
  };
}

export type SetupState = ReturnType<typeof createSetupData>;

export function setupHandle(s: SetupState, ctx: { can: string[]; products: Product[]; users: Array<{ id: string; email: string }>; nextId: () => number }, method: string, path: string, body?: unknown): Reply | null {
  const { can } = ctx;
  if (path === "/api/settings") {
    if (!can.includes("settings.manage")) return err(403, "forbidden");
    if (method === "GET") return { status: 200, body: s.settings };
    const b = body as Partial<Settings>;
    const next = { ...s.settings, ...b };
    if (next.bom_warn_pct >= next.bom_crit_pct) return { status: 422, body: { error: "tolerance_order", key: "bom_warn_pct" } };
    s.settings = next;
    return { status: 200, body: next };
  }
  const roots = ["/api/workspaces", "/api/moulds", "/api/shifts", "/api/reasons", "/api/locations", "/api/professions", "/api/employees"];
  if (!roots.some((r) => path === r || path.startsWith(`${r}/`))) return null;
  if (!can.includes(method === "GET" ? "masterdata.read" : "masterdata.manage")) return err(403, "forbidden");
  const id = path.split("/")[3];
  const names = (b: { name: string; name_am: string }) => !b.name?.trim() || !b.name_am?.trim();
  const nextId = () => String(ctx.nextId());
  const recount = () => s.professions.forEach((p) => (p.employees = s.employees.filter((e) => e.active && e.profession_id === p.id).length));

  if (path.startsWith("/api/workspaces")) {
    if (method === "GET") return { status: 200, body: s.workspaces };
    const mount = /^\/api\/workspaces\/([^/]+)\/moulds\/([^/]+)$/.exec(path);
    if (method === "PUT" && mount) {
      const w = s.workspaces.find((x) => x.id === mount[1]);
      const m = s.moulds.find((x) => x.id === mount[2]);
      if (!w || !m) return err(404, "not_found");
      if (w.kind !== "machine") return err(422, "not_a_machine");
      const b = body as SetupInput;
      if (b.standard_cycle_s && !cycleOk(b.standard_cycle_s)) return err(422, "invalid_cycle_time");
      if (b.colours.some((c) => !cycleOk(c.cycle_s))) return err(422, "invalid_cycle_time");
      const product = ctx.products.find((p) => p.id === m.product_id);
      if (b.colours.some((c) => !product?.colours.some((x) => x.id === c.colour_id))) return err(422, "unknown_colour");
      const fixed = (v: string) => Number(v).toFixed(2);
      const setup = { mould_id: m.id, standard_cycle_s: b.standard_cycle_s ? fixed(b.standard_cycle_s) : null, active: b.active ?? true, colours: (b.active ?? true) ? b.colours.map((c) => ({ ...c, cycle_s: fixed(c.cycle_s) })) : [] };
      w.setups = [...w.setups.filter((x) => x.mould_id !== m.id), setup];
      return { status: 200, body: w };
    }
    const b = body as WorkspaceInput;
    if (names(b)) return err(422, "invalid_input");
    if (s.workspaces.some((x) => x.id !== id && same(x.name, b.name))) return err(409, "duplicate_name");
    if (method === "POST") {
      const w: Workspace = { id: `w${nextId()}`, kind: b.kind ?? "machine", name: b.name, name_am: b.name_am, runs_24h: b.runs_24h ?? true, active: true, setups: [] };
      s.workspaces.push(w);
      return { status: 201, body: w };
    }
    const w = s.workspaces.find((x) => x.id === id);
    if (!w) return err(404, "not_found");
    Object.assign(w, { name: b.name, name_am: b.name_am, kind: b.kind ?? w.kind, runs_24h: b.runs_24h ?? w.runs_24h, active: b.active ?? w.active });
    return { status: 200, body: w };
  }

  if (path.startsWith("/api/moulds")) {
    if (method === "GET") return { status: 200, body: s.moulds };
    const b = body as MouldInput;
    if (names(b)) return err(422, "invalid_input");
    if (b.cavities !== null && (!Number.isInteger(b.cavities) || b.cavities < 1 || b.cavities > 1000)) return err(422, "invalid_cavities");
    if (s.moulds.some((x) => x.id !== id && same(x.name, b.name))) return err(409, "duplicate_name");
    if (method === "POST") {
      if (!ctx.products.some((p) => p.id === b.product_id)) return err(422, "unknown_product");
      const m: Mould = { id: `mo${nextId()}`, product_id: b.product_id ?? "", name: b.name, name_am: b.name_am, cavities: b.cavities, active: true };
      s.moulds.push(m);
      return { status: 201, body: m };
    }
    const m = s.moulds.find((x) => x.id === id);
    if (!m) return err(404, "not_found");
    Object.assign(m, { name: b.name, name_am: b.name_am, cavities: b.cavities, active: b.active ?? m.active });
    return { status: 200, body: m };
  }

  if (path.startsWith("/api/shifts")) {
    if (method === "GET") return { status: 200, body: s.shifts };
    const b = body as ShiftInput;
    if (names(b)) return err(422, "invalid_input");
    if (!clock.test(b.start_time) || !clock.test(b.end_time) || b.start_time === b.end_time) return err(422, "invalid_time");
    if (s.shifts.some((x) => x.id !== id && same(x.name, b.name))) return err(409, "duplicate_name");
    const crosses = b.end_time < b.start_time;
    if (method === "POST") {
      const sh: Shift = { id: `s${nextId()}`, name: b.name, name_am: b.name_am, start_time: b.start_time, end_time: b.end_time, position: b.position ?? 1, active: true, crosses_midnight: crosses };
      s.shifts.push(sh);
      return { status: 201, body: sh };
    }
    const sh = s.shifts.find((x) => x.id === id);
    if (!sh) return err(404, "not_found");
    if ((b.start_time !== sh.start_time || b.end_time !== sh.end_time) && !b.reason?.trim()) return err(422, "reason_required");
    Object.assign(sh, { name: b.name, name_am: b.name_am, start_time: b.start_time, end_time: b.end_time, position: b.position ?? sh.position, active: b.active ?? sh.active, crosses_midnight: crosses });
    return { status: 200, body: sh };
  }

  if (path.startsWith("/api/reasons")) {
    if (method === "GET") return { status: 200, body: s.reasons };
    const b = body as ReasonInput;
    if (names(b)) return err(422, "invalid_input");
    const kind = method === "POST" ? b.kind : s.reasons.find((x) => x.id === id)?.kind;
    if (s.reasons.some((x) => x.id !== id && x.kind === kind && same(x.name, b.name))) return err(409, "duplicate_name");
    if (method === "POST") {
      const r: Reason = { id: `r${nextId()}`, kind: b.kind ?? "damage", name: b.name, name_am: b.name_am, active: true };
      s.reasons.push(r);
      return { status: 201, body: r };
    }
    const r = s.reasons.find((x) => x.id === id);
    if (!r) return err(404, "not_found");
    Object.assign(r, { name: b.name, name_am: b.name_am, active: b.active ?? r.active });
    return { status: 200, body: r };
  }

  if (path.startsWith("/api/locations")) {
    if (method === "GET") return { status: 200, body: s.locations };
    const l = s.locations.find((x) => x.key === id);
    if (!l) return err(404, "not_found");
    const b = body as { name: string; name_am: string };
    if (names(b)) return err(422, "invalid_input");
    Object.assign(l, { name: b.name, name_am: b.name_am });
    return { status: 200, body: l };
  }

  if (path.startsWith("/api/professions")) {
    if (method === "GET") return { status: 200, body: s.professions };
    const b = body as ProfessionInput;
    if (names(b)) return err(422, "invalid_input");
    if (s.professions.some((x) => x.id !== id && same(x.name, b.name))) return err(409, "duplicate_name");
    if (method === "POST") {
      const p: Profession = { id: `pr${nextId()}`, name: b.name, name_am: b.name_am, active: true, employees: 0 };
      s.professions.push(p);
      return { status: 201, body: p };
    }
    const p = s.professions.find((x) => x.id === id);
    if (!p) return err(404, "not_found");
    Object.assign(p, { name: b.name, name_am: b.name_am, active: b.active ?? p.active });
    return { status: 200, body: p };
  }

  // employees
  if (method === "GET") return { status: 200, body: s.employees };
  const b = body as EmployeeInput;
  if (!b.full_name?.trim()) return err(422, "invalid_input");
  if (!s.professions.some((p) => p.id === b.profession_id)) return err(422, "unknown_profession");
  const user = b.user_id ? ctx.users.find((x) => x.id === b.user_id) : undefined;
  if (b.user_id && !user) return err(422, "unknown_user");
  if (b.user_id && s.employees.some((e) => e.id !== id && e.user_id === b.user_id)) return err(409, "account_linked");
  const fields = { full_name: b.full_name.trim(), name_am: b.name_am?.trim() || null, profession_id: b.profession_id, user_id: b.user_id ?? null, email: user?.email ?? null };
  if (method === "POST") {
    const e: Employee = { id: `e${nextId()}`, ...fields, active: true };
    s.employees.push(e);
    recount();
    return { status: 201, body: e };
  }
  const e = s.employees.find((x) => x.id === id);
  if (!e) return err(404, "not_found");
  Object.assign(e, fields, { active: b.active ?? e.active });
  recount();
  return { status: 200, body: e };
}
