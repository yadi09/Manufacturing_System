import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { TextField } from "../../components/TextField";
import { isDuplicate, nameErrors, PanelFrame, useErrorText } from "./Shared";

interface Item {
  name: string;
  name_am: string;
  active?: boolean;
}

/**
 * Add or rename something that is just a name in both languages (a reason, a profession, a store).
 * `retire` is offered when the item exists and can be retired.
 */
export function NamePanel({ title, item, submitLabel, save, pending, onClose, retireTitle, retireBody, note }: {
  title: string;
  item?: Item;
  submitLabel: string;
  save: (v: { name: string; name_am: string; active?: boolean }, done: { onSuccess: () => void; onError: (e: unknown) => void }) => void;
  pending: boolean;
  onClose: () => void;
  /** When set (and the item exists), the panel offers Retire and Reactivate. */
  retireTitle?: string;
  retireBody?: string;
  note?: ReactNode;
}) {
  const { t } = useTranslation();
  const errorText = useErrorText();
  const [name, setName] = useState(item?.name ?? "");
  const [nameAm, setNameAm] = useState(item?.name_am ?? "");
  const [errors, setErrors] = useState<{ name?: string; nameAm?: string }>({});
  const [problem, setProblem] = useState<string | null>(null);
  const dirty = !item || name.trim() !== item.name || nameAm.trim() !== item.name_am;

  const fail = (err: unknown) => (isDuplicate(err) ? setErrors({ name: t("master.errors.duplicateName") }) : setProblem(errorText(err)));
  const send = (active?: boolean) => save({ name: name.trim() || (item?.name ?? ""), name_am: nameAm.trim() || (item?.name_am ?? ""), active }, { onSuccess: onClose, onError: fail });

  function submit() {
    setProblem(null);
    const e = nameErrors(t, name, nameAm);
    setErrors(e);
    if (!e.name && !e.nameAm) send();
  }

  return (
    <PanelFrame
      title={title}
      onClose={onClose}
      busy={pending}
      dirty={dirty}
      problem={problem}
      submitLabel={submitLabel}
      onSubmit={submit}
      retire={
        item && retireTitle && item.active !== undefined
          ? { active: item.active, title: retireTitle, body: retireBody ?? "", pending, onRetire: () => send(false), onReactivate: () => send(true) }
          : undefined
      }
    >
      <TextField label={t("master.nameEn")} value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" required error={errors.name} />
      <TextField label={t("master.nameAm")} lang="am" value={nameAm} onChange={(e) => setNameAm(e.target.value)} autoComplete="off" required error={errors.nameAm} />
      {note}
    </PanelFrame>
  );
}
