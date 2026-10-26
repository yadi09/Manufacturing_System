// An in-memory stand-in for the API, shared by the unit tests and the Playwright screenshots.
// The real rules are tested against PostgreSQL in the backend; this only has to answer like the server does.
import type { RoleInfo, UserSummary } from "../api";
import type { User } from "../../auth/api";
import type { Colour, Material, MaterialInput, Product, ProductInput } from "../../masterdata/api";
import { MATERIALS, PRODUCTS } from "../../masterdata/testing/masterFixtures";
import type { NewRecipe, Recipe } from "../../masterdata/recipeApi";
import { EGG_VERSIONS, JAR_VERSIONS, summaryOf } from "../../masterdata/testing/recipeFixtures";
import { createSetupData, setupHandle, type SetupData } from "../../setup/testing/setupHandle";

export const ROLES: RoleInfo[] = [
  ["admin", "Administrator", "አስተዳዳሪ", "Manages users, settings and master data.", "ተጠቃሚዎችን፣ ቅንብሮችን እና መሠረታዊ መረጃን ያስተዳድራል።", ["audit.read", "settings.manage", "users.manage"]],
  ["owner", "Owner / GM", "ባለቤት / ዋና ሥራ አስኪያጅ", "Sees the live board, dashboards and all reports.", "የቀጥታ ሰሌዳውን፣ ዳሽቦርዶችን እና ሁሉንም ሪፖርቶች ያያል።", ["audit.read"]],
  ["cashier", "Cashier / sales", "ገንዘብ ተቀባይ / ሽያጭ", "Issues receipts, records samples and pay-later sales, sees available stock only.", "ደረሰኝ ይሰጣል፣ ናሙና እና በኋላ ክፍያን ይመዘግባል፣ ያለውን ክምችት ብቻ ያያል።", []],
  ["production_manager", "Production manager", "የምርት ሥራ አስኪያጅ", "Reviews and edits production plans, manages shifts, approves overrides.", "የምርት ዕቅዶችን ይገመግማል እና ያርማል፣ ፈረቃዎችን ያስተዳድራል፣ ማስተካከያዎችን ያጸድቃል።", []],
  ["shift_supervisor", "Shift supervisor", "የፈረቃ ተቆጣጣሪ", "Requests daily material, updates assignments, closes the shift report.", "የዕለቱን ጥሬ ዕቃ ይጠይቃል፣ ምደባዎችን ያዘምናል፣ የፈረቃ ሪፖርት ይዘጋል።", []],
  ["store_raw", "Store manager, raw material", "የጥሬ ዕቃ መጋዘን ኃላፊ", "Approves and issues raw material, weighs leftovers at handover.", "ጥሬ ዕቃ ያጸድቃል እና ይሰጣል፣ ቀሪውን ይመዝናል።", []],
  ["store_fg", "Store manager, finished goods", "የተጠናቀቀ ምርት መጋዘን ኃላፊ", "Approves finished goods into stock and releases deliveries.", "የተጠናቀቀ ምርትን ወደ ክምችት ያጸድቃል እና ርክክቦችን ይለቃል።", []],
  ["qc_inspector", "QC inspector", "የጥራት ተቆጣጣሪ", "Inspects output and records finished and damaged quantities.", "ምርትን ይመረምራል፣ የተጠናቀቀ እና የተበላሸ መጠን ይመዘግባል።", []],
  ["purchaser", "Purchaser", "ግዢ ፈጻሚ", "Edits and approves purchase orders and records receiving.", "የግዢ ትዕዛዞችን ያርማል እና ያጸድቃል፣ ደርሶ መቀበልን ይመዘግባል።", []],
  ["finance", "Finance", "ፋይናንስ", "Reads production and reconciliation reports.", "የምርት እና የማስታረቂያ ሪፖርቶችን ያነባል።", []],
].map(([key, name, name_am, description, description_am, permissions]) => ({ key, name, name_am, description, description_am, permissions }) as RoleInfo);

