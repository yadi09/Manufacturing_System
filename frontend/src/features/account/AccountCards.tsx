import { useTranslation } from "react-i18next";
import { Avatar } from "../../components/Avatar";
import { Chip } from "../../components/Chip";
import { Choice } from "../../components/Choice";
import { LANGUAGES } from "../../i18n";
import { formatDate, type CalendarKind } from "../../lib/calendar/format";
import { useCalendar } from "../../lib/calendar/preference";
import type { User } from "../auth/api";

export function DetailsCard({ user }: { user: User }) {
  const { t, i18n } = useTranslation();
  return (
    <section className="flex flex-col gap-4 rounded-lg bg-surface-0 p-6 shadow-card">
      <h2 className="text-lg font-semibold" style={{ lineHeight: "26px" }}>
        {t("account.details.title")}
      </h2>
      <div className="flex items-center gap-4">
        <Avatar name={user.full_name} size={56} solid />
        <div className="flex min-w-0 flex-col">
          <span className="text-lg font-semibold" style={{ lineHeight: "26px" }}>
            {user.full_name}
          </span>
          <span className="break-words text-sm text-ink-muted">{user.email}</span>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">{t("account.details.roles")}</span>
        <span className="flex flex-wrap gap-1.5">
          {user.roles.length === 0 && <span className="text-sm text-ink-muted">—</span>}
          {user.roles.map((r) => (
            <Chip key={r.key}>{i18n.language === "am" && r.name_am ? r.name_am : r.name}</Chip>
          ))}
        </span>
      </div>
      <p className="text-[13px] text-ink-muted" style={{ lineHeight: "18px" }}>
        {t("account.details.note")}
      </p>
    </section>
  );
}

export function DisplayCard() {
  const { t, i18n } = useTranslation();
  const [calendar, setCalendar] = useCalendar();
  const today = new Date();
  const kinds: CalendarKind[] = ["ethiopian", "gregorian"];
  return (
    <section className="flex flex-col gap-5 rounded-lg bg-surface-0 p-6 shadow-card">
      <h2 className="text-lg font-semibold" style={{ lineHeight: "26px" }}>
        {t("account.display.title")}
      </h2>
      <fieldset className="flex min-w-0 flex-col gap-2">
        <legend className="p-0 text-sm font-medium">{t("account.display.language")}</legend>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {LANGUAGES.map((lng) => (
            <Choice key={lng} name="language" checked={i18n.language === lng} onChange={() => void i18n.changeLanguage(lng)}>
              <span lang={lng}>{t(`language.${lng}`)}</span>
            </Choice>
          ))}
        </div>
      </fieldset>
      <fieldset className="flex min-w-0 flex-col gap-2">
        <legend className="p-0 text-sm font-medium">{t("account.display.calendar")}</legend>
        <div className="mt-2 flex flex-col gap-2">
          {kinds.map((k) => (
            <Choice key={k} name="calendar" checked={calendar === k} onChange={() => setCalendar(k)}>
              <span>{t(`account.display.${k}`)}</span>
              <span className="text-[13px] text-ink-muted" style={{ lineHeight: "18px" }}>
                {formatDate(t, today, k)}
              </span>
            </Choice>
          ))}
        </div>
      </fieldset>
      <p className="text-[13px] text-ink-muted" style={{ lineHeight: "18px" }}>
        {t("account.display.note")}
      </p>
    </section>
  );
}
