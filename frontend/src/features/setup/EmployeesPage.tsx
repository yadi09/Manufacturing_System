import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router";
import { AppShell } from "../../components/AppShell";
import { Button } from "../../components/Button";
import { Chip } from "../../components/Chip";
import { Icon } from "../../components/Icon";
import { Tabs } from "../../components/Tabs";
import { TextField } from "../../components/TextField";
import type { User } from "../auth/api";
import { localName } from "../masterdata/names";
import { useUsers } from "../users/hooks";
import type { Employee, Profession } from "./api";
import { useCreateEmployee, useCreateProfession, useEmployees, useProfessions, useUpdateEmployee, useUpdateProfession } from "./hooks";
import { NamePanel } from "./NamePanel";
import { ListState, Names, PanelFrame, Row, StatusChip, useErrorText } from "./Shared";

const EMP_COLUMNS = "md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1.5fr)_110px]";
const PROF_COLUMNS = "md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_110px]";

type Filter = "all" | "noAccount" | "account" | "retired";

/** The name to show: the Amharic spelling when the language is Amharic and one was given. */
const personName = (e: Employee, lang: string) => (lang.startsWith("am") && e.name_am ? e.name_am : e.full_name);
const otherPersonName = (e: Employee, lang: string) => (lang.startsWith("am") ? (e.name_am ? e.full_name : "") : (e.name_am ?? ""));

