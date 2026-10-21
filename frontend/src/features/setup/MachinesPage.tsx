import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router";
import { AppShell } from "../../components/AppShell";
import { Button } from "../../components/Button";
import { Chip } from "../../components/Chip";
import { Choice } from "../../components/Choice";
import { Icon } from "../../components/Icon";
import { Tabs } from "../../components/Tabs";
import { TextField } from "../../components/TextField";
import type { User } from "../auth/api";
import type { Product } from "../masterdata/api";
import { isPositiveDecimal, trimDecimal } from "../masterdata/format";
import { useProducts } from "../masterdata/hooks";
import { localName } from "../masterdata/names";
import type { Mould, Setup, Shift, Workspace } from "./api";
import { useCreateMould, useCreateWorkspace, useMoulds, useSetMould, useShifts, useUpdateMould, useUpdateWorkspace, useWorkspaces } from "./hooks";
import { isDuplicate, ListState, Names, nameErrors, PanelFrame, Row, StatusChip, useErrorText } from "./Shared";
import { shiftMinutes } from "./ShiftsPage";

const WS_COLUMNS = "md:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)_minmax(0,1.7fr)_110px]";
const MOULD_COLUMNS = "md:grid-cols-[minmax(0,1.3fr)_minmax(0,0.8fr)_minmax(0,1.6fr)_110px]";
const KINDS = ["machine", "qc", "recycling"] as const;

/** Target pieces for a shift: planned hours × 3600 ÷ cycle time × cavities (Crown's weekly report formula). */
export function targetPieces(hours: number, cycleS: number, cavities: number) {
  return Math.round(((hours * 3600) / cycleS) * cavities);
}

