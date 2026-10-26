import { useState } from "react";
import { useTranslation } from "react-i18next";
import { AppShell } from "../../components/AppShell";
import { Button } from "../../components/Button";
import { Chip } from "../../components/Chip";
import { Icon } from "../../components/Icon";
import { Notice } from "../../components/Notice";
import { TextField } from "../../components/TextField";
import type { User } from "../auth/api";
import { localName, otherLang, otherName } from "../masterdata/names";
import type { Shift } from "./api";
import { useCreateShift, useShifts, useUpdateShift } from "./hooks";
import { InfoLine, isDuplicate, ListState, nameErrors, PanelFrame, useErrorText } from "./Shared";

const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Length of a shift in hours and minutes, across midnight when it ends before it starts. */
export function shiftMinutes(start: string, end: string) {
  const m = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
  return (m(end) - m(start) + 24 * 60) % (24 * 60);
}

function Length({ start, end }: { start: string; end: string }) {
  const { t } = useTranslation();
  const mins = shiftMinutes(start, end);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return <>{m ? t("setup.shifts.lengthHm", { h, m }) : t("setup.shifts.lengthH", { count: h })}</>;
}

export function ShiftsPage({ me }: { me: User }) {
  const { t, i18n } = useTranslation();
  const shifts = useShifts();
  const canManage = me.permissions.includes("masterdata.manage");
  const [panel, setPanel] = useState<{ shift?: Shift } | null>(null);
  const lang = i18n.language;
  const all = shifts.data ?? [];

  return (
    <AppShell
      user={me}
      title={t("nav.shifts")}
      subtitle={t("setup.shifts.intro")}
      actions={canManage && <Button onClick={() => setPanel({})} icon={<Icon name="plus" />}>{t("setup.shifts.add")}</Button>}
    >
      <InfoLine>{t("setup.shifts.changeNote")}</InfoLine>
      <ListState query={shifts} empty={shifts.isSuccess && all.length === 0} emptyTitle={t("setup.shifts.emptyTitle")} emptyBody={t("setup.shifts.emptyBody")} />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-2">
        {all.map((s) => (
          <section key={s.id} aria-label={localName(s, lang)} className="flex flex-col gap-3.5 rounded-lg bg-surface-0 p-6 shadow-card">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 flex-col">
                <h2 className={`text-lg font-semibold ${s.active ? "" : "text-ink-muted"}`}>{localName(s, lang)}</h2>
                <span lang={otherLang(lang)} className="text-[13px] text-ink-muted">
                  {otherName(s, lang)}
                </span>
              </div>
              {s.active ? (
                <Chip tone="active">{t("setup.shifts.position", { n: s.position })}</Chip>
              ) : (
                <Chip tone="off" icon="ban">
                  {t("master.retiredChip")}
                </Chip>
              )}
            </div>
            <div className="flex flex-wrap items-baseline gap-3">
              <span className="text-[40px] font-semibold leading-[48px] tracking-tight tabular">{s.start_time}</span>
              <Icon name="chevron" size={24} className="text-ink-muted" />
              <span className="text-[40px] font-semibold leading-[48px] tracking-tight tabular">{s.end_time}</span>
              <span className="text-sm text-ink-muted">
                <Length start={s.start_time} end={s.end_time} />
              </span>
            </div>
            {s.crosses_midnight && (
              <Notice tone="warning" icon="clock" title={t("setup.shifts.crossesTitle")}>
                {t("setup.shifts.crossesBody")}
              </Notice>
            )}
            {canManage && (
              <Button variant="secondary" className="h-11 self-start px-4 text-sm font-medium" onClick={() => setPanel({ shift: s })} aria-label={t("setup.shifts.editFor", { name: localName(s, lang) })}>
                {t("setup.edit")}
              </Button>
            )}
          </section>
        ))}
      </div>
      {panel && <ShiftPanel key={panel.shift?.id ?? "new"} shift={panel.shift} next={all.length + 1} onClose={() => setPanel(null)} />}
    </AppShell>
  );
}

