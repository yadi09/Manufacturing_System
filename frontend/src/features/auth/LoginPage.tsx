import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../../components/Button";
import { EggTrayPattern } from "../../components/EggTrayPattern";
import { Icon } from "../../components/Icon";
import { LanguageSwitch } from "../../components/LanguageSwitch";
import { Notice } from "../../components/Notice";
import { TextField } from "../../components/TextField";
import { formatDate } from "../../lib/calendar/format";
import { useCalendar } from "../../lib/calendar/preference";
import { loginProblem, type LoginProblem } from "./loginErrors";
import { useLogin } from "./useSession";

const FILLED_SMALL: Array<[number, number]> = [[3, 0], [7, 1], [1, 2], [6, 3], [9, 2]];
const FILLED_LARGE: Array<[number, number]> = [[2, 1], [5, 2], [8, 1], [3, 4], [9, 5], [6, 7], [1, 9], [7, 10], [4, 11]];

export function LoginPage() {
  const { t } = useTranslation();
  const login = useLogin();
  const [calendar] = useCalendar();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [problem, setProblem] = useState<LoginProblem | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // While sign-in is paused, tick so the message and the button follow the clock.
  const lockedUntil = problem?.kind === "locked" ? problem.until : 0;
  useEffect(() => {
    if (!lockedUntil) return;
    const id = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(id);
  }, [lockedUntil]);
  const stillLocked = lockedUntil > now;
  const minutesLeft = Math.max(1, Math.ceil((lockedUntil - now) / 60_000));

  function submit(e: FormEvent) {
    e.preventDefault();
    if (login.isPending || stillLocked) return;
    setProblem(null);
    login.mutate(
      { email, password },
      {
        onError: (err) => {
          const p = loginProblem(err);
          setNow(Date.now());
          setProblem(p);
        },
      },
    );
  }

  const invalid = problem?.kind === "invalid";

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[minmax(0,720fr)_minmax(0,560fr)]">
      <aside className="relative flex h-[216px] flex-col gap-5 overflow-hidden bg-brand-deep px-4 py-6 text-on-brand md:h-[400px] md:gap-10 md:px-8 md:py-10 lg:h-auto lg:min-h-dvh lg:justify-between lg:p-12">
        <EggTrayPattern pitch={40} radius={16} filled={FILLED_SMALL} className="absolute inset-0 md:hidden" />
        <EggTrayPattern pitch={64} radius={22} filled={FILLED_LARGE} className="absolute inset-0 hidden md:block" />

        <div className="relative flex items-center justify-between gap-3">
          <span className="text-base font-semibold md:text-lg" style={{ lineHeight: "26px" }}>
            {t("app.name")}
          </span>
          <span className="hidden text-sm text-on-brand-muted md:inline lg:hidden">{formatDate(t, new Date(), calendar)}</span>
          <span className="hidden items-center gap-3 text-sm text-on-brand-muted lg:flex">
            <span aria-hidden="true" className="h-5 w-px bg-on-brand-muted" />
            {t("login.productLine")}
          </span>
        </div>

        <div className="relative -ml-4 flex max-w-[520px] flex-col gap-3 self-start rounded-r-lg bg-brand-deep py-3 pl-4 pr-4 md:-ml-8 md:py-6 md:pl-8 md:pr-6 lg:-ml-12 lg:gap-4 lg:py-8 lg:pl-12 lg:pr-8">
          <h2 className="text-[28px] font-semibold leading-9 tracking-tight am:leading-10 md:text-4xl md:leading-[44px] am:md:leading-[52px] lg:text-[40px] lg:leading-12 am:lg:leading-[56px]">
            {t("login.statement")}
          </h2>
          <p className="hidden text-base text-on-brand-muted md:block lg:text-lg am:leading-7 lg:leading-7 am:lg:leading-[30px]">
            <span className="lg:hidden">{t("login.statementShort")}</span>
            <span className="hidden lg:inline">{t("login.statementLong")}</span>
          </p>
        </div>

        <div className="relative hidden items-center justify-between text-sm text-on-brand-muted lg:flex">
          <span>{formatDate(t, new Date(), calendar)}</span>
          <span>{t("login.products")}</span>
        </div>
      </aside>

      <main className="relative -mt-8 flex justify-center px-4 pb-8 md:-mt-[72px] md:px-8 lg:mt-0 lg:items-center lg:bg-surface-0 lg:p-12">
        <div className="flex w-full max-w-[440px] flex-col gap-6 rounded-lg bg-surface-0 p-6 shadow-raised md:p-10 lg:p-0 lg:shadow-none">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm font-medium text-ink-muted">{t("app.name")}</span>
            <LanguageSwitch />
          </div>

          <div className="flex flex-col gap-1.5">
            <h1 className="text-[28px] font-semibold leading-9 am:leading-10">{t("login.title")}</h1>
            <p className="text-ink-muted">{t("login.subtitle")}</p>
          </div>

          {problem?.kind === "invalid" && (
            <Notice tone="danger" title={t("login.invalid.title")}>
              {t("login.invalid.body")}
            </Notice>
          )}
          {problem?.kind === "locked" && stillLocked && (
            <Notice tone="warning" title={t("login.locked.title")}>
              {t("login.locked.body", { count: minutesLeft })}
            </Notice>
          )}
          {problem?.kind === "offline" && (
            <Notice tone="warning" icon="offline" title={t("login.offline.title")}>
              {t("login.offline.body")}
            </Notice>
          )}
          {problem?.kind === "other" && (
            <Notice tone="danger" title={t("login.other.title")}>
              {t("login.other.body")}
            </Notice>
          )}

          <form onSubmit={submit} noValidate className="flex flex-col gap-4">
            <TextField
              label={t("login.email")}
              type="email"
              name="email"
              autoComplete="username"
              inputMode="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
              invalid={invalid}
            />
            <TextField
              label={t("login.password")}
              type={showPassword ? "text" : "password"}
              name="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              error={invalid ? t("login.fieldError") : undefined}
              trailing={
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  aria-label={showPassword ? t("login.hidePassword") : t("login.showPassword")}
                  className="flex h-10 items-center gap-1.5 rounded-[8px] px-2.5 text-sm font-medium text-brand hover:bg-brand-tint"
                >
                  <Icon name={showPassword ? "eyeOff" : "eye"} />
                  {showPassword ? t("login.hide") : t("login.show")}
                </button>
              }
            />
            <Button type="submit" className="mt-2" loading={login.isPending} disabled={stillLocked}>
              {login.isPending ? t("login.busy") : t("login.submit")}
            </Button>
          </form>

          <p className="text-sm text-ink-muted">{t("login.help")}</p>
        </div>
      </main>
    </div>
  );
}
