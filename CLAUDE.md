# CLAUDE.md

Production management system for Crown Manufacturing Company (Ethiopia). It covers the production chain only (receipt, order, reservation, production, QC, stock, delivery, shifts, reports), not full ERP or accounting.

Read these first:
- `docs/process.md`: how the factory works. Source of truth. Update it in the same commit as any rule change.
- `docs/implementation-plan.md`: stack, data model, milestones, testing, repo layout.
- `docs/decisions.md`: how the owner wants to work, later decisions, current status, open items.

## Stack

- Backend: Go (chi, pgx, sqlc, goose migrations), in `backend/`
- Database: PostgreSQL
- Frontend: React + TypeScript (Vite, Tailwind CSS, TanStack Query, i18next, PWA), in `frontend/`
- Hosting: one cloud server. Factory internet is normal; offline entry is a safety net.
- Contract: `api/openapi.yaml`; TypeScript API types are generated from it
- Live updates: Server-Sent Events fed by PostgreSQL LISTEN/NOTIFY

Commands (run from the repo root). First time: `cp .env.example .env` and `cd frontend && pnpm install`. Needs Go, Node with pnpm, and Docker (PostgreSQL 16 on port 5433).
- `make db-up` / `make db-down`: start/stop local PostgreSQL (also creates `crown_test`)
- `make migrate`: apply goose migrations to the dev database (goose runs as a Go tool, nothing to install)
- `make sqlc`: regenerate Go query code from `backend/queries` and `backend/migrations` (needs `sqlc` on PATH, e.g. `~/go/bin`)
- `make dev`: start PostgreSQL, migrate, run the API on `:8080` and the web app on `:5173` (Vite proxies `/healthz` to the API); Ctrl+C stops both
- `make test`: backend tests, including integration tests against real PostgreSQL (`crown_test`, reset on each run) and the calendar tests, then frontend unit tests (vitest)
- `make lint`: `go vet`, `gofmt` check, then TypeScript and ESLint for the frontend
- `make screenshots`: Playwright captures each page and state (sign-in, users, Account and first sign-in screens, panels, dialogs, errors, empty and loading) at 360/768/1280 px in English and Amharic into `frontend/screenshots/` (git-ignored; 118 images, about 3 minutes; it also fails on any sideways scroll). The API is answered by an in-memory fake (`frontend/src/features/users/testing/fakeServer.ts`, also used by the unit tests). It uses the installed Google Chrome (`channel: "chrome"`), because Playwright's own Chromium does not support Ubuntu 20.04. A CI server needs its own browser setup (install Chrome, or use Playwright's Chromium on a supported OS).
- `make create-user EMAIL=... NAME="..." ROLES=admin`: create a user (asks for the password, hidden; there is no sign-up page). Role keys are in migration `00003_auth.sql`; run `make migrate` first. The user is not forced to change the password (the developer chose it); add `CREATE_USER_FLAGS=-must-change` when someone else will be told it
- `make calendar-vectors`: regenerate `docs/calendar-vectors.json` from ICU (Node's Intl). Never generate it from our own calendar code.

Frontend: colours, type and radii come from the approved design system; tokens are in `frontend/src/index.css` (`@theme`) and shared components in `frontend/src/components/`. Use them, do not restyle per screen. The sign-in page (`frontend/src/features/auth/`) is the reference for a built screen: translations in both languages, tests for each state, screenshots at 360/768/1280 px in both languages.

Calendar: `backend/internal/calendar` (Go) and `frontend/src/lib/calendar` (TypeScript) must stay in step; both test against `docs/calendar-vectors.json`. Display only; the time zone is a setting, default Africa/Addis_Ababa. Month and weekday names live in the translation files.

## Rules that must hold everywhere

- **Append-only records.** Floor events, stock movements and audit rows are never updated or deleted. Corrections are new reversing entries with a reason.
- **Derived numbers.** Stock, output, yield and reports are computed from events and movements. Available stock = on-hand minus reserved. Never store a typed-over total.
- **Settings, not constants.** Business rules (reservation priority, partial reservation, alert tolerances, rest interval, shift times and count, units, package sizes) are settings in the database.
- **Reasons and audit.** Plan changes after approval need a reason. Every override is written to the audit log with user, time, old and new value.
- **Units.** Every quantity carries a unit from the product (egg tray: piece, jar cover: kg). Never mix kg and pieces silently.
- **Reservation is transactional.** Locking rows so two sales cannot both take the last stock. Allocation re-runs when material or finished goods arrive, first order first.
- **Deliveries need a reference.** A delivery must point to a receipt, a sample request or a pay-later record. Paid and delivered quantities stay separate on each order line.
- **Recycling.** Damaged output returns as regrind with no loss. Each BOM decides whether regrind may be used, from which source products and up to what blend percentage (Crown: egg tray yes, jar cover no); never hard-code it. Report gross throughput and net yield separately and label them.
- **Idempotent floor entry.** Every floor event has a client-generated key so offline replays are stored once.
- **Dates.** Store UTC. Display the Ethiopian calendar by default (13 months), Gregorian optional, through one shared tested conversion module. A shift crossing midnight belongs to the day it started.
- **Roles are data.** Role names, descriptions and permissions live in the database in both languages; code checks permissions, never role names. Every route is closed to someone who must change their password unless it is explicitly marked as allowed for that (only `/api/auth/me`, `/api/auth/password` and `/api/auth/preferences`).
- **Languages.** English and Amharic from the first screen. No hard-coded text; all labels live in translation files. Leave room for longer Amharic text and use an Ethiopic font.
- **Interface quality.** Modern, simple, clear, striking first impression, fully responsive (checked at 360, 768 and 1280 px, in both languages, with realistic data). Build on the shared design system; see "Interface quality" in the implementation plan.
- **No prices or accounting.** Record quantities and receipt numbers only.
- **Company-specific values are data** (products, colors, machines, shifts). Single company for now; keep tables clean so a company field can be added later.

## Working agreements

- One branch per feature, small pull requests, `main` always builds and passes tests.
- Migrations only move forward and are reviewed.
- Write tests with the rules. Use a real PostgreSQL for integration tests. Use Crown's weekly report as fixtures (11 cavities, 14 planned hours, cycle times 30.7 to 31.7 s give targets of 17,489 and 18,059 pieces).
- No secrets in the repo; use environment variables.
- Commits and pull requests are authored only by the repo owner. Do not add Claude co-author, session or "generated with" lines.
- **Model choice.** Use the lightest model that does the job well, to save usage. Default to Sonnet. Switch to Opus only for work where mistakes are costly or reasoning is hard, then switch back. Switch in the session with `/model`; do not stay on Opus out of habit.
  - Sonnet: routine features, CRUD and API endpoints, UI from an approved mockup, translations, tests for known rules, bug fixes with a clear cause, docs edits, refactors, running commands.
  - Opus: architecture and data-model decisions, reservation and allocation logic, concurrency and locking, the append-only/derived-number design, Ethiopian calendar edge cases, hard debugging with no clear cause, security review, design direction for the first screens, and a final review before merging risky changes.
  - If a task on Sonnet goes wrong twice, stop and switch to Opus for that task rather than retrying.
  - Say which model a task needs when planning it, and say when it is time to switch.
- Screens are mocked up and approved by the owner before they are built (from milestone 2 on).
- Floor screens: large touch targets, as few taps as possible, must work offline and sync later.