function ShiftPanel({ shift, next, onClose }: { shift?: Shift; next: number; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const errorText = useErrorText();
  const create = useCreateShift();
  const update = useUpdateShift();
  const [name, setName] = useState(shift?.name ?? "");
  const [nameAm, setNameAm] = useState(shift?.name_am ?? "");
  const [start, setStart] = useState(shift?.start_time ?? "");
  const [end, setEnd] = useState(shift?.end_time ?? "");
  const [position, setPosition] = useState(String(shift?.position ?? Math.min(next, 10)));
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [problem, setProblem] = useState<string | null>(null);
  const busy = create.isPending || update.isPending;
  const timesChanged = Boolean(shift) && (start !== shift?.start_time || end !== shift?.end_time);
  const dirty = !shift || timesChanged || name.trim() !== shift.name || nameAm.trim() !== shift.name_am || position !== String(shift.position);
  const valid = CLOCK.test(start) && CLOCK.test(end) && start !== end;

  function fail(err: unknown) {
    if (isDuplicate(err)) setErrors({ name: t("master.errors.duplicateName") });
    else setProblem(errorText(err));
  }

  function submit(active?: boolean) {
    setProblem(null);
    const e: Record<string, string | undefined> = { ...nameErrors(t, name, nameAm) };
    if (!CLOCK.test(start)) e.start = t("setup.errors.invalid_time");
    if (!CLOCK.test(end)) e.end = t("setup.errors.invalid_time");
    if (CLOCK.test(start) && start === end) e.end = t("setup.shifts.sameTime");
    const pos = Number(position);
    if (!Number.isInteger(pos) || pos < 1 || pos > 10) e.position = t("setup.shifts.positionRange");
    if (timesChanged && !reason.trim()) e.reason = t("setup.errors.reason_required");
    setErrors(e);
    if (Object.values(e).some(Boolean)) return;
    const input = { name: name.trim(), name_am: nameAm.trim(), start_time: start, end_time: end, position: pos, reason: reason.trim() || undefined };
    if (shift) update.mutate({ id: shift.id, ...input, active: active ?? shift.active }, { onSuccess: onClose, onError: fail });
    else create.mutate(input, { onSuccess: onClose, onError: fail });
  }

  const retireSend = (active: boolean) => shift && update.mutate({ id: shift.id, name: shift.name, name_am: shift.name_am, start_time: shift.start_time, end_time: shift.end_time, position: shift.position, active }, { onSuccess: onClose, onError: fail });

  return (
    <PanelFrame
      title={shift ? t("setup.shifts.edit") : t("setup.shifts.add")}
      onClose={onClose}
      busy={busy}
      dirty={dirty}
      problem={problem}
      submitLabel={shift ? t("master.save") : t("setup.shifts.add")}
      onSubmit={() => submit()}
      retire={shift ? { active: shift.active, title: t("setup.retireTitle", { name: localName(shift, i18n.language) }), body: t("setup.shifts.retireBody"), pending: update.isPending, onRetire: () => retireSend(false), onReactivate: () => retireSend(true) } : undefined}
    >
      <TextField label={t("master.nameEn")} value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" required error={errors.name} />
      <TextField label={t("master.nameAm")} lang="am" value={nameAm} onChange={(e) => setNameAm(e.target.value)} autoComplete="off" required error={errors.nameAm} />
      <div className="grid grid-cols-2 gap-3">
        <TextField label={t("setup.shifts.start")} type="time" value={start} onChange={(e) => setStart(e.target.value)} required error={errors.start} />
        <TextField label={t("setup.shifts.end")} type="time" value={end} onChange={(e) => setEnd(e.target.value)} required error={errors.end} />
      </div>
      <span className="-mt-3 text-[13px] text-ink-muted">{t("setup.shifts.localTime")}</span>
      {valid && (
        <Notice tone={end < start ? "warning" : "info"} icon="clock" title={t("setup.shifts.lengthTitle")}>
          <Length start={start} end={end} />
          {end < start && ` · ${t("setup.shifts.crossesBody")}`}
        </Notice>
      )}
      <TextField label={t("setup.shifts.positionLabel")} inputMode="numeric" value={position} onChange={(e) => setPosition(e.target.value)} error={errors.position} />
      {timesChanged && (
        <div className="flex flex-col gap-2">
          <label htmlFor="shift-reason" className="text-sm font-medium">
            {t("setup.shifts.reason")}
          </label>
          <textarea
            id="shift-reason"
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            aria-invalid={errors.reason ? true : undefined}
            aria-describedby="shift-reason-help"
            className={`rounded-md border bg-surface-0 px-3.5 py-3 text-base ${errors.reason ? "border-danger" : "border-control-border"}`}
          />
          <span id="shift-reason-help" className={`text-[13px] ${errors.reason ? "text-danger" : "text-ink-muted"}`}>
            {errors.reason ?? t("setup.shifts.reasonHelp")}
          </span>
        </div>
      )}
    </PanelFrame>
  );
}
