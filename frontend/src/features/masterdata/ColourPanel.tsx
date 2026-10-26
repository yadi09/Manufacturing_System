import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../../components/Button";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { Icon } from "../../components/Icon";
import { Modal } from "../../components/Modal";
import { Notice } from "../../components/Notice";
import { TextField } from "../../components/TextField";
import type { Colour, Product } from "./api";
import { masterErrorKey } from "./errors";
import { useCreateColour, useUpdateColour } from "./hooks";
import { localName } from "./names";

/** Add a colour to a product, or rename or retire one. */
export function ColourPanel({ product, colour, onClose }: { product: Product; colour?: Colour; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const create = useCreateColour();
  const update = useUpdateColour();
  const [name, setName] = useState(colour?.name ?? "");
  const [nameAm, setNameAm] = useState(colour?.name_am ?? "");
  const [errors, setErrors] = useState<{ name?: string; nameAm?: string }>({});
  const [problem, setProblem] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const busy = create.isPending || update.isPending;
  const title = colour ? t("master.colours.rename") : t("master.colours.add");
  const dirty = !colour || name.trim() !== colour.name || nameAm.trim() !== colour.name_am;

  function fail(err: unknown) {
    const key = masterErrorKey(err);
    if (key === "duplicateName") setErrors({ name: t("master.errors.duplicateName") });
    else setProblem(key);
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    setProblem(null);
    const next: typeof errors = {};
    if (!name.trim()) next.name = t("master.errors.nameRequired");
    if (!nameAm.trim()) next.nameAm = t("master.errors.nameAmRequired");
    setErrors(next);
    if (Object.keys(next).length) return;
    const input = { name: name.trim(), name_am: nameAm.trim() };
    if (colour) update.mutate({ id: colour.id, ...input }, { onSuccess: onClose, onError: fail });
    else create.mutate({ productId: product.id, ...input }, { onSuccess: onClose, onError: fail });
  }

  const setActive = (active: boolean) =>
    colour && update.mutate({ id: colour.id, name: colour.name, name_am: colour.name_am, active }, { onSuccess: onClose, onError: (e) => (setConfirm(false), fail(e)) });

  return (
    <Modal variant="panel" title={title} onClose={onClose} dismissible={!busy}>
      <form onSubmit={submit} noValidate className="flex min-h-full flex-1 flex-col">
        <div className="flex items-center justify-between gap-3 border-b border-line px-6 py-4">
          <span className="text-lg font-semibold" style={{ lineHeight: "26px" }} aria-hidden="true">
            {title} · {localName(product, i18n.language)}
          </span>
          <button type="button" aria-label={t("master.close")} onClick={onClose} className="flex size-12 items-center justify-center rounded-md hover:bg-surface-100">
            <Icon name="close" size={24} />
          </button>
        </div>
        <div className="flex flex-1 flex-col gap-5 p-6">
          {problem && (
            <Notice tone="danger" title={t("master.errors.title")}>
              {t(`master.errors.${problem}`)}
            </Notice>
          )}
          <TextField label={t("master.nameEn")} value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" required error={errors.name} />
          <TextField label={t("master.nameAm")} lang="am" value={nameAm} onChange={(e) => setNameAm(e.target.value)} autoComplete="off" required error={errors.nameAm} />
          {!colour && <p className="text-[13px] text-ink-muted">{t("master.colours.addNote")}</p>}
          {colour && (
            <div className="flex flex-col gap-2 rounded-md bg-surface-50 p-4">
              {colour.active ? (
                <Button type="button" variant="secondary" className="self-start border-danger text-danger" onClick={() => setConfirm(true)} disabled={busy}>
                  {t("master.retire")}
                </Button>
              ) : (
                <Button type="button" variant="secondary" className="self-start" loading={update.isPending} onClick={() => setActive(true)}>
                  {t("master.reactivate")}
                </Button>
              )}
            </div>
          )}
        </div>
        <div className="sticky bottom-0 flex gap-3 border-t border-line bg-surface-0 px-6 py-4">
          <Button type="submit" className="flex-1" loading={busy} disabled={!dirty}>
            {colour ? t("master.save") : t("master.colours.add")}
          </Button>
          <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>
            {t("master.cancel")}
          </Button>
        </div>
      </form>
      {colour && confirm && (
        <ConfirmDialog
          danger
          title={t("master.colours.retireTitle", { name: localName(colour, i18n.language) })}
          confirmLabel={t("master.retire")}
          cancelLabel={t("master.cancel")}
          pending={update.isPending}
          onClose={() => setConfirm(false)}
          onConfirm={() => setActive(false)}
        >
          {t("master.colours.retireBody", { name: localName(colour, i18n.language) })}
        </ConfirmDialog>
      )}
    </Modal>
  );
}