export function EmployeesPage({ me }: { me: User }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const employees = useEmployees();
  const professions = useProfessions();
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") === "professions" ? "professions" : "employees";
  const canManage = me.permissions.includes("masterdata.manage");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [empPanel, setEmpPanel] = useState<{ employee?: Employee } | null>(null);
  const [profPanel, setProfPanel] = useState<{ profession?: Profession } | null>(null);
  const createProf = useCreateProfession();
  const updateProf = useUpdateProfession();

  const profById = useMemo(() => new Map((professions.data ?? []).map((p) => [p.id, p])), [professions.data]);
  const all = employees.data ?? [];
  const shown = all.filter((e) => {
    const q = search.trim().toLowerCase();
    if (q && !`${e.full_name} ${e.name_am ?? ""} ${e.email ?? ""}`.toLowerCase().includes(q)) return false;
    if (filter === "retired") return !e.active;
    if (!e.active) return false;
    if (filter === "noAccount") return !e.user_id;
    if (filter === "account") return Boolean(e.user_id);
    return true;
  });
  const profs = professions.data ?? [];

  const action =
    canManage &&
    (tab === "employees" ? (
      <Button onClick={() => setEmpPanel({})} icon={<Icon name="plus" />} disabled={professions.isSuccess && profs.filter((p) => p.active).length === 0}>
        {t("setup.employees.add")}
      </Button>
    ) : (
      <Button onClick={() => setProfPanel({})} icon={<Icon name="plus" />}>
        {t("setup.professions.add")}
      </Button>
    ));

  return (
    <AppShell user={me} title={t("nav.employees")} subtitle={t(tab === "employees" ? "setup.employees.intro" : "setup.professions.intro")} actions={action}>
      <Tabs
        label={t("nav.employees")}
        active={tab}
        onChange={(k) => setParams(k === "employees" ? {} : { tab: k }, { replace: true })}
        tabs={[
          { key: "employees", label: `${t("setup.employees.tab")} (${all.filter((e) => e.active).length})` },
          { key: "professions", label: `${t("setup.professions.tab")} (${profs.filter((p) => p.active).length})` },
        ]}
      />
      {tab === "employees" ? (
        <div role="tabpanel" id="panel-employees" aria-labelledby="tab-employees" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-0 flex-[1_1_260px]">
              <TextField label={t("setup.employees.search")} type="search" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <div role="group" aria-label={t("setup.employees.show")} className="flex flex-wrap gap-2">
              {(["all", "noAccount", "account", "retired"] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  aria-pressed={filter === f}
                  onClick={() => setFilter(f)}
                  className={`h-11 rounded-full border px-4 text-sm font-medium ${filter === f ? "border-brand bg-brand text-on-brand" : "border-control-border bg-surface-0 text-ink"}`}
                >
                  {t(`setup.employees.filter.${f}`)}
                </button>
              ))}
            </div>
          </div>
          {profs.length === 0 && professions.isSuccess && canManage && <p className="text-sm text-ink-muted">{t("setup.employees.needProfession")}</p>}
          <ListState query={employees} empty={employees.isSuccess && shown.length === 0} emptyTitle={t(all.length ? "setup.employees.noMatch" : "setup.employees.emptyTitle")} emptyBody={t(all.length ? "setup.employees.noMatchBody" : "setup.employees.emptyBody")} />
          {shown.map((e) => {
            const p = profById.get(e.profession_id);
            const other = otherPersonName(e, lang);
            return (
              <Row key={e.id} columns={EMP_COLUMNS} label={t("setup.openFor", { name: personName(e, lang) })} onOpen={canManage ? () => setEmpPanel({ employee: e }) : undefined}>
                <span className="flex min-w-0 flex-col">
                  <span className={`font-semibold ${e.active ? "" : "text-ink-muted"}`}>{personName(e, lang)}</span>
                  {other && (
                    <span className="text-[13px] text-ink-muted" style={{ lineHeight: "20px" }}>
                      {other}
                    </span>
                  )}
                </span>
                <span>{p && <Chip>{localName(p, lang)}</Chip>}</span>
                <span className="flex min-w-0 flex-col text-sm" style={{ lineHeight: "20px" }}>
                  {e.email ? (
                    <>
                      <span className="truncate">{e.email}</span>
                      <span className="text-[13px] text-ink-muted">{t("setup.employees.signsIn")}</span>
                    </>
                  ) : (
                    <>
                      <span className="text-ink-muted">{t("setup.employees.noAccount")}</span>
                      <span className="text-[13px] text-ink-muted">{t("setup.employees.recordedBy")}</span>
                    </>
                  )}
                </span>
                <span>
                  <StatusChip active={e.active} />
                </span>
              </Row>
            );
          })}
        </div>
      ) : (
        <div role="tabpanel" id="panel-professions" aria-labelledby="tab-professions" className="flex flex-col gap-3">
          <ListState query={professions} empty={professions.isSuccess && profs.length === 0} emptyTitle={t("setup.professions.emptyTitle")} emptyBody={t("setup.professions.emptyBody")} />
          {profs.map((p) => (
            <Row key={p.id} columns={PROF_COLUMNS} label={t("setup.renameFor", { name: localName(p, lang) })} onOpen={canManage ? () => setProfPanel({ profession: p }) : undefined}>
              <Names item={p} active={p.active} />
              <span className="text-sm text-ink-muted">{p.employees ? t("setup.professions.count", { count: p.employees }) : t("setup.professions.none")}</span>
              <span>
                <StatusChip active={p.active} />
              </span>
            </Row>
          ))}
        </div>
      )}
      {empPanel && <EmployeePanel key={empPanel.employee?.id ?? "new"} employee={empPanel.employee} professions={profs} taken={new Set(all.filter((e) => e.user_id && e.id !== empPanel.employee?.id).map((e) => e.user_id as string))} onClose={() => setEmpPanel(null)} />}
      {profPanel && (
        <NamePanel
          key={profPanel.profession?.id ?? "new"}
          title={profPanel.profession ? t("setup.professions.edit") : t("setup.professions.add")}
          submitLabel={profPanel.profession ? t("master.save") : t("setup.professions.add")}
          item={profPanel.profession}
          pending={createProf.isPending || updateProf.isPending}
          onClose={() => setProfPanel(null)}
          retireTitle={profPanel.profession && t("setup.retireTitle", { name: localName(profPanel.profession, lang) })}
          retireBody={t("setup.professions.retireBody")}
          save={(v, done) => (profPanel.profession ? updateProf.mutate({ id: profPanel.profession.id, ...v, active: v.active ?? profPanel.profession.active }, done) : createProf.mutate(v, done))}
        />
      )}
    </AppShell>
  );
}

