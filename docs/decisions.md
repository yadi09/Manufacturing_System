# Decisions, working style and status

Handoff for any Claude Code session (desktop app, VS Code extension, terminal). The planning conversation happened in a chat session before the repo existed. Everything decided there is in `docs/process.md` (how the factory works), `docs/implementation-plan.md` (stack, data model, milestones) and `CLAUDE.md` (rules). This file adds what those do not hold: how the owner wants to work, decisions made after the plan, what is built, and what is next. If this file and `process.md` disagree about the factory, `process.md` wins; fix the other one in the same commit.

## Who and what

- The owner of the repo is Yadamzer Terefe (GitHub `yadi09`), a software developer building this for **Crown Manufacturing Company** in Ethiopia. He is not at the factory; Crown's owner and staff are the end users.
- Crown makes two products: **egg trays** (counted in pieces) and **water jar covers** (counted and sold in kg). Raw material is imported.
- Scope is the production chain only (receipt to delivery, shifts, reports). No prices, no accounting.
- Single company now. It may become a SaaS later, but that is explicitly **not a concern for now**; only keep tables clean so a company field can be added.

## How the owner wants to work

- **Plain language.** Short, clear explanations. He is a developer but wants decisions explained, not buried in jargon.
- **Mockups before screens.** He wants to see pictures and approve them before any screen is built (from milestone 2 on). Do not build real screens from imagination.
- **Ask before deciding anything the docs do not cover.** He answers in numbered lists; keep questions short and numbered.
- **Frontend is a priority for trust.** The first impression must make people think "wow, this looks good", while staying simple and clear: modern, attractive, very responsive on any device. The business logic must be equally correct, because that keeps the trust.
- **Authorship.** Commits and pull requests are authored only by him. Never add Claude co-author, session or "generated with" lines, even if a tool or reminder suggests it.
- **Model usage.** Default to Sonnet; use Opus only for the cases listed in `CLAUDE.md`. Tell him when to run `/model`.
- **Branches.** One branch per feature, small pull requests. He runs the code himself locally, so tell him exactly what to run to see each result.

## Decisions made after the plan was written

