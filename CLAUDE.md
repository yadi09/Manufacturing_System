# CLAUDE.md

Production management system for Crown Manufacturing Company (Ethiopia). It covers the production chain only (receipt, order, reservation, production, QC, stock, delivery, shifts, reports), not full ERP or accounting.

Read these first:
- `docs/process.md`: how the factory works. Source of truth. Update it in the same commit as any rule change.
- `docs/implementation-plan.md`: stack, data model, milestones, testing, repo layout.

## Stack

- Backend: Go (chi, pgx, sqlc, goose migrations), in `backend/`
- Database: PostgreSQL
- Frontend: React + TypeScript (Vite, Tailwind CSS, TanStack Query, i18next, PWA), in `frontend/`
- Hosting: one cloud server. Factory internet is normal; offline entry is a safety net.
- Contract: `api/openapi.yaml`; TypeScript API types are generated from it
- Live updates: Server-Sent Events fed by PostgreSQL LISTEN/NOTIFY

Commands: not set up yet. Add build, test, lint and migration commands here as soon as they exist.

## Rules that must hold everywhere

- **Append-only records.** Floor events, stock movements and audit rows are never updated or deleted. Corrections are new reversing entries with a reason.
- **Derived numbers.** Stock, output, yield and reports are computed from events and movements. Available stock = on-hand minus reserved. Never store a typed-over total.
- **Settings, not constants.** Business rules (reservation priority, partial reservation, alert tolerances, rest interval, shift times and count, units, package sizes) are settings in the database.
- **Reasons and audit.** Plan changes after approval need a reason. Every override is written to the audit log with user, time, old and new value.
- **Units.** Every quantity carries a unit from the product (egg tray: piece, jar cover: kg). Never mix kg and pieces silently.
- **Reservation is transactional.** Locking rows so two sales cannot both take the last stock. Allocation re-runs when material or finished goods arrive, first order first.
- **Deliveries need a reference.** A delivery must point to a receipt, a sample request or a pay-later record. Paid and delivered quantities stay separate on each order line.
- **Recycling.** Damaged output returns as regrind with no loss. Jar cover regrind goes only into egg tray production. Report gross throughput and net yield separately and label them.
- **Idempotent floor entry.** Every floor event has a client-generated key so offline replays are stored once.
- **Dates.** Store UTC. Display the Ethiopian calendar by default (13 months), Gregorian optional, through one shared tested conversion module. A shift crossing midnight belongs to the day it started.
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
- Screens are mocked up and approved by the owner before they are built (from milestone 2 on).
- Floor screens: large touch targets, as few taps as possible, must work offline and sync later.
