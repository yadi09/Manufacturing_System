import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../../components/Button";
import { Choice } from "../../components/Choice";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { Icon } from "../../components/Icon";
import { Modal } from "../../components/Modal";
import { Notice } from "../../components/Notice";
import { TextField } from "../../components/TextField";
import type { Material } from "./api";
import { masterErrorKey } from "./errors";
import { isPositiveDecimal, trimDecimal } from "./format";
import { useCreateMaterial, useUpdateMaterial } from "./hooks";

/** Add a material, or edit one (the kind and unit never change). */
export function MaterialPanel({ material, onClose }: { material?: Material; onClose: () => void }) {
  const { t } = useTranslation();
  const create = useCreateMaterial();
  const update = useUpdateMaterial();
  const [name, setName] = useState(material?.name ?? "");
  const [nameAm, setNameAm] = useState(material?.name_am ?? "");
  const [kind, setKind] = useState<Material["kind"]>(material?.kind ?? "raw_material");
  const [bag, setBag] = useState(trimDecimal(material?.bag_qty));
  const [errors, setErrors] = useState<{ name?: string; nameAm?: string; bag?: string }>({});
  const [problem, setProblem] = useState<string | null>(null);
  const [confirmRetire, setConfirmRetire] = useState(false);

  const editing = Boolean(material);
  const busy = create.isPending || update.isPending;
  const dirty = !material || name.trim() !== material.name || nameAm.trim() !== material.name_am || bag.trim() !== trimDecimal(material.bag_qty);

  function fail(err: unknown) {
    const key = masterErrorKey(err);
    if (key === "duplicateName") setErrors({ name: t("master.errors.duplicateName") });
    else if (key === "invalidQuantity") setErrors({ bag: t("master.errors.invalidQuantity") });
    else setProblem(key);
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    setProblem(null);
    const next: typeof errors = {};
    if (!name.trim()) next.name = t("master.errors.nameRequired");
    if (!nameAm.trim()) next.nameAm = t("master.errors.nameAmRequired");
    if (bag.trim() && !isPositiveDecimal(bag, 3)) next.bag = t("master.errors.invalidQuantity");
    setErrors(next);
    if (Object.keys(next).length) return;
    const input = { name: name.trim(), name_am: nameAm.trim(), bag_qty: bag.trim() || null };
    if (material) update.mutate({ id: material.id, ...input }, { onSuccess: onClose, onError: fail });
    else create.mutate({ ...input, kind, unit: "kg" }, { onSuccess: onClose, onError: fail });
  }

  const title = editing ? t("master.materials.edit") : t("master.materials.add");

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
          {problem && (
            <Notice tone="danger" title={t("master.errors.title")}>
              {t(`master.errors.${problem}`)}
            </Notice>
          )}
          <TextField label={t("master.nameEn")} value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" required error={errors.name} />
          <TextField label={t("master.nameAm")} lang="am" value={nameAm} onChange={(e) => setNameAm(e.target.value)} autoComplete="off" required error={errors.nameAm} />
          <fieldset className="flex min-w-0 flex-col gap-2">
            <legend className="p-0 text-sm font-medium">{t("master.materials.kind")}</legend>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {(["raw_material", "additive"] as const).map((k) => (
                <Choice key={k} name="kind" checked={kind === k} disabled={editing} onChange={() => setKind(k)}>
                  <span>{t(`master.materials.kinds.${k}`)}</span>
                </Choice>
              ))}
            </div>
            {editing && <span className="text-[13px] text-ink-muted">{t("master.materials.kindLocked")}</span>}
          </fieldset>
          <TextField
            label={t("master.materials.bag")}
            inputMode="decimal"
            value={bag}
            onChange={(e) => setBag(e.target.value)}
            error={errors.bag}
            trailing={<span className="flex items-center px-3 text-sm text-ink-muted">kg</span>}
          />
          {material && (
            <div className="flex flex-col gap-2 rounded-md bg-surface-50 p-4">
              <span className="text-sm text-ink-muted">{material.used_in > 0 ? t("master.materials.usedIn", { count: material.used_in }) : t("master.materials.unused")}</span>
              {material.active ? (
                <Button type="button" variant="secondary" className="self-start border-danger text-danger" onClick={() => setConfirmRetire(true)} disabled={busy}>
                  {t("master.retire")}
                </Button>
              ) : (
                <Button type="button" variant="secondary" className="self-start" loading={update.isPending} onClick={() => update.mutate({ id: material.id, name: material.name, name_am: material.name_am, bag_qty: material.bag_qty, active: true }, { onSuccess: onClose, onError: fail })}>
                  {t("master.reactivate")}
                </Button>
              )}
            </div>
          )}
        </div>
        <div className="sticky bottom-0 flex gap-3 border-t border-line bg-surface-0 px-6 py-4">
          <Button type="submit" className="flex-1" loading={busy} disabled={!dirty}>
            {editing ? t("master.save") : t("master.materials.add")}
          </Button>
          <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>
            {t("master.cancel")}
          </Button>
        </div>
      </form>
      {material && confirmRetire && (
        <ConfirmDialog
          danger
          title={t("master.materials.retireTitle", { name: material.name })}
          confirmLabel={t("master.retire")}
          cancelLabel={t("master.cancel")}
          pending={update.isPending}
          onClose={() => setConfirmRetire(false)}
          onConfirm={() =>
            update.mutate(
              { id: material.id, name: material.name, name_am: material.name_am, bag_qty: material.bag_qty, active: false },
              { onSuccess: onClose, onError: (e) => (setConfirmRetire(false), fail(e)) },
            )
          }
        >
          {t("master.materials.retireBody")}
        </ConfirmDialog>
      )}
    </Modal>
  );
}
