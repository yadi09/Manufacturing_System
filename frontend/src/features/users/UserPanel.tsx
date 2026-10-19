import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../../components/Button";
import { Chip } from "../../components/Chip";
import { Icon } from "../../components/Icon";
import { Modal } from "../../components/Modal";
import { Notice } from "../../components/Notice";
import { TextField } from "../../components/TextField";
import type { RoleInfo, UserSummary } from "./api";
import { DeactivateDialog } from "./DeactivateDialog";
import { userErrorKey } from "./errors";
import { useCreateUser, useUpdateUser } from "./hooks";
import { generatePassword } from "./password";
import { ResetPasswordDialog } from "./PasswordDialogs";
import { roleDescription, roleName } from "./roleText";

const MIN_LENGTH = 10;

interface Props {
  /** The person being edited, or undefined to add a new user. */
  user?: UserSummary;
  roles: RoleInfo[];
  onClose: () => void;
  /** After adding or resetting: the parent shows the password once. */
  onPassword: (kind: "created" | "reset", name: string, password: string) => void;
}

export function UserPanel({ user, roles, onClose, onPassword }: Props) {
  const { t, i18n } = useTranslation();
  const create = useCreateUser();
  const update = useUpdateUser();
  const [fullName, setFullName] = useState(user?.full_name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [password, setPassword] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set(user?.roles ?? []));
  const [problem, setProblem] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<"email" | "password" | "name" | null>(null);
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);
  const [resetting, setResetting] = useState(false);

  const editing = Boolean(user);
  const busy = create.isPending || update.isPending;
  const sameRoles = user && user.roles.length === picked.size && user.roles.every((r) => picked.has(r));
  const dirty = !user || fullName.trim() !== user.full_name || !sameRoles;

  function toggle(key: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  }

  function fail(err: unknown) {
    const key = userErrorKey(err);
    setFieldError(key === "emailTaken" || key === "invalidEmail" ? "email" : key === "weakPassword" ? "password" : null);
    setProblem(key);
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    setProblem(null);
    setFieldError(null);
    const roleKeys = roles.filter((r) => picked.has(r.key)).map((r) => r.key);
    if (!fullName.trim()) return setFieldError("name");
    if (user) {
      update.mutate({ id: user.id, full_name: fullName.trim(), roles: roleKeys }, { onSuccess: onClose, onError: fail });
      return;
    }
    if (!email.trim()) return setFieldError("email");
    if (password.length < MIN_LENGTH) return setFieldError("password");
    create.mutate(
      { email: email.trim(), full_name: fullName.trim(), password, roles: roleKeys },
      { onSuccess: () => onPassword("created", fullName.trim(), password), onError: fail },
    );
  }

  function setActive(active: boolean) {
    if (!user) return;
    setProblem(null);
    update.mutate({ id: user.id, active }, { onError: fail });
  }

  const title = editing ? t("users.panel.edit") : t("users.panel.add");

  return (
    <Modal variant="panel" title={title} onClose={onClose} dismissible={!busy}>
      <form onSubmit={submit} noValidate className="flex min-h-full flex-1 flex-col">
        <div className="flex items-center justify-between gap-3 border-b border-line px-6 py-4">
          <span className="text-lg font-semibold" style={{ lineHeight: "26px" }} aria-hidden="true">
            {title}
          </span>
          <button type="button" aria-label={t("users.close")} onClick={onClose} className="flex size-12 items-center justify-center rounded-md hover:bg-surface-100">
            <Icon name="close" size={24} />
          </button>
        </div>

        <div className="flex flex-1 flex-col gap-6 p-6">
          {problem && !fieldError && (
            <Notice tone="danger" title={t(`users.errors.${problem === "lastAdmin" ? "lastAdmin" : "title"}`)}>
              {problem === "lastAdmin" ? t("users.errors.lastAdminBody") : t(`users.errors.${problem}`)}
            </Notice>
          )}

          <TextField
            label={t("users.form.fullName")}
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            autoComplete="off"
            required
            error={fieldError === "name" ? t("users.form.nameRequired") : undefined}
          />

          <div className="flex flex-col gap-2">
            <TextField
              label={t("users.form.email")}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              readOnly={editing}
              autoComplete="off"
              required={!editing}
              className={editing ? "border-line bg-surface-50 text-ink-muted" : ""}
              error={fieldError === "email" ? t(problem === "emailTaken" ? "users.errors.emailTaken" : problem === "invalidEmail" ? "users.errors.invalidEmail" : "users.form.emailRequired") : undefined}
            />
            {editing && <span className="text-[13px] text-ink-muted" style={{ lineHeight: "18px" }}>{t("users.form.emailLocked")}</span>}
          </div>

          {!editing && (
            <div className="flex flex-col gap-2">
              <TextField
                label={t("users.form.password")}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="off"
                spellCheck={false}
                autoCapitalize="off"
                required
                error={fieldError === "password" ? t("users.form.passwordShort") : undefined}
                trailing={
                  <button type="button" onClick={() => setPassword(generatePassword())} className="h-10 rounded-[8px] border border-control-border bg-surface-0 px-3 text-sm font-medium">
                    {t("users.form.generate")}
                  </button>
                }
              />
              <span className="text-[13px] text-ink-muted" style={{ lineHeight: "18px" }}>
                {t("users.form.passwordHelp")}
              </span>
            </div>
          )}

          {user && (
            <div className="flex flex-col gap-3 rounded-md bg-surface-50 p-4">
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium">{t("users.status.label")}</span>
                {user.active ? (
                  <Chip tone="active" icon="check">
                    {t("users.status.active")}
                  </Chip>
                ) : (
                  <Chip tone="off" icon="ban">
                    {t("users.status.off")}
                  </Chip>
                )}
              </div>
              <p className="text-[13px] text-ink-muted" style={{ lineHeight: "18px" }}>
                {user.active ? t("users.status.activeHelp") : t("users.status.offHelp")}
              </p>
              {user.active ? (
                <Button type="button" variant="secondary" className="self-start border-danger text-danger" onClick={() => setConfirmDeactivate(true)} disabled={busy}>
                  {t("users.deactivate.button")}
                </Button>
              ) : (
                <Button type="button" variant="secondary" className="self-start" onClick={() => setActive(true)} loading={update.isPending && update.variables?.active === true}>
                  {t("users.reactivate")}
                </Button>
              )}
            </div>
          )}

          <fieldset className="flex min-w-0 flex-col gap-1">
            <legend className="p-0 text-sm font-medium" style={{ lineHeight: "20px" }}>
              {t("users.form.roles")}
            </legend>
            <span className="mb-1 text-[13px] text-ink-muted" style={{ lineHeight: "18px" }}>
              {t("users.form.rolesHelp")}
            </span>
            {roles.map((r) => (
              <label key={r.key} className={`flex min-h-12 cursor-pointer items-start gap-3 rounded-md px-3 py-2.5 ${picked.has(r.key) ? "bg-brand-tint" : ""}`}>
                <input type="checkbox" checked={picked.has(r.key)} onChange={() => toggle(r.key)} className="mt-0.5 size-[22px] shrink-0 accent-brand" />
                <span className="flex flex-col">
                  <span>{roleName(r, i18n.language)}</span>
                  <span className="text-[13px] text-ink-muted" style={{ lineHeight: "18px" }}>
                    {roleDescription(r, i18n.language)}
                  </span>
                </span>
              </label>
            ))}
          </fieldset>

          {user && (
            <div className="flex flex-col gap-2 border-t border-line pt-6">
              <h3 className="font-semibold">{t("users.reset.section")}</h3>
              <p className="text-sm text-ink-muted">{t("users.reset.sectionBody")}</p>
              <Button type="button" variant="secondary" className="self-start" onClick={() => setResetting(true)}>
                {t("users.reset.button")}
              </Button>
            </div>
          )}
        </div>

        <div className="sticky bottom-0 flex gap-3 border-t border-line bg-surface-0 px-6 py-4">
          <Button type="submit" className="flex-1" loading={busy && !(update.variables?.active !== undefined)} disabled={!dirty}>
            {editing ? t("users.panel.save") : t("users.panel.create")}
          </Button>
          <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>
            {t("users.cancel")}
          </Button>
        </div>
      </form>

      {user && confirmDeactivate && (
        <DeactivateDialog
          user={user}
          onClose={() => setConfirmDeactivate(false)}
          onFailed={fail}
        />
      )}
      {user && resetting && (
        <ResetPasswordDialog
          user={user}
          onClose={() => setResetting(false)}
          onDone={(pw) => {
            setResetting(false);
            onPassword("reset", user.full_name, pw);
          }}
        />
      )}
    </Modal>
  );
}
