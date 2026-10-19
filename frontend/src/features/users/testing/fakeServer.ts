// An in-memory stand-in for the API, shared by the unit tests and the Playwright screenshots.
// The real rules are tested against PostgreSQL in the backend; this only has to answer like the server does.
import type { RoleInfo, UserSummary } from "../api";
import type { User } from "../../auth/api";

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
  permissions: ["audit.read", "settings.manage", "users.manage"],
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
  me?: User | null;
  /** Make a request type fail, for example { "GET /api/users": 500 }. */
  failing?: Record<string, number>;
}

export function createFakeServer(options: FakeOptions = {}) {
  const users = (options.users ?? USERS).map((x) => ({ ...x, roles: [...x.roles] }));
  // The signed-in person, and the password they have now (for the change-password endpoint).
  let me: User | null = options.me === undefined ? ADMIN_ME : options.me;
  const currentPassword = "current-password-1";
  const calls: Call[] = [];
  let nextId = 100;
  const adminCount = () => users.filter((x) => x.active && x.roles.includes("admin")).length;

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

  return { handle, calls, users, currentPassword };
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
