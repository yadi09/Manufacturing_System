# Master data model (milestone 2): proposal for approval

Status: **proposal, 2026-10-19. Not approved yet. No code written.**

Master data is the set of facts about what Crown makes, with what, on which machines, by whom and when. Later milestones (stock, production, reports) only point at it. This document proposes how to store those facts, in plain language.

## The picture

```mermaid
erDiagram
    UNIT ||--o{ PRODUCT : "counted in"
    PRODUCT ||--|{ VARIANT : "comes in colours"
    PRODUCT ||--o{ MOULD : "is made with"
    VARIANT ||--o{ BOM : "has recipe versions"
    BOM ||--|{ BOM_LINE : "uses"
    BOM ||--o{ REGRIND_RULE : "may accept"
    ITEM ||--o{ BOM_LINE : "is used in"
    PRODUCT ||--o{ REGRIND_RULE : "regrind from"
    UNIT ||--o{ ITEM : "counted in"
    VARIANT ||--o| ITEM : "finished goods item"
    PRODUCT ||--o| ITEM : "regrind item (source)"
    WORKSPACE ||--o{ MOULD_SETUP : "runs"
    MOULD ||--o{ MOULD_SETUP : "mounted as"
    MOULD_SETUP }o--o| VARIANT : "cycle time for colour"
    SHIFT_DEFINITION
    REASON
    LOCATION
    PROFESSION ||--o{ EMPLOYEE : "job title"
    EMPLOYEE |o--o| USER_ACCOUNT : "may sign in as"
```

## What each part holds

| Part | Holds | Example |
| --- | --- | --- |
| **Unit** | The units quantities are counted in, with their kind (count or mass). Fixed list as data: piece, kg, g. | `kg` (mass) |
| **Product** | What Crown sells: name (English and Amharic), its **sale unit**, package size in that unit, weight per piece in grams (optional), active or not. | Jar cover: unit kg, bag of 25 kg, 8 g per piece |
| **Variant** | A colour of a product, in both languages. Production orders, stock and recipes are per variant. | Jar cover, clear |
| **Item** | Anything that has stock: each finished variant, each raw material grade, each additive or masterbatch, and **one regrind item per source product** (so regrind keeps its origin). | "LLDPE M500026", "Regrind from jar cover" |
| **BOM** (recipe) | For one variant: which items, how much per one sale unit, and its alert tolerances (default from the setting: 5% warning, 10% critical). **Versioned**: a change makes a new version with a reason. | Clear jar cap v2: 1.000 kg LLDPE per kg |
| **BOM line** | One ingredient: item, quantity per one sale unit of the product, unit. | 8 g LLDPE per egg tray piece |
| **Regrind rule** | On a BOM: regrind from **which source product** may be used, and an optional **maximum blend percentage** (empty = no cap). No rule = regrind not allowed. | Egg tray BOM: from egg tray, from jar cover, no cap |
| **Workspace** | A place where work happens: machines, the QC area, the recycling workspace. Name in both languages, kind, runs 24 hours or not. | Machine 2 |
| **Mould** | A mould: name or code, **number of cavities**, the product it makes. | Clear jar cap mould, 11 cavities |
| **Mould setup** | A mould on a machine: the **standard cycle time** in seconds, optionally per colour. **Versioned by date**: a new cycle time adds a row, the old one stays, so past plans still explain their targets. | Machine 2 + jar cap mould: 31.7 s from 2026-10-01 |
| **Shift definition** | Each shift: name, start and end time (local), order. **Versioned by date** like cycle times, so a shift's day stays right after times change. How many shifts there are follows from the active definitions. | Night: 18:00 to 08:00 |
| **Reason** | Editable lists, each entry in both languages, with a kind: **damage** reasons and **downtime** reasons. Entries are retired, never deleted. | Damage: splitting. Downtime: power off |
| **Location** | The five stock and non-stock places, as data. | Regrind store |
| **Profession** | Job titles as data, in both languages. | Operator, QC inspector |
| **Employee** | A person who works at Crown: name, profession, active, and an **optional link to a user account**. Operators have no account for now; HR later links accounts to existing employees with their history intact. | An operator, no account |

Rotation teams, rosters and attendance are milestone 7 and are left out here.

## The rules this model makes hold

- **Units per product.** Every product has one sale unit (egg tray: piece; jar cover: kg). Stock, plans and BOM quantities are stored in the unit of their item or product. Pieces and kg are converted **only** through the product's weight per piece, and a converted figure is labelled as such. Quantities are exact decimals (three decimal places), never floating-point numbers.
- **Plans from cycle time.** The target in pieces comes from planned hours, the mould setup's cycle time and the mould's cavities, as in Crown's weekly report. For a product sold in kg, the target is converted with the weight per piece.
- **Jar cover regrind goes only into egg tray production.** This is not written in code. It holds because only the egg tray BOM has a regrind rule for "from jar cover", and no other BOM does. When material is loaded (milestone 4), the system rejects regrind that the variant's active BOM does not allow, and any blend above the rule's maximum. Changing it is a BOM change: new version, reason, audit row.
- **Editable settings stay settings.** Tolerance defaults, rest interval, alert levels and similar rules stay in the `settings` table (audited, with a screen for the administrator). A BOM may override the tolerance for its product.
- **Both languages.** Every name a person reads (product, colour, item, reason, workspace, profession, location) has an English and an Amharic value.
- **Single company now, clean for later.** No company column yet, and no table that mixes two companies' data, so one can be added.

## Append-only or editable

| Kind | What | How changes work |
| --- | --- | --- |
| **Append-only** | Audit log (already); BOM versions once activated, with their lines and regrind rules; mould setup rows (cycle times); shift definition rows | Never updated or deleted. A change is a new version or row, with a reason where the process asks for one. History always shows what applied at the time |
| **Editable, audited** | Products, variants, items, workspaces, moulds, reasons, locations, professions, employees, settings | Updated in place, and every change writes an audit row with who, when, old and new value |
| **Retired, never deleted** | Anything that history may point to: products, variants, items, reasons, workspaces, moulds, employees | Marked inactive. Hidden from new choices, still shown in old records |

Stock movements and floor events (milestones 3 and 4) are append-only too; they point at this master data.

## Choices I am making that the docs do not settle (please confirm or change)

1. **A BOM per colour variant**, not per product. Colours can need a different masterbatch. A new colour starts as a copy of another colour's BOM, so it stays quick to set up.
2. **Cycle time on the mould setup (machine plus mould), optionally per colour**, not on the product. The weekly report shows the cycle time changing between days for the same product.
3. **One regrind item per source product** ("Regrind from egg tray", "Regrind from jar cover"), so the regrind store keeps the origin, as the process requires.
4. **Versions instead of edits** for BOMs, cycle times and shift times, so past plans, targets and shift days never change after the fact.
5. **Damage and downtime reasons in one list with a kind**, rather than two separate lists. They behave the same way.
6. **Professions as a data list**, separate from sign-in roles. A QC inspector is both: profession "QC inspector" on the employee, and the sign-in role on their account.
7. **Weight per piece on the product** (for example 8 g), editable and audited, used only for labelled conversions.