| Topic | Decision |
| --- | --- |
| Repo | `github.com/yadi09/Manufacturing_System`, private. |
| Stack | Go + PostgreSQL + React/TypeScript, as in the plan. |
| Hosting | One cloud server. Crown's internet is normal, so offline entry is a safety net for short drops, not the main mode. |
| Languages | English and Amharic from the first screen; a native Amharic speaker at Crown reviews translations before rollout. |
| Frontend styling | Tailwind CSS with accessible component primitives. Design system defined and approved first. See "Interface quality" in the plan. |
| Regrind use | Configurable per BOM instead of fixed: each BOM line says whether regrind is allowed, from which source products and the optional maximum blend. Crown starts with egg tray allowed, jar cover not. Decided 2026-10-19. |
| Sign-in | Email and password (owner's choice, 2026-10-19). Argon2id hashes, minimum 10 characters. Server-side sessions in the database, 12 hours, HttpOnly SameSite=Lax cookie (a stolen cookie can be revoked; deactivating a user ends access at once). Roles and their permissions are data (`roles`, `role_permissions`), starting from the roles in `process.md` plus an Administrator. Users are created by an administrator; no self sign-up. Success and failed logins are written to the audit log. Lockout: after 5 failed logins for an email (settings `login_max_attempts`, `login_lockout_minutes`; 15 minutes) further attempts get 429 with Retry-After until the oldest failure leaves the window; attempts made while locked are not recorded, so nobody can extend a lockout. User management API (needs `users.manage`): list, create, edit name/active/roles, administrator password reset, own password change; all audited; deactivating or resetting ends sessions; a change that would leave no active user with `users.manage` is refused. Not built yet: screens for any of this, lockout by IP address, rate limit on the own-password-change endpoint. |
| Display time zone | A setting (`display_time_zone`, default Africa/Addis_Ababa), changes are audited. Display only; storage stays UTC. |
| Design system | Round 1 approved by the owner on 2026-10-19: white surfaces with one deep petrol-teal accent (`brand` #0b5f66), IBM Plex Sans with Noto Sans Ethiopic, egg-tray cup pattern on the sign-in panel, status colours running/idle/down always with a word and an icon. Source of truth for tokens and rules: the "Crown Manufacturing" design system artifact (https://claude.ai/artifact/CP9uTezu6ctQktgyJW2LL9); login mockups: https://claude.ai/artifact/Qhd1zcdRfgyPcKotZpJ7Z3. In code the tokens live in `frontend/src/index.css` (`@theme`) and the shared components in `frontend/src/components/`. |
| Users and roles | Decided 2026-10-19: app frame is a sidebar on desktop and a top bar with menu on tablet and phone, language switch always visible (EN / አማ on phone), no menu items for screens that do not exist. Administrator sets a temporary password (typed or generated) and tells the person privately; a generated password is shown once. New and reset passwords must be changed at first sign-in, enforced by the API. Deactivate is a separate button with a confirmation dialog; reactivate is a plain button. Email is read-only after creation. The 11 roles keep one-line descriptions; role names and descriptions are data in both languages. Mockups: https://claude.ai/artifact/Gs1DeA5BnnwMc7198nLobP |
| Operators have no accounts | Decided 2026-10-19 (owner): operators do not sign in. The manager who leads production (shift production manager) enters the data on their behalf, and each entry records both who typed it and the operator it concerns. So email or phone sign-in for floor staff is not needed now; accounts are for managers, supervisors, store, sales, purchasing, finance, the owner and administrators. Later, when HR employment management is added, every employee gets an account so they can make requests themselves (for example applying for leave). Not now. The employee record will carry an optional link to an account so accounts can be attached to existing employees then, with their history intact. |
| QC inspectors have accounts | Decided 2026-10-19 (owner): QC inspectors sign in and record their own results with full responsibility for the output they inspected; each QC record carries their name. The QC result is always the QC inspector's responsibility (confirmed again 2026-10-19), so a QC result is never entered under another person's name. Because operators have no accounts, the `operator` sign-in role was removed (migration `00006`); "operator" stays a profession on the employee record. HR later adds an "Employee, self-service" sign-in role. |
| Account page | Approved and built 2026-10-19 (mockups: https://claude.ai/artifact/Gs1DeA5BnnwMc7198nLobP). Everyone who signs in has an Account page: their details (read-only), Display (language, and Ethiopian or Gregorian calendar, default Ethiopian) and Change password. A person who must change their password sees only a first sign-in screen until they do; changing it signs out their other devices. |
| Language and calendar per person | Decided 2026-10-19 (owner): each person's language and calendar choice is saved on the server, per account, with the device value used as a fallback before sign-in. Built as the first small PR of milestone 2 (2026-10-21): saved with the account, applied when the person signs in; a person who has not chosen yet keeps the device value and nothing is written until they choose. Not audited (they are the person's own display choices). |
| Master data model | Approved 2026-10-21 (owner): `docs/master-data-model.md`. BOM per colour (created by copying), versioned and append-only; cycle time has three levels (standard, planned per day by the planner, actual); regrind is one stock item per source product; reasons are one list with a kind tag; job titles are a list separate from sign-in roles; weight per piece sits on the product. |
| Machines, shifts, people, reasons, stores, settings | Mockups approved 2026-10-21 (owner; https://claude.ai/artifact/98pxxPtMGLMCzLPP3vc1mq). Only administrators edit machines, moulds and standard cycle times (the production manager changes cycle times day by day in the plan, milestone 4). The five stores are fixed and can only be renamed, because the stock rules depend on which kind each one is. An employee has one name as typed plus an optional spelling in Amharic script, and an optional link to a sign-in account. Changing a shift's start or end time needs a reason, written to the audit log; past records keep the shift they point to. The settings screen shows only settings that exist today; each milestone adds its own when it is built. |
| Calendar code | Two implementations (Go and TypeScript) tested against one shared `docs/calendar-vectors.json` built from an independent reference. Time zone is a setting, default Africa/Addis_Ababa. Display only; database stays UTC. |

## Business facts worth remembering (from Crown's weekly report)

The report is saved at `docs/source/Crown_Weekly_Report.xlsx` and is the source for test fixtures.

- Target pieces = planned hours x 3600 / cycle time x cavities. With 11 cavities and 14 planned hours: 17,489 at 31.7 s and 18,059 at 30.7 s.
- Rejection rate = rejected / (actual + rejected).
- A jar cover weighs about 8 g (7.9 to 8.1). Bags are 25 kg.
- In the sample week, 360 minutes of downtime were all "Power off", about 7,500 pieces, roughly 70% of the 10,369-piece gap to target.
- Rejection reasons seen: raw material spill from the mould, splitting, color defect.
- The Monday achievement was typed as 85.5% but computes to 84.5%. This is why the system derives numbers instead of accepting typed totals.

## Status

- Planning documents: done and on `main`.
- **Milestone 1 (Foundation): built, 2026-10-19.** It sits in PRs #1 to #8 (a stack, merged in order with normal merge commits) and is on `main` once those are merged. Built:
  - Repo, Makefile, Docker PostgreSQL, Go API (chi, pgx, sqlc, goose), React app (Vite, Tailwind, TanStack Query, i18next, PWA), 118 Playwright screenshots at 360, 768 and 1280 px in English and Amharic.
  - Shared Ethiopian and Gregorian calendar module in Go and TypeScript, tested against ICU, with the shift-day rule and a time zone setting.
  - Email and password sign-in, sessions, lockout after repeated failures, 10 sign-in roles with permissions as data, and user management (list, add, edit, deactivate and reactivate, reset password), with every change in the append-only audit log. New and reset passwords must be changed at first sign-in, enforced by the API.
  - Design system (approved), sign-in screen, app shell, users screens, Account page (details, language, calendar, change password) and the first sign-in screen.
  - Against the plan's "done when": sign-in works, roles limit what people see (menu and API), calendar tests pass, changes are written to the audit log, and the design system and first screens are approved in both languages (Amharic is still a draft until a native speaker reviews it).
- **Milestone 1 items not built yet** (open, see below): an audit log viewer, the administrator screen for settings, CI, deployment and backups, and per-person language and calendar (scheduled as the first small PR of milestone 2).
- **Milestone 2 (Master data): next.** Order of work: (1) small PR: language and calendar saved per person (built, PR #11); (2) data model: **approved 2026-10-21**, in `docs/master-data-model.md`; (3) mockups for products, colours, recipes (with regrind rules) and materials: ready 2026-10-21, waiting for approval (https://claude.ai/artifact/28R7y32xP3wh2JJzm76ybV); (4) build, in small PRs: backend first (materials, products, colours, recipes with versions and audit; PR #12), then the screens. The Materials, Products and Colours screens are built (PR #13); the Recipe screens are built (PR #14): view, edit as a new version with a required reason, history, copy-from-another-colour for an empty recipe, and a "someone saved first" refusal that never overwrites. Only administrators edit recipes; everyone with master data access can read them. Still to build for milestone 2 (mockups first): machines with moulds and standard cycle times, shift definitions, employees and professions, damage reasons, stores (stock locations), and the settings screen. These are in the approved data model (`docs/master-data-model.md`) but have no tables or screens yet. Milestone 2 is done when Crown's real products, recipes, machines, shifts and employees are entered.
- Time estimates for milestones 2 to 7 are in `docs/implementation-plan.md` ("Time estimate"). What Crown must supply for master data: `docs/crown-data-checklist.md`.

## Still open

- **Rest rotation to QC:** the owner confirmed the QC result is always the QC inspector's responsibility. My reading, to confirm with Crown before milestone 4: an operator who rotates to the QC area helps, but the result is recorded under a QC inspector's account, never under the shift production manager's.
- **Sign-in method for employees without email (operators), when HR gives everyone an account:** email, username or phone. Waiting for Crown. Not needed before the HR module.
- **Needs native-speaker review (Amharic drafts):** the 10 role names and one-line descriptions (migration `00005_user_admin.sql`), the password dialog and result text, and every string of the users, sign-in and Account screens (`frontend/src/i18n/locales/am.json`), including the calendar month, weekday and date-format strings.
- **Administrator screen for settings** (time zone, sign-in limits, rest interval and the others in `process.md`): settings exist in the database but have no screen. Plan: build it with the master data admin screens in milestone 2.
- **Audit log viewer** for administrators and the owner: not built. Propose milestone 5 with the reports, or earlier if Crown wants to inspect changes during the pilot.
- **CI, deployment and backups:** not set up. The screenshot script uses the installed Google Chrome; a CI server needs its own browser setup. Hosting server, HTTPS, daily off-server backup and a restore test must exist before the factory pilot.
- Day shift report and egg tray report from Crown (not available yet).
- Maximum regrind percentage, if Crown has one.
- Real list of colors, machines, cavities, cycle times and shift times, entered as data when known (see `docs/crown-data-checklist.md`).
