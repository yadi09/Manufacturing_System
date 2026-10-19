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

- Planning documents: done and pushed to `main`.
- Milestone 1 (Foundation): in progress on `feature/foundation`. Done: repo skeleton, Go API with `settings` and append-only `audit_log`, frontend shell with English/Amharic and PWA, Playwright screenshot script, shared calendar module (Go and TypeScript, tested against ICU vectors, with the shift-day rule). Also done: login and roles on the backend (sessions, lockout, user management API, PRs #2 and #3), the design system and login mockups (approved), and the React design system plus sign-in screen built from them (`feature/login-screen`). Next: a user-management screen (needs a mockup), then Milestone 2 master data mockups.
- Durations for milestones have not been estimated; give them after milestone 1.

## Still open

- Day shift report and egg tray report from Crown (not available yet).
- Maximum regrind percentage, if Crown has one.
- Real list of colors, machines and shift times, entered as data when known.
- Amharic translation review by a native speaker before rollout, including the calendar month, weekday and date-format strings.
- CI: not set up yet. The screenshot script uses the installed Google Chrome; a CI server needs its own browser setup.
