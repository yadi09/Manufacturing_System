import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../../components/Button";
import { Icon } from "../../components/Icon";
import { Modal } from "../../components/Modal";
import { Notice } from "../../components/Notice";
import { TextField } from "../../components/TextField";
import type { UserSummary } from "./api";
import { userErrorKey } from "./errors";
import { useResetPassword } from "./hooks";
import { generatePassword } from "./password";

const MIN_LENGTH = 10;

export function ResetPasswordDialog({ user, onClose, onDone }: { user: UserSummary; onClose: () => void; onDone: (password: string) => void }) {
  const { t } = useTranslation();
  const reset = useResetPassword();
  const [password, setPassword] = useState("");
  const [short, setShort] = useState(false);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (password.length < MIN_LENGTH) {
      setShort(true);
      return;
    }
    setShort(false);
    reset.mutate({ id: user.id, password }, { onSuccess: () => onDone(password) });
  }

  return (
    <Modal title={t("users.reset.title", { name: user.full_name })} onClose={onClose} dismissible={!reset.isPending}>
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        {reset.isError && (
          <Notice tone="danger" title={t("users.errors.title")}>
            {t(`users.errors.${userErrorKey(reset.error)}`)}
          </Notice>
        )}
        <div className="flex flex-col gap-2">
          <TextField
            label={t("users.reset.newPassword")}
            name="new-password"
            autoComplete="off"
            spellCheck={false}
            autoCapitalize="off"
            data-autofocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={short ? t("users.form.passwordShort") : undefined}
            trailing={
              <button
                type="button"
                onClick={() => setPassword(generatePassword())}
                className="h-10 rounded-[8px] border border-control-border bg-surface-0 px-3 text-sm font-medium"
              >
                {t("users.form.generate")}
              </button>
            }
          />
          <span className="text-[13px] text-ink-muted" style={{ lineHeight: "18px" }}>
            {t("users.form.passwordHelp")}
          </span>
        </div>
        <Notice tone="warning" title={t("users.reset.sessionsTitle")}>
          {t("users.reset.sessionsBody", { name: user.full_name })}
        </Notice>
        <div className="flex gap-3">
          <Button type="submit" className="flex-1" loading={reset.isPending}>
            {t("users.reset.submit")}
          </Button>
          <Button type="button" variant="secondary" onClick={onClose} disabled={reset.isPending}>
            {t("users.cancel")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/** Shows a password exactly once. It lives only in this dialog's props and is gone when it closes. */
export function PasswordResultDialog({ kind, name, password, onClose }: { kind: "created" | "reset"; name: string; password: string; onClose: () => void }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
    } catch {
      setCopied(false); // the password is still on screen to copy by hand
    }
  }

  return (
    <Modal title={t(`users.result.title.${kind}`, { name })} onClose={onClose}>
      <p>{t("users.result.body", { name })}</p>
      <div className="flex items-center gap-2 rounded-md bg-brand-tint px-3.5 py-3">
        <output aria-label={t("users.result.passwordLabel")} className="tabular flex-1 break-all text-xl font-semibold tracking-wide" style={{ lineHeight: "28px" }}>
          {password}
        </output>
        <Button type="button" variant="secondary" className="h-11 px-3.5 text-sm font-medium" onClick={copy} icon={<Icon name={copied ? "check" : "copy"} />}>
          {copied ? t("users.result.copied") : t("users.result.copy")}
        </Button>
      </div>
      <p className="text-sm text-ink-muted">{t("users.result.mustChange")}</p>
      <Button type="button" onClick={onClose} data-autofocus>
        {t("users.result.done")}
      </Button>
    </Modal>
  );
}