function EmployeePanel({ employee, professions, taken, onClose }: { employee?: Employee; professions: Profession[]; taken: Set<string>; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const errorText = useErrorText();
  const users = useUsers();
  const create = useCreateEmployee();
  const update = useUpdateEmployee();
  const choices = professions.filter((p) => p.active || p.id === employee?.profession_id);
  const [fullName, setFullName] = useState(employee?.full_name ?? "");
  const [nameAm, setNameAm] = useState(employee?.name_am ?? "");
  const [profession, setProfession] = useState(employee?.profession_id ?? choices[0]?.id ?? "");
  const [account, setAccount] = useState(employee?.user_id ?? "");
  const [errors, setErrors] = useState<{ name?: string; account?: string }>({});
  const [problem, setProblem] = useState<string | null>(null);
  const busy = create.isPending || update.isPending;
  const dirty = !employee || fullName.trim() !== employee.full_name || nameAm.trim() !== (employee.name_am ?? "") || profession !== employee.profession_id || account !== (employee.user_id ?? "");
  const accounts = (users.data ?? []).filter((u) => u.id === employee?.user_id || (u.active && !taken.has(u.id)));

  function fail(err: unknown) {
    const text = errorText(err);
    if (err && typeof err === "object" && "code" in err && err.code === "account_linked") setErrors({ account: text });
    else setProblem(text);
  }

  function send(active?: boolean) {
    const input = { full_name: fullName.trim(), name_am: nameAm.trim() || null, profession_id: profession, user_id: account || null };
    if (employee) update.mutate({ id: employee.id, ...input, active: active ?? employee.active }, { onSuccess: onClose, onError: fail });
    else create.mutate(input, { onSuccess: onClose, onError: fail });
  }

  function submit() {
    setProblem(null);
    const e = fullName.trim() ? {} : { name: t("setup.employees.nameRequired") };
    setErrors(e);
    if (!e.name) send();
  }

  return (
    <PanelFrame
      title={employee ? t("setup.employees.edit") : t("setup.employees.add")}
      onClose={onClose}
      busy={busy}
      dirty={dirty}
      problem={problem}
      submitLabel={employee ? t("master.save") : t("setup.employees.add")}
      onSubmit={submit}
      retire={employee ? { active: employee.active, title: t("setup.retireTitle", { name: personName(employee, lang) }), body: t("setup.employees.retireBody"), pending: update.isPending, onRetire: () => send(false), onReactivate: () => send(true) } : undefined}
    >
      <TextField label={t("setup.employees.fullName")} value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="off" required error={errors.name} />
      <TextField label={t("setup.employees.nameAm")} lang="am" value={nameAm} onChange={(e) => setNameAm(e.target.value)} autoComplete="off" />
      <div className="flex flex-col gap-2">
        <label htmlFor="emp-profession" className="text-sm font-medium">
          {t("setup.employees.profession")}
        </label>
        <select id="emp-profession" value={profession} onChange={(e) => setProfession(e.target.value)} className="h-control-md rounded-md border border-control-border bg-surface-0 px-3 text-base">
          {choices.map((p) => (
            <option key={p.id} value={p.id}>
              {localName(p, lang)}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor="emp-account" className="text-sm font-medium">
          {t("setup.employees.account")}
        </label>
        <select
          id="emp-account"
          value={account}
          onChange={(e) => setAccount(e.target.value)}
          aria-invalid={errors.account ? true : undefined}
          aria-describedby="emp-account-help"
          className={`h-control-md rounded-md border bg-surface-0 px-3 text-base ${errors.account ? "border-danger" : "border-control-border"}`}
        >
          <option value="">{t("setup.employees.noAccount")}</option>
          {accounts.map((u) => (
            <option key={u.id} value={u.id}>
              {`${u.full_name} · ${u.email}`}
            </option>
          ))}
        </select>
        <span id="emp-account-help" className={`text-[13px] ${errors.account ? "text-danger" : "text-ink-muted"}`}>
          {errors.account ?? t("setup.employees.accountHelp")}
        </span>
      </div>
    </PanelFrame>
  );
}
