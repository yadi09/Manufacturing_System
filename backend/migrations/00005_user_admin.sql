-- +goose Up
-- A password set by someone else (new user, administrator reset) must be changed at first sign-in.
ALTER TABLE users ADD COLUMN must_change_password boolean NOT NULL DEFAULT false;

-- Role names and one-line descriptions are data, in both languages (Amharic needs native review).
ALTER TABLE roles
    ADD COLUMN name_am        text NOT NULL DEFAULT '',
    ADD COLUMN description    text NOT NULL DEFAULT '',
    ADD COLUMN description_am text NOT NULL DEFAULT '';

UPDATE roles r SET name = v.name, name_am = v.name_am, description = v.description, description_am = v.description_am
FROM (VALUES
 ('admin', 'Administrator', 'አስተዳዳሪ', 'Manages users, settings and master data.', 'ተጠቃሚዎችን፣ ቅንብሮችን እና መሠረታዊ መረጃን ያስተዳድራል።'),
 ('owner', 'Owner / GM', 'ባለቤት / ዋና ሥራ አስኪያጅ', 'Sees the live board, dashboards and all reports.', 'የቀጥታ ሰሌዳውን፣ ዳሽቦርዶችን እና ሁሉንም ሪፖርቶች ያያል።'),
 ('cashier', 'Cashier / sales', 'ገንዘብ ተቀባይ / ሽያጭ', 'Issues receipts, records samples and pay-later sales, sees available stock only.', 'ደረሰኝ ይሰጣል፣ ናሙና እና በኋላ ክፍያን ይመዘግባል፣ ያለውን ክምችት ብቻ ያያል።'),
 ('production_manager', 'Production manager', 'የምርት ሥራ አስኪያጅ', 'Reviews and edits production plans, manages shifts, approves overrides.', 'የምርት ዕቅዶችን ይገመግማል እና ያርማል፣ ፈረቃዎችን ያስተዳድራል፣ ማስተካከያዎችን ያጸድቃል።'),
 ('shift_supervisor', 'Shift supervisor', 'የፈረቃ ተቆጣጣሪ', 'Requests daily material, updates assignments, closes the shift report.', 'የዕለቱን ጥሬ ዕቃ ይጠይቃል፣ ምደባዎችን ያዘምናል፣ የፈረቃ ሪፖርት ይዘጋል።'),
 ('store_raw', 'Store manager, raw material', 'የጥሬ ዕቃ መጋዘን ኃላፊ', 'Approves and issues raw material, weighs leftovers at handover.', 'ጥሬ ዕቃ ያጸድቃል እና ይሰጣል፣ ቀሪውን ይመዝናል።'),
 ('store_fg', 'Store manager, finished goods', 'የተጠናቀቀ ምርት መጋዘን ኃላፊ', 'Approves finished goods into stock and releases deliveries.', 'የተጠናቀቀ ምርትን ወደ ክምችት ያጸድቃል እና ርክክቦችን ይለቃል።'),
 ('operator', 'Machine operator', 'የማሽን ኦፕሬተር', 'Logs material loaded, machine on and off, output and downtime.', 'የተጫነ ዕቃ፣ ማሽን ማብራት እና ማጥፋት፣ ምርት እና የሥራ መቋረጥን ይመዘግባል።'),
 ('qc_inspector', 'QC inspector', 'የጥራት ተቆጣጣሪ', 'Inspects output and records finished and damaged quantities.', 'ምርትን ይመረምራል፣ የተጠናቀቀ እና የተበላሸ መጠን ይመዘግባል።'),
 ('purchaser', 'Purchaser', 'ግዢ ፈጻሚ', 'Edits and approves purchase orders and records receiving.', 'የግዢ ትዕዛዞችን ያርማል እና ያጸድቃል፣ ደርሶ መቀበልን ይመዘግባል።'),
 ('finance', 'Finance', 'ፋይናንስ', 'Reads production and reconciliation reports.', 'የምርት እና የማስታረቂያ ሪፖርቶችን ያነባል።')
) AS v(key, name, name_am, description, description_am) WHERE r.key = v.key;

-- +goose Down
ALTER TABLE roles DROP COLUMN name_am, DROP COLUMN description, DROP COLUMN description_am;
ALTER TABLE users DROP COLUMN must_change_password;
