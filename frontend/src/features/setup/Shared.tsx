import { useState, type FormEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ApiError } from "../../api/client";
import { Button } from "../../components/Button";
import { Chip } from "../../components/Chip";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { Icon } from "../../components/Icon";
import { Modal } from "../../components/Modal";
import { Notice } from "../../components/Notice";
import { masterErrorKey } from "../masterdata/errors";
import { localName, otherLang, otherName } from "../masterdata/names";

/** Translated message for what the server (or the network) said. */
export function useErrorText() {
  const { t, i18n } = useTranslation();
  return (err: unknown) => {
    if (err instanceof ApiError && i18n.exists(`setup.errors.${err.code}`)) return t(`setup.errors.${err.code}`);
    return t(`master.errors.${masterErrorKey(err)}`);
  };
}

interface Retire {
  active: boolean;
  title: string;
  body: string;
  pending: boolean;
  onRetire: () => void;
  onReactivate: () => void;
}

/** A side panel holding one form: header, fields, then Save and Cancel kept at the bottom. */
export function PanelFrame({ title, onClose, busy, dirty, problem, submitLabel, onSubmit, retire, children }: {
  title: string;
  onClose: () => void;
  busy: boolean;
  dirty: boolean;
  problem: string | null;
  submitLabel: string;
  onSubmit: () => void;
  retire?: Retire;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const [confirm, setConfirm] = useState(false);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit();
  };
  return (
    <Modal variant="panel" title={title} onClose={onClose} dismissible={!busy}>
      <form onSubmit={submit} noValidate className="flex min-h-full flex-1 flex-col">
        <div className="flex items-center justify-between gap-3 border-b border-line px-6 py-4">
          <span className="text-lg font-semibold" style={{ lineHeight: "26px" }} aria-hidden="true">
            {title}
          </span>
          <button type="button" aria-label={t("master.close")} onClick={onClose} className="flex size-12 items-center justify-center rounded-md hover:bg-surface-100">
            <Icon name="close" size={24} />
          </button>
        </div>
        <div className="flex flex-1 flex-col gap-5 p-6">
          {problem && <Notice tone="danger" title={t("master.errors.title")}>{problem}</Notice>}
          {children}
          {retire && (
            <div className="flex flex-col gap-2 rounded-md bg-surface-50 p-4">
              {retire.active ? (
                <Button type="button" variant="secondary" className="self-start border-danger text-danger" onClick={() => setConfirm(true)} disabled={busy}>
                  {t("master.retire")}
                </Button>
              ) : (
                <>
                  <span className="text-sm text-ink-muted">{t("setup.retiredNote")}</span>
                  <Button type="button" variant="secondary" className="self-start" loading={retire.pending} onClick={retire.onReactivate}>
                    {t("master.reactivate")}
                  </Button>
                </>
              )}
            </div>
          )}
        </div>
        <div className="sticky bottom-0 flex gap-3 border-t border-line bg-surface-0 px-6 py-4">
          <Button type="submit" className="flex-1" loading={busy} disabled={!dirty}>
            {submitLabel}
          </Button>
          <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>
            {t("master.cancel")}
          </Button>
        </div>
      </form>
      {retire && confirm && (
        <ConfirmDialog
          danger
          title={retire.title}
          confirmLabel={t("master.retire")}
          cancelLabel={t("master.cancel")}
          pending={retire.pending}
          onClose={() => setConfirm(false)}
          onConfirm={() => {
            setConfirm(false);
            retire.onRetire();
          }}
        >
          {retire.body}
        </ConfirmDialog>
      )}
    </Modal>
  );
}

/** Loading, failed and empty states shared by every list. */
export function ListState({ query, empty, emptyTitle, emptyBody }: { query: { isPending: boolean; isError: boolean; refetch: () => unknown }; empty: boolean; emptyTitle: string; emptyBody: string }) {
  const { t } = useTranslation();
  if (query.isPending) return <div role="status" aria-label={t("master.loading")} className="h-40 rounded-lg bg-surface-0 shadow-card" />;
  if (query.isError)
    return (
      <Notice tone="danger" title={t("master.loadError.title")}>
        <span className="flex flex-col items-start gap-2">
          {t("master.loadError.body")}
          <Button variant="secondary" className="h-10 px-4 text-sm font-medium" onClick={() => void query.refetch()}>
            {t("master.loadError.retry")}
          </Button>
        </span>
      </Notice>
    );
  if (!empty) return null;
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg bg-surface-0 px-6 py-12 text-center shadow-card">
      <h2 className="text-lg font-semibold">{emptyTitle}</h2>
      <p className="max-w-[380px] text-ink-muted">{emptyBody}</p>
    </div>
  );
}

/** One row of a list. People who may edit get a button that opens the panel; others a plain row. */
export function Row({ columns, label, onOpen, children }: { columns: string; label: string; onOpen?: () => void; children: ReactNode }) {
  const cls = `grid w-full grid-cols-[minmax(0,1fr)] items-center gap-1.5 rounded-lg bg-surface-0 px-5 py-4 text-left shadow-card md:gap-4 ${columns}`;
  return onOpen ? (
    <button type="button" className={cls} aria-label={label} onClick={onOpen}>
      {children}
    </button>
  ) : (
    <div className={cls}>{children}</div>
  );
}

/** The name in the chosen language, with the other language under it, so both can always be checked. */
export function Names({ item, active = true }: { item: { name: string; name_am: string }; active?: boolean }) {
  const { i18n } = useTranslation();
  const lang = i18n.language;
  return (
    <span className="flex min-w-0 flex-col">
      <span className={`font-semibold ${active ? "" : "text-ink-muted"}`}>{localName(item, lang)}</span>
      <span lang={otherLang(lang)} className="text-[13px] text-ink-muted" style={{ lineHeight: "20px" }}>
        {otherName(item, lang)}
      </span>
    </span>
  );
}

export function StatusChip({ active }: { active: boolean }) {
  const { t } = useTranslation();
  return active ? (
    <Chip tone="active" icon="check">
      {t("setup.active")}
    </Chip>
  ) : (
    <Chip tone="off" icon="ban">
      {t("master.retiredChip")}
    </Chip>
  );
}

/** Info line under a list (brand tint, icon plus words). */
export function InfoLine({ children }: { children: ReactNode }) {
  return (
    <div className="flex max-w-[760px] items-start gap-3 rounded-md bg-brand-tint px-3.5 py-3 text-sm" style={{ lineHeight: "20px" }}>
      <Icon name="info" className="mt-0.5 shrink-0 text-brand" />
      <span>{children}</span>
    </div>
  );
}

/** Both names are required everywhere; returns the field errors. */
export function nameErrors(t: (k: string) => string, name: string, nameAm: string) {
  const e: { name?: string; nameAm?: string } = {};
  if (!name.trim()) e.name = t("master.errors.nameRequired");
  if (!nameAm.trim()) e.nameAm = t("master.errors.nameAmRequired");
  return e;
}

export const isDuplicate = (err: unknown) => err instanceof ApiError && err.code === "duplicate_name";
