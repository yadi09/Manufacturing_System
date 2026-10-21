import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../../components/Button";
import { Choice } from "../../components/Choice";
import { Icon } from "../../components/Icon";
import { Modal } from "../../components/Modal";
import { Notice } from "../../components/Notice";
import { TextField } from "../../components/TextField";
import type { Product } from "./api";
import { masterErrorKey } from "./errors";
import { isPositiveDecimal } from "./format";
import { useCreateProduct } from "./hooks";

/** Step 1 of adding a product. Afterwards the person lands on its Colours tab to add the first colour. */
export function AddProductPanel({ onClose, onCreated }: { onClose: () => void; onCreated: (p: Product) => void }) {
  const { t } = useTranslation();
  const create = useCreateProduct();
  const [name, setName] = useState("");
  const [nameAm, setNameAm] = useState("");
  const [unit, setUnit] = useState<Product["sale_unit"]>("piece");
  const [pkg, setPkg] = useState("");
  const [weight, setWeight] = useState("");
  const [errors, setErrors] = useState<{ name?: string; nameAm?: string; pkg?: string; weight?: string }>({});
  const [problem, setProblem] = useState<string | null>(null);

  function submit(e: FormEvent) {
    e.preventDefault();
    setProblem(null);
    const next: typeof errors = {};
    if (!name.trim()) next.name = t("master.errors.nameRequired");
    if (!nameAm.trim()) next.nameAm = t("master.errors.nameAmRequired");
    if (!isPositiveDecimal(pkg, 3)) next.pkg = t(unit === "piece" ? "master.products.packageNeededPieces" : "master.products.packageNeededKg");
    if (weight.trim() && !isPositiveDecimal(weight, 3)) next.weight = t("master.errors.invalidQuantity");
    setErrors(next);
    if (Object.keys(next).length) return;
    create.mutate(
      { name: name.trim(), name_am: nameAm.trim(), sale_unit: unit, package_qty: pkg.trim(), weight_per_piece_g: weight.trim() || null },
      {
        onSuccess: onCreated,
        onError: (err) => {
          const key = masterErrorKey(err);
          if (key === "duplicateName") setErrors({ name: t("master.errors.duplicateName") });
          else if (key === "invalidQuantity") setErrors({ pkg: t("master.errors.invalidQuantity") });
          else setProblem(key);
        },
      },
    );
  }

  return (
    <Modal variant="panel" title={t("master.products.add")} onClose={onClose} dismissible={!create.isPending}>
      <form onSubmit={submit} noValidate className="flex min-h-full flex-1 flex-col">
        <div className="flex items-center justify-between gap-3 border-b border-line px-6 py-4">
          <span className="text-lg font-semibold" style={{ lineHeight: "26px" }} aria-hidden="true">
            {t("master.products.add")}
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
            <legend className="p-0 text-sm font-medium">{t("master.products.soldBy")}</legend>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {(["piece", "kg"] as const).map((u) => (
                <Choice key={u} name="sale_unit" checked={unit === u} onChange={() => setUnit(u)}>
                  <span>{t(`master.units.${u}`)}</span>
                </Choice>
              ))}
            </div>
            <span className="text-[13px] text-ink-muted">{t("master.products.soldByHelp")}</span>
          </fieldset>
          <TextField
            label={t("master.products.package")}
            inputMode="decimal"
            value={pkg}
            onChange={(e) => setPkg(e.target.value)}
            error={errors.pkg}
            trailing={<span className="flex items-center px-3 text-sm text-ink-muted">{t(unit === "piece" ? "master.units.pieces" : "master.units.kgPerBag")}</span>}
          />
          <div className="flex flex-col gap-2">
            <TextField
              label={`${t("master.products.weight")} (${t("master.optional")})`}
              inputMode="decimal"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              error={errors.weight}
              trailing={<span className="flex items-center px-3 text-sm text-ink-muted">g</span>}
            />
            <span className="text-[13px] text-ink-muted">{t("master.products.weightHelp")}</span>
          </div>
          <p className="text-[13px] text-ink-muted">{t("master.products.addNext")}</p>
        </div>
        <div className="sticky bottom-0 flex gap-3 border-t border-line bg-surface-0 px-6 py-4">
          <Button type="submit" className="flex-1" loading={create.isPending}>
            {t("master.products.add")}
          </Button>
          <Button type="button" variant="secondary" onClick={onClose} disabled={create.isPending}>
            {t("master.cancel")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
