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
- Milestone 1 (Foundation): in progress on `feature/foundation`. Done: repo skeleton, Go API with `settings` and append-only `audit_log`, frontend shell with English/Amharic and PWA, Playwright screenshot script. Next: shared calendar module (use Opus), then login and roles, the design system, and the first approved mockups.
- Durations for milestones have not been estimated; give them after milestone 1.

## Still open

- Day shift report and egg tray report from Crown (not available yet).
- Maximum regrind percentage, if Crown has one.
- Real list of colors, machines and shift times, entered as data when known.
- Amharic translation review by a native speaker before rollout.