const u = (id: string, full_name: string, email: string, roles: string[], active = true): UserSummary => ({ id, full_name, email, roles, active, must_change_password: false });

/** Invented people. Three have Ethiopic names and one a very long name, to test real-world text. */
export const USERS: UserSummary[] = [
  u("u1", "Abebe Kebede", "abebe.kebede@example.com", ["admin"]),
  u("u2", "ሠላም ታደሰ", "selam.tadesse@example.com", ["cashier"]),
  u("u3", "Dawit Alemu", "dawit.alemu@example.com", ["production_manager"]),
  u("u4", "Meron Haile", "meron.haile@example.com", ["shift_supervisor", "qc_inspector"]),
  u("u5", "Yonas Bekele", "yonas.bekele@example.com", ["purchaser"]),
  u("u6", "ሃና ግርማ", "hanna.girma@example.com", ["store_raw"]),
  u("u7", "Tesfaye Worku", "tesfaye.worku@example.com", ["purchaser", "qc_inspector"], false),
  u("u8", "Tigist Wolde-Michael Gebreselassie", "tigist.wolde-michael.gebreselassie@example-company.example", ["purchaser"]),
  u("u9", "ብሩክ አሰፋ", "biruk.assefa@example.com", ["finance", "owner"]),
  u("u10", "Rahel Teshome", "rahel.teshome@example.com", ["store_fg"]),
];

export const ADMIN_ME: User = {
  id: "u1",
  email: "abebe.kebede@example.com",
  full_name: "Abebe Kebede",
  must_change_password: false,
  permissions: ["audit.read", "settings.manage", "users.manage", "masterdata.read", "masterdata.manage"],
  preferences: { language: null, calendar: null },
  roles: [{ key: "admin", name: "Administrator", name_am: "አስተዳዳሪ" }],
};

export interface Reply {
  status: number;
  body?: unknown;
  headers?: Record<string, string>;
}

export interface Call {
  method: string;
  path: string;
  body?: unknown;
}

export interface FakeOptions {
  users?: UserSummary[];
  materials?: Material[];
  products?: Product[];
  /** Recipe versions by colour id. Defaults to the egg tray and jar cover fixtures. */
  recipes?: Record<string, Recipe[]>;
  me?: User | null;
  /** Machines, moulds, shifts, reasons, stores, employees and settings. Defaults to Crown's. */
  setup?: SetupData;
  /** Make a request type fail, for example { "GET /api/users": 500 }. */
  failing?: Record<string, number>;
}