export function MachinesPage({ me }: { me: User }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const workspaces = useWorkspaces();
  const moulds = useMoulds();
  const products = useProducts();
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") === "moulds" ? "moulds" : "machines";
  const canManage = me.permissions.includes("masterdata.manage");
  const [wsPanel, setWsPanel] = useState<{ workspace?: Workspace } | null>(null);
  const [mouldPanel, setMouldPanel] = useState<{ mould?: Mould } | null>(null);
  const all = workspaces.data ?? [];
  const allMoulds = moulds.data ?? [];
  const mouldById = useMemo(() => new Map(allMoulds.map((m) => [m.id, m])), [allMoulds]);
  const productById = useMemo(() => new Map((products.data ?? []).map((p) => [p.id, p])), [products.data]);
  const where = (mouldId: string) => all.flatMap((w) => w.setups.filter((s) => s.mould_id === mouldId && s.active).map((s) => ({ w, s })));

  const action =
    canManage &&
    (tab === "machines" ? (
      <Button onClick={() => setWsPanel({})} icon={<Icon name="plus" />}>
        {t("setup.machines.add")}
      </Button>
    ) : (
      <Button onClick={() => setMouldPanel({})} icon={<Icon name="plus" />} disabled={products.isSuccess && products.data.length === 0}>
        {t("setup.moulds.add")}
      </Button>
    ));

  return (
    <AppShell user={me} title={t("setup.machines.title")} subtitle={t(tab === "machines" ? "setup.machines.intro" : "setup.moulds.intro")} actions={action}>
      <Tabs
        label={t("setup.machines.title")}
        active={tab}
        onChange={(k) => setParams(k === "machines" ? {} : { tab: k }, { replace: true })}
        tabs={[
          { key: "machines", label: `${t("setup.machines.tab")} (${all.filter((w) => w.active).length})` },
          { key: "moulds", label: `${t("setup.moulds.tab")} (${allMoulds.filter((m) => m.active).length})` },
        ]}
      />
      {tab === "machines" ? (
        <div role="tabpanel" id="panel-machines" aria-labelledby="tab-machines" className="flex flex-col gap-3">
          <ListState query={workspaces} empty={workspaces.isSuccess && all.length === 0} emptyTitle={t("setup.machines.emptyTitle")} emptyBody={t("setup.machines.emptyBody")} />
          {all.map((w) => {
            const mounted = w.setups.filter((s) => s.active);
            return (
              <Row key={w.id} columns={WS_COLUMNS} label={t("setup.openFor", { name: localName(w, lang) })} onOpen={canManage ? () => setWsPanel({ workspace: w }) : undefined}>
                <Names item={w} active={w.active} />
                <span className="flex flex-wrap gap-1.5">
                  <Chip>{t(`setup.machines.kinds.${w.kind}`)}</Chip>
                  {w.runs_24h && <Chip tone="neutral">{t("setup.machines.runs24h")}</Chip>}
                </span>
                <span className="flex min-w-0 flex-col text-sm" style={{ lineHeight: "20px" }}>
                  {w.kind !== "machine" ? (
                    <span className="text-ink-muted">{t(`setup.machines.about.${w.kind}`)}</span>
                  ) : mounted.length === 0 ? (
                    <span className="text-ink-muted">{t("setup.machines.noMould")}</span>
                  ) : (
                    mounted.map((s) => {
                      const m = mouldById.get(s.mould_id);
                      return (
                        <span key={s.mould_id} className="flex flex-col">
                          <span className="font-medium">{m ? localName(m, lang) : ""}{m?.cavities ? ` · ${t("setup.moulds.cavities", { count: m.cavities })}` : ""}</span>
                          <span className="text-[13px] text-ink-muted">{s.standard_cycle_s ? t("setup.machines.standard", { s: trimDecimal(s.standard_cycle_s) }) : t("setup.machines.cycleNotSet")}</span>
                        </span>
                      );
                    })
                  )}
                </span>
                <span>
                  <StatusChip active={w.active} />
                </span>
              </Row>
            );
          })}
        </div>
      ) : (
        <div role="tabpanel" id="panel-moulds" aria-labelledby="tab-moulds" className="flex flex-col gap-3">
          <ListState query={moulds} empty={moulds.isSuccess && allMoulds.length === 0} emptyTitle={t("setup.moulds.emptyTitle")} emptyBody={t("setup.moulds.emptyBody")} />
          {allMoulds.map((m) => {
            const p = productById.get(m.product_id);
            const on = where(m.id);
            return (
              <Row key={m.id} columns={MOULD_COLUMNS} label={t("setup.openFor", { name: localName(m, lang) })} onOpen={canManage ? () => setMouldPanel({ mould: m }) : undefined}>
                <Names item={m} active={m.active} />
                <span>{p && <Chip>{localName(p, lang)}</Chip>}</span>
                <span className="flex min-w-0 flex-col text-sm" style={{ lineHeight: "20px" }}>
                  <span className={m.cavities ? "font-semibold" : "text-ink-muted"}>{m.cavities ? t("setup.moulds.cavities", { count: m.cavities }) : t("setup.moulds.cavitiesNotSet")}</span>
                  <span className="text-[13px] text-ink-muted">
                    {on.length === 0 ? t("setup.moulds.notOnMachine") : on.map(({ w, s }) => (s.standard_cycle_s ? t("setup.moulds.onMachineCycle", { machine: localName(w, lang), s: trimDecimal(s.standard_cycle_s) }) : t("setup.moulds.onMachine", { machine: localName(w, lang) }))).join(" · ")}
                  </span>
                </span>
                <span>
                  <StatusChip active={m.active} />
                </span>
              </Row>
            );
          })}
        </div>
      )}
      {wsPanel && <WorkspacePanel key={wsPanel.workspace?.id ?? "new"} workspace={wsPanel.workspace} moulds={allMoulds} products={products.data ?? []} onClose={() => setWsPanel(null)} />}
      {mouldPanel && <MouldPanel key={mouldPanel.mould?.id ?? "new"} mould={mouldPanel.mould} products={products.data ?? []} onClose={() => setMouldPanel(null)} />}
    </AppShell>
  );
}

interface SetupDraft {
  mould_id: string;
  cycle: string;
  colours: Array<{ colour_id: string; cycle: string }>;
  active: boolean;
  /** Not on the server yet (just put on). */
  isNew: boolean;
}

