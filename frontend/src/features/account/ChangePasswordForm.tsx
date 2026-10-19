import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "../../components/Button";
import { Icon } from "../../components/Icon";
import { Notice } from "../../components/Notice";
import { TextField } from "../../components/TextField";
import { changePassword } from "./api";
import { passwordProblem, type PasswordProblem } from "./errors";

const MIN_LENGTH = 10;

type FieldErrors = { current?: "wrong"; next?: "short" | "same"; repeat?: "mismatch" };

/**
 * Changing your own password. In `forced` mode (first sign-in, or after an administrator reset)
 * it is the only thing on the page, and saving lets the person into the app.
 */
export function ChangePasswordForm({ forced }: { forced?: boolean }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  const [show, setShow] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [problem, setProblem] = useState<PasswordProblem | null>(null);
  const [done, setDone] = useState(false);

  const change = useMutation({
    mutationFn: () => changePassword(current, next),
    onSuccess: () => {
      setCurrent("");
      setNext("");
      setRepeat("");
      setShow(false);
      setDone(true);
      // In forced mode this refreshes "who am I", which lets the person into the app.
      void qc.invalidateQueries({ queryKey: ["me"] });
    },
    onError: (err) => {
      const p = passwordProblem(err);
      if (p === "wrong") setErrors({ current: "wrong" });
      else if (p === "short" || p === "same") setErrors({ next: p });
      else setProblem(p);
    },
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    if (change.isPending) return;
    setErrors({});
    setProblem(null);
    setDone(false);
    // Cheap checks first, so the person is not sent to the server for a typo.
    if (next.length < MIN_LENGTH) return setErrors({ next: "short" });
    if (next === current) return setErrors({ next: "same" });
    if (next !== repeat) return setErrors({ repeat: "mismatch" });
    change.mutate();
  }

  const type = show ? "text" : "password";
  const toggle = (
    <button
      type="button"
      onClick={() => setShow((s) => !s)}
      aria-label={show ? t("account.password.hideAll") : t("account.password.showAll")}
      className="flex h-10 items-center gap-1.5 rounded-[8px] px-2.5 text-sm font-medium text-brand hover:bg-brand-tint"
    >
      <Icon name={show ? "eyeOff" : "eye"} />
      {show ? t("account.password.hide") : t("account.password.show")}
    </button>
  );

  return (
    <section className="flex flex-col gap-5 rounded-lg bg-surface-0 p-6 shadow-card">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold" style={{ lineHeight: "26px" }}>
          {forced ? t("account.password.titleForced") : t("account.password.title")}
        </h2>
        <p className="text-sm text-ink-muted">{forced ? t("account.password.subForced") : t("account.password.sub")}</p>
      </div>

      {done && !forced && (
        <Notice tone="info" icon="check" title={t("account.password.okTitle")}>
          {t("account.password.okBody")}
        </Notice>
      )}
      {problem === "offline" && (
        <Notice tone="warning" icon="offline" title={t("account.password.offline.title")}>
          {t("account.password.offline.body")}
        </Notice>
      )}
      {problem === "other" && (
        <Notice tone="danger" title={t("account.password.other.title")}>
          {t("account.password.other.body")}
        </Notice>
      )}

      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <TextField
          label={t("account.password.current")}
          type={type}
          name="current-password"
          autoComplete="current-password"
          required
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          error={errors.current ? t("account.password.errWrong") : undefined}
          trailing={toggle}
        />
        <div className="flex flex-col gap-2">
          <TextField
            label={t("account.password.new")}
            type={type}
            name="new-password"
            autoComplete="new-password"
            required
            value={next}
            onChange={(e) => setNext(e.target.value)}
            error={errors.next ? t(errors.next === "short" ? "account.password.errShort" : "account.password.errSame") : undefined}
          />
          <span className="text-[13px] text-ink-muted" style={{ lineHeight: "18px" }}>
            {t("account.password.rules")}
          </span>
        </div>
        <TextField
          label={t("account.password.repeat")}
          type={type}
          name="repeat-password"
          autoComplete="new-password"
          required
          value={repeat}
          onChange={(e) => setRepeat(e.target.value)}
          error={errors.repeat ? t("account.password.errMismatch") : undefined}
        />
        <Button type="submit" className="mt-1" loading={change.isPending}>
          {forced ? t("account.password.submitForced") : t("account.password.submit")}
        </Button>
        <p className="text-[13px] text-ink-muted" style={{ lineHeight: "18px" }}>
          {forced ? t("account.password.noteForced") : t("account.password.note")}
        </p>
      </form>
    </section>
  );
}