export function createFakeServer(options: FakeOptions = {}) {
  const users = (options.users ?? USERS).map((x) => ({ ...x, roles: [...x.roles] }));
  // The signed-in person, and the password they have now (for the change-password endpoint).
  let me: User | null = options.me === undefined ? ADMIN_ME : options.me;
  const currentPassword = "current-password-1";
  const calls: Call[] = [];
  const materials = (options.materials ?? MATERIALS).map((m) => ({ ...m }));
  const products = (options.products ?? PRODUCTS).map((p) => ({ ...p, colours: p.colours.map((c) => ({ ...c })) }));
  const recipes: Record<string, Recipe[]> = options.recipes ?? { c1: EGG_VERSIONS.map((r) => ({ ...r })), c2: JAR_VERSIONS.map((r) => ({ ...r })) };
  let nextId = 100;
  const setup = createSetupData(options.setup);
  const adminCount = () => users.filter((x) => x.active && x.roles.includes("admin")).length;

  const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

  /** Recipes: the version in use, the history, and saving the next version (with the server's refusals). */
  function recipeHandle(method: string, path: string, body?: unknown): Reply | null {
    const m = /^\/api\/colours\/([^/]+)\/recipe(\/versions(?:\/(\d+))?)?$/.exec(path);
    if (!m) return null;
    const can = me?.permissions ?? [];
    if (!can.includes(method === "GET" ? "masterdata.read" : "masterdata.manage")) return { status: 403, body: { error: "forbidden" } };
    const colourId = m[1];
    const known = products.some((p) => p.colours.some((c) => c.id === colourId));
    if (!known) return { status: 404, body: { error: "not_found" } };
    const versions = recipes[colourId] ?? [];
    if (method === "GET" && !m[2]) {
      const active = versions.find((v) => v.status === "active");
      return active ? { status: 200, body: active } : { status: 404, body: { error: "no_recipe" } };
    }
    if (method === "GET" && m[2] && !m[3]) return { status: 200, body: [...versions].reverse().map(summaryOf) };
    if (method === "GET" && m[3]) {
      const v = versions.find((x) => x.version === Number(m[3]));
      return v ? { status: 200, body: v } : { status: 404, body: { error: "not_found" } };
    }
    if (method === "POST" && m[2] && !m[3]) {
      const b = body as NewRecipe;
      const latest = versions.length;
      if (b.base_version !== latest) return { status: 409, body: { error: "version_conflict" } };
      if (!b.reason.trim()) return { status: 422, body: { error: "reason_required" } };
      if (b.lines.length === 0) return { status: 422, body: { error: "no_ingredients" } };
      const bad = b.lines.find((l) => !/^\d{1,9}(\.\d{1,6})?$/.test(l.qty) || Number(l.qty) <= 0);
      if (bad) return { status: 422, body: { error: "invalid_quantity" } };
      const product = products.find((p) => p.colours.some((c) => c.id === colourId))!;
      const next: Recipe = {
        colour_id: colourId, version: latest + 1, status: "active", reason: b.reason.trim(), created_by: me?.email ?? "", created_at: new Date().toISOString(), replaced_at: null, sale_unit: product.sale_unit,
        lines: b.lines.map((l) => { const mat = materials.find((x) => x.id === l.item_id)!; return { item_id: l.item_id, kind: mat.kind, name: mat.name, name_am: mat.name_am, qty: l.qty, unit: l.unit }; }),
        regrind: b.regrind.map((r) => { const src = products.find((x) => x.id === r.source_product_id)!; return { source_product_id: r.source_product_id, name: src.name, name_am: src.name_am, max_blend_pct: r.max_blend_pct }; }),
        warn_pct: b.warn_pct, crit_pct: b.crit_pct, effective_warn_pct: b.warn_pct ?? "5", effective_crit_pct: b.crit_pct ?? "10",
      };
      versions.forEach((v) => { if (v.status === "active") { v.status = "replaced"; v.replaced_at = next.created_at; } });
      versions.push(next);
      recipes[colourId] = versions;
      const colour = product.colours.find((c) => c.id === colourId)!;
      colour.active_version = next.version;
      return { status: 201, body: next };
    }
    return { status: 404, body: { error: "not_found" } };
  }

  /** Materials, products and colours. Answers like the real server, including its refusals. */
  function masterHandle(method: string, path: string, body?: unknown): Reply | null {
    if (!path.startsWith("/api/materials") && !path.startsWith("/api/products") && !path.startsWith("/api/colours")) return null;
    const can = me?.permissions ?? [];
    const write = method !== "GET";
    if (!can.includes(write ? "masterdata.manage" : "masterdata.read")) return { status: 403, body: { error: "forbidden" } };
    const positive = (v: string) => /^\d{1,9}(\.\d{1,3})?$/.test(v.trim()) && Number(v) > 0;

    if (method === "GET" && path === "/api/materials") return { status: 200, body: materials };
    if (method === "POST" && path === "/api/materials") {
      const b = body as MaterialInput;
      if (materials.some((m) => sameName(m.name, b.name))) return { status: 409, body: { error: "duplicate_name" } };
      if (b.bag_qty && !positive(b.bag_qty)) return { status: 422, body: { error: "invalid_quantity" } };
      const m: Material = { id: `m${nextId++}`, kind: b.kind ?? "raw_material", name: b.name, name_am: b.name_am, unit: b.unit ?? "kg", bag_qty: b.bag_qty, active: true, used_in: 0 };
      materials.push(m);
      return { status: 201, body: m };
    }
    const mat = /^\/api\/materials\/([^/]+)$/.exec(path);
    if (method === "PATCH" && mat) {
      const m = materials.find((x) => x.id === mat[1]);
      if (!m) return { status: 404, body: { error: "not_found" } };
      const b = body as MaterialInput;
      if (materials.some((x) => x.id !== m.id && sameName(x.name, b.name))) return { status: 409, body: { error: "duplicate_name" } };
      Object.assign(m, { name: b.name, name_am: b.name_am, bag_qty: b.bag_qty, active: b.active ?? m.active });
      return { status: 200, body: m };
    }

    if (method === "GET" && path === "/api/products") return { status: 200, body: products };
    if (method === "POST" && path === "/api/products") {
      const b = body as ProductInput;
      if (products.some((p) => sameName(p.name, b.name))) return { status: 409, body: { error: "duplicate_name" } };
      if (!positive(b.package_qty)) return { status: 422, body: { error: "invalid_quantity" } };
      const p: Product = { id: `p${nextId++}`, name: b.name, name_am: b.name_am, sale_unit: b.sale_unit, package_qty: b.package_qty, weight_per_piece_g: b.weight_per_piece_g, active: true, colours: [] };
      products.push(p);
      return { status: 201, body: p };
    }
    const prod = /^\/api\/products\/([^/]+)$/.exec(path);
    if (method === "PATCH" && prod) {
      const p = products.find((x) => x.id === prod[1]);
      if (!p) return { status: 404, body: { error: "not_found" } };
      const b = body as ProductInput;
      if (products.some((x) => x.id !== p.id && sameName(x.name, b.name))) return { status: 409, body: { error: "duplicate_name" } };
      if (b.sale_unit !== p.sale_unit && p.colours.some((c) => c.active_version !== null)) return { status: 409, body: { error: "unit_locked" } };
      if (!positive(b.package_qty)) return { status: 422, body: { error: "invalid_quantity" } };
      Object.assign(p, { name: b.name, name_am: b.name_am, sale_unit: b.sale_unit, package_qty: b.package_qty, weight_per_piece_g: b.weight_per_piece_g, active: b.active ?? p.active });
      return { status: 200, body: p };
    }
    const addColour = /^\/api\/products\/([^/]+)\/colours$/.exec(path);
    if (method === "POST" && addColour) {
      const p = products.find((x) => x.id === addColour[1]);
      if (!p) return { status: 404, body: { error: "not_found" } };
      const b = body as { name: string; name_am: string };
      if (p.colours.some((c) => sameName(c.name, b.name))) return { status: 409, body: { error: "duplicate_name" } };
      const c: Colour = { id: `c${nextId++}`, product_id: p.id, name: b.name, name_am: b.name_am, active: true, active_version: null };
      p.colours.push(c);
      return { status: 201, body: c };
    }
    const col = /^\/api\/colours\/([^/]+)$/.exec(path);
    if (method === "PATCH" && col) {
      for (const p of products) {
        const c = p.colours.find((x) => x.id === col[1]);
        if (!c) continue;
        const b = body as { name: string; name_am: string; active?: boolean };
        if (p.colours.some((x) => x.id !== c.id && sameName(x.name, b.name))) return { status: 409, body: { error: "duplicate_name" } };
        Object.assign(c, { name: b.name, name_am: b.name_am, active: b.active ?? c.active });
        return { status: 200, body: c };
      }
      return { status: 404, body: { error: "not_found" } };
    }
    return { status: 404, body: { error: "not_found" } };
  }

  function handle(method: string, path: string, body?: unknown): Reply {
    calls.push({ method, path, body });
    const failStatus = options.failing?.[`${method} ${path}`];
    if (failStatus) return { status: failStatus, body: { error: failStatus === 0 ? "network" : "internal" } };

    if (method === "GET" && path === "/api/auth/me") return me === null ? { status: 401, body: { error: "unauthenticated" } } : { status: 200, body: me };
    if (method === "POST" && path === "/api/auth/password") {
      if (me === null) return { status: 401, body: { error: "unauthenticated" } };
      const b = body as { current_password: string; new_password: string };
      if (b.current_password !== currentPassword) return { status: 403, body: { error: "wrong_password" } };
      if (b.new_password.length < 10) return { status: 422, body: { error: "weak_password" } };
      if (b.new_password === b.current_password) return { status: 422, body: { error: "password_unchanged" } };
      me = { ...me, must_change_password: false };
      return { status: 204 };
    }
    if (method === "PATCH" && path === "/api/auth/preferences") {
      if (me === null) return { status: 401, body: { error: "unauthenticated" } };
      const b = body as { language?: "en" | "am"; calendar?: "ethiopian" | "gregorian" };
      me = { ...me, preferences: { language: b.language ?? me.preferences.language, calendar: b.calendar ?? me.preferences.calendar } };
      return { status: 204 };
    }
    if (me?.must_change_password && path !== "/api/auth/me") return { status: 403, body: { error: "password_change_required" } };
    if (method === "GET" && path === "/api/roles") return { status: 200, body: ROLES };
    if (method === "GET" && path === "/api/users") return { status: 200, body: users };

    if (method === "POST" && path === "/api/users") {
      const b = body as { email: string; full_name: string; password: string; roles: string[] };
      if (b.password.length < 10) return { status: 422, body: { error: "weak_password" } };
      if (users.some((x) => x.email === b.email.toLowerCase())) return { status: 409, body: { error: "email_taken" } };
      users.push({ id: `u${nextId++}`, email: b.email.toLowerCase(), full_name: b.full_name, roles: b.roles, active: true, must_change_password: true });
      return { status: 201, body: {} };
    }

    const setupReply = setupHandle(setup, { can: me?.permissions ?? [], products, users, nextId: () => nextId++ }, method, path, body);
    if (setupReply) return setupReply;
    const recipe = recipeHandle(method, path, body);
    if (recipe) return recipe;
    const master = masterHandle(method, path, body);
    if (master) return master;

    const patch = /^\/api\/users\/([^/]+)$/.exec(path);
    if (method === "PATCH" && patch) {
      const target = users.find((x) => x.id === patch[1]);
      if (!target) return { status: 404, body: { error: "user_not_found" } };
      const b = body as { full_name?: string; active?: boolean; roles?: string[] };
      const wasAdmin = target.active && target.roles.includes("admin");
      const willBeAdmin = (b.active ?? target.active) && (b.roles ?? target.roles).includes("admin");
      if (wasAdmin && !willBeAdmin && adminCount() === 1) return { status: 409, body: { error: "last_admin" } };
      if (b.full_name !== undefined) target.full_name = b.full_name;
      if (b.active !== undefined) target.active = b.active;
      if (b.roles !== undefined) target.roles = b.roles;
      return { status: 204 };
    }

    const reset = /^\/api\/users\/([^/]+)\/password$/.exec(path);
    if (method === "POST" && reset) {
      const target = users.find((x) => x.id === reset[1]);
      if (!target) return { status: 404, body: { error: "user_not_found" } };
      if ((body as { password: string }).password.length < 10) return { status: 422, body: { error: "weak_password" } };
      target.must_change_password = true;
      return { status: 204 };
    }
    return { status: 404, body: { error: "not_found" } };
  }

  return { handle, calls, users, materials, products, recipes, setup, currentPassword };
}

/** A fetch() that answers from the fake server. */
export function fakeFetch(server: ReturnType<typeof createFakeServer>) {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const path = typeof input === "string" ? input : input.toString();
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    const reply = server.handle(init?.method ?? "GET", path, body);
    if (reply.status === 204) return new Response(null, { status: 204 });
    return new Response(JSON.stringify(reply.body ?? {}), { status: reply.status, headers: { "Content-Type": "application/json", ...reply.headers } });
  };
}