const draftOf = (s: Setup): SetupDraft => ({ mould_id: s.mould_id, cycle: trimDecimal(s.standard_cycle_s), colours: s.colours.map((c) => ({ colour_id: c.colour_id, cycle: trimDecimal(c.cycle_s) })), active: s.active, isNew: false });
const sameSetup = (a: SetupDraft, b: SetupDraft) => JSON.stringify({ ...a, isNew: false }) === JSON.stringify({ ...b, isNew: false });

/** The longest active shift, used to show what a cycle time means in pieces. */
function longestShift(shifts: Shift[] | undefined) {
  const active = (shifts ?? []).filter((s) => s.active);
  if (active.length === 0) return null;
  return active.reduce((a, b) => (shiftMinutes(b.start_time, b.end_time) > shiftMinutes(a.start_time, a.end_time) ? b : a));
}

function WorkspacePanel({ workspace, moulds, products, onClose }: { workspace?: Workspace; moulds: Mould[]; products: Product[]; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const errorText = useErrorText();
  const create = useCreateWorkspace();
  const update = useUpdateWorkspace();
  const setMould = useSetMould();
  const shifts = useShifts();
  const [name, setName] = useState(workspace?.name ?? "");
  const [nameAm, setNameAm] = useState(workspace?.name_am ?? "");
  const [kind, setKind] = useState<Workspace["kind"]>(workspace?.kind ?? "machine");
  const [runs24h, setRuns24h] = useState(workspace?.runs_24h ?? true);
  const initialSetups = useMemo(() => (workspace?.setups ?? []).filter((s) => s.active).map(draftOf), [workspace]);
  const [setups, setSetups] = useState<SetupDraft[]>(initialSetups);
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const busy = saving || create.isPending;
  const mouldById = new Map(moulds.map((m) => [m.id, m]));
  const productById = new Map(products.map((p) => [p.id, p]));
  const shift = longestShift(shifts.data);
  const hours = shift ? shiftMinutes(shift.start_time, shift.end_time) / 60 : null;

  const fieldsChanged = !workspace || name.trim() !== workspace.name || nameAm.trim() !== workspace.name_am || kind !== workspace.kind || runs24h !== workspace.runs_24h;
  const changedSetups = setups.filter((d) => {
    const before = initialSetups.find((s) => s.mould_id === d.mould_id);
    return !before || !sameSetup(before, d);
  });
  const dirty = fieldsChanged || changedSetups.length > 0;
  const mountable = moulds.filter((m) => m.active && !setups.some((s) => s.mould_id === m.id && s.active));
  const patchSetup = (id: string, p: Partial<SetupDraft>) => setSetups((all) => all.map((s) => (s.mould_id === id ? { ...s, ...p } : s)));

  function fail(err: unknown) {
    if (isDuplicate(err)) setErrors({ name: t("master.errors.duplicateName") });
    else setProblem(errorText(err));
  }

  async function submit(active?: boolean) {
    setProblem(null);
    const e: Record<string, string | undefined> = { ...nameErrors(t, name, nameAm) };
    for (const s of setups) {
      if (!s.active) continue;
      if (s.cycle.trim() && !(isPositiveDecimal(s.cycle, 2) && Number(s.cycle) <= 3600)) e[`cycle-${s.mould_id}`] = t("setup.errors.invalid_cycle_time");
      s.colours.forEach((c, i) => {
        if (!(isPositiveDecimal(c.cycle, 2) && Number(c.cycle) <= 3600)) e[`colour-${s.mould_id}-${i}`] = t("setup.errors.invalid_cycle_time");
      });
    }
    setErrors(e);
    if (Object.values(e).some(Boolean)) return;
    const input = { name: name.trim(), name_am: nameAm.trim(), kind, runs_24h: runs24h };
    if (!workspace) {
      create.mutate(input, { onSuccess: onClose, onError: fail });
      return;
    }
    setSaving(true);
    try {
      if (fieldsChanged || active !== undefined) await update.mutateAsync({ id: workspace.id, ...input, active: active ?? workspace.active });
      for (const s of active === undefined ? changedSetups : []) {
        await setMould.mutateAsync({ workspaceId: workspace.id, mouldId: s.mould_id, standard_cycle_s: s.cycle.trim() || null, active: s.active, colours: s.active ? s.colours.map((c) => ({ colour_id: c.colour_id, cycle_s: c.cycle.trim() })) : [] });
      }
      onClose();
    } catch (err) {
      fail(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <PanelFrame
      title={workspace ? localName(workspace, lang) : t("setup.machines.add")}
      onClose={onClose}
      busy={busy}
      dirty={dirty}
      problem={problem}
      submitLabel={workspace ? t("master.save") : t("setup.machines.add")}
      onSubmit={() => void submit()}
      retire={workspace ? { active: workspace.active, title: t("setup.retireTitle", { name: localName(workspace, lang) }), body: t("setup.machines.retireBody"), pending: saving, onRetire: () => void submit(false), onReactivate: () => void submit(true) } : undefined}
    >
      <TextField label={t("master.nameEn")} value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" required error={errors.name} />
      <TextField label={t("master.nameAm")} lang="am" value={nameAm} onChange={(e) => setNameAm(e.target.value)} autoComplete="off" required error={errors.nameAm} />
      <fieldset className="flex min-w-0 flex-col gap-2">
        <legend className="p-0 text-sm font-medium">{t("setup.machines.kind")}</legend>
        <div className="mt-2 grid grid-cols-[minmax(0,1fr)] gap-2 md:grid-cols-3">
          {KINDS.map((k) => (
            <Choice key={k} name="kind" checked={kind === k} disabled={Boolean(workspace?.setups.some((s) => s.active)) && k !== "machine"} onChange={() => setKind(k)}>
              <span>{t(`setup.machines.kinds.${k}`)}</span>
            </Choice>
          ))}
        </div>
      </fieldset>
      <label className="flex items-start gap-3">
        <input type="checkbox" checked={runs24h} onChange={(e) => setRuns24h(e.target.checked)} className="mt-0.5 size-6 shrink-0 accent-brand" />
        <span className="flex flex-col">
          <span className="font-medium">{t("setup.machines.runs24h")}</span>
          <span className="text-[13px] text-ink-muted">{t("setup.machines.runs24hHelp")}</span>
        </span>
      </label>

      {workspace && kind === "machine" && (
        <section aria-labelledby="moulds-heading" className="flex flex-col gap-3 border-t border-line pt-4">
          <div className="flex flex-col">
            <h3 id="moulds-heading" className="text-lg font-semibold">
              {t("setup.machines.mouldsOn")}
            </h3>
            <span className="text-[13px] text-ink-muted">{t("setup.machines.mouldsOnHelp")}</span>
          </div>
          {setups.filter((s) => s.active).map((s) => {
            const m = mouldById.get(s.mould_id);
            const product = m ? productById.get(m.product_id) : undefined;
            const usedColours = new Set(s.colours.map((c) => c.colour_id));
            const freeColours = (product?.colours ?? []).filter((c) => c.active && !usedColours.has(c.id));
            const cycle = Number(s.cycle);
            const showTarget = hours && m?.cavities && isPositiveDecimal(s.cycle, 2);
            return (
              <div key={s.mould_id} className="flex flex-col gap-3 rounded-md bg-surface-50 p-4">
                <div className="flex items-start justify-between gap-3">
                  <span className="flex min-w-0 flex-col">
                    <span className="font-semibold">{m ? localName(m, lang) : ""}</span>
                    <span className="text-[13px] text-ink-muted">
                      {product ? localName(product, lang) : ""} · {m?.cavities ? t("setup.moulds.cavities", { count: m.cavities }) : t("setup.moulds.cavitiesNotSet")}
                    </span>
                  </span>
                  <button type="button" className="h-10 shrink-0 rounded-md px-3 text-sm font-medium text-danger hover:bg-danger-tint" onClick={() => (s.isNew ? setSetups((all) => all.filter((x) => x.mould_id !== s.mould_id)) : patchSetup(s.mould_id, { active: false }))}>
                    {t("setup.machines.takeOff")}
                  </button>
                </div>
                <TextField
                  label={t("setup.machines.standardCycle")}
                  inputMode="decimal"
                  value={s.cycle}
                  onChange={(e) => patchSetup(s.mould_id, { cycle: e.target.value })}
                  error={errors[`cycle-${s.mould_id}`]}
                  placeholder={t("setup.machines.notSetYet")}
                  trailing={<span className="flex items-center px-3 text-sm text-ink-muted">{t("setup.seconds")}</span>}
                />
                {s.colours.map((c, i) => {
                  const colour = product?.colours.find((x) => x.id === c.colour_id);
                  return (
                    <div key={c.colour_id} className="flex items-end gap-2">
                      <div className="min-w-0 flex-1">
                        <TextField
                          label={t("setup.machines.colourCycle", { colour: colour ? localName(colour, lang) : "" })}
                          inputMode="decimal"
                          value={c.cycle}
                          onChange={(e) => patchSetup(s.mould_id, { colours: s.colours.map((x, j) => (j === i ? { ...x, cycle: e.target.value } : x)) })}
                          error={errors[`colour-${s.mould_id}-${i}`]}
                          trailing={<span className="flex items-center px-3 text-sm text-ink-muted">{t("setup.seconds")}</span>}
                        />
                      </div>
                      <button
                        type="button"
                        aria-label={t("setup.machines.removeColourCycle", { colour: colour ? localName(colour, lang) : "" })}
                        onClick={() => patchSetup(s.mould_id, { colours: s.colours.filter((_, j) => j !== i) })}
                        className="mb-0.5 flex size-11 shrink-0 items-center justify-center rounded-md text-danger hover:bg-danger-tint"
                      >
                        <Icon name="trash" />
                      </button>
                    </div>
                  );
                })}
                {freeColours.length > 0 && (
                  <select
                    aria-label={t("setup.machines.addColourCycle")}
                    value=""
                    onChange={(e) => e.target.value && patchSetup(s.mould_id, { colours: [...s.colours, { colour_id: e.target.value, cycle: s.cycle }] })}
                    className="h-11 self-start rounded-md border border-dashed border-control-border bg-surface-0 px-3 text-sm font-semibold text-brand"
                  >
                    <option value="">{`+ ${t("setup.machines.addColourCycle")}`}</option>
                    {freeColours.map((c) => (
                      <option key={c.id} value={c.id}>
                        {localName(c, lang)}
                      </option>
                    ))}
                  </select>
                )}
                {showTarget && shift && (
                  <span className="text-[13px] text-ink-muted">
                    {t("setup.machines.targetPreview", { s: trimDecimal(s.cycle), cavities: m.cavities, hours: trimDecimal(String(hours)), shift: localName(shift, lang), pieces: targetPieces(hours, cycle, m.cavities ?? 0).toLocaleString("en-US") })}
                  </span>
                )}
              </div>
            );
          })}
          {mountable.length > 0 ? (
            <select
              aria-label={t("setup.machines.mount")}
              value=""
              onChange={(e) => {
                const id = e.target.value;
                if (!id) return;
                const before = initialSetups.find((x) => x.mould_id === id) ?? (workspace.setups.find((x) => x.mould_id === id) && draftOf(workspace.setups.find((x) => x.mould_id === id) as Setup));
                setSetups((all) => [...all.filter((x) => x.mould_id !== id), before ? { ...before, active: true } : { mould_id: id, cycle: "", colours: [], active: true, isNew: true }]);
              }}
              className="h-11 self-start rounded-md border border-control-border bg-surface-0 px-3 text-sm font-medium"
            >
              <option value="">{`+ ${t("setup.machines.mount")}`}</option>
              {mountable.map((m) => (
                <option key={m.id} value={m.id}>
                  {localName(m, lang)}
                </option>
              ))}
            </select>
          ) : (
            moulds.length === 0 && <span className="text-sm text-ink-muted">{t("setup.machines.noMouldsYet")}</span>
          )}
        </section>
      )}
    </PanelFrame>
  );
}

function MouldPanel({ mould, products, onClose }: { mould?: Mould; products: Product[]; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const errorText = useErrorText();
  const create = useCreateMould();
  const update = useUpdateMould();
  const active = products.filter((p) => p.active || p.id === mould?.product_id);
  const [product, setProduct] = useState(mould?.product_id ?? active[0]?.id ?? "");
  const [name, setName] = useState(mould?.name ?? "");
  const [nameAm, setNameAm] = useState(mould?.name_am ?? "");
  const [cavities, setCavities] = useState(mould?.cavities ? String(mould.cavities) : "");
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [problem, setProblem] = useState<string | null>(null);
  const busy = create.isPending || update.isPending;
  const dirty = !mould || name.trim() !== mould.name || nameAm.trim() !== mould.name_am || cavities !== (mould.cavities ? String(mould.cavities) : "");

  function fail(err: unknown) {
    if (isDuplicate(err)) setErrors({ name: t("master.errors.duplicateName") });
    else setProblem(errorText(err));
  }

  function send(activeFlag?: boolean) {
    const input = { name: name.trim(), name_am: nameAm.trim(), cavities: cavities.trim() ? Number(cavities) : null };
    if (mould) update.mutate({ id: mould.id, ...input, active: activeFlag ?? mould.active }, { onSuccess: onClose, onError: fail });
    else create.mutate({ ...input, product_id: product }, { onSuccess: onClose, onError: fail });
  }

  function submit() {
    setProblem(null);
    const e: Record<string, string | undefined> = { ...nameErrors(t, name, nameAm) };
    const n = Number(cavities);
    if (cavities.trim() && !(/^\d+$/.test(cavities.trim()) && n >= 1 && n <= 1000)) e.cavities = t("setup.errors.invalid_cavities");
    setErrors(e);
    if (!Object.values(e).some(Boolean)) send();
  }

  return (
    <PanelFrame
      title={mould ? t("setup.moulds.edit") : t("setup.moulds.add")}
      onClose={onClose}
      busy={busy}
      dirty={dirty}
      problem={problem}
      submitLabel={mould ? t("master.save") : t("setup.moulds.add")}
      onSubmit={submit}
      retire={mould ? { active: mould.active, title: t("setup.retireTitle", { name: localName(mould, lang) }), body: t("setup.moulds.retireBody"), pending: update.isPending, onRetire: () => send(false), onReactivate: () => send(true) } : undefined}
    >
      <div className="flex flex-col gap-2">
        <label htmlFor="mould-product" className="text-sm font-medium">
          {t("setup.moulds.product")}
        </label>
        <select id="mould-product" value={product} disabled={Boolean(mould)} onChange={(e) => setProduct(e.target.value)} className="h-control-md rounded-md border border-control-border bg-surface-0 px-3 text-base disabled:opacity-70">
          {active.map((p) => (
            <option key={p.id} value={p.id}>
              {localName(p, lang)}
            </option>
          ))}
        </select>
        {mould && <span className="text-[13px] text-ink-muted">{t("setup.moulds.productLocked")}</span>}
      </div>
      <TextField label={t("master.nameEn")} value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" required error={errors.name} />
      <TextField label={t("master.nameAm")} lang="am" value={nameAm} onChange={(e) => setNameAm(e.target.value)} autoComplete="off" required error={errors.nameAm} />
      <TextField label={t("setup.moulds.cavitiesLabel")} inputMode="numeric" value={cavities} onChange={(e) => setCavities(e.target.value)} error={errors.cavities} placeholder={t("setup.machines.notSetYet")} />
      <span className="-mt-3 text-[13px] text-ink-muted">{t("setup.moulds.cavitiesHelp")}</span>
    </PanelFrame>
  );
}
