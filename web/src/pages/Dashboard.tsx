import { useCallback, useEffect, useMemo, useState } from "react";
import { navigate } from "../App.js";
import {
  getEstimate,
  getProposals,
  getRepos,
  startGenerate,
  startScan,
  type ReposResponse,
} from "../api.js";
import {
  Badge,
  Banner,
  Button,
  Checkbox,
  EmptyState,
  HealthMeter,
  Panel,
  Spinner,
  StatRow,
  money,
  relativeTime,
} from "../components/ui.js";
import { RefreshIcon, SparkIcon } from "../components/icons.js";
import type { ManifestEntry, ProposalStatus, RepoSummary } from "@shared/types.js";

type Filter = "all" | "no-description" | "no-readme" | "no-topics" | "stale" | "proposed";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "no-description", label: "No description" },
  { id: "no-readme", label: "No README" },
  { id: "no-topics", label: "No topics" },
  { id: "stale", label: "Stale" },
  { id: "proposed", label: "Has proposal" },
];

export function Dashboard() {
  const [data, setData] = useState<ReposResponse | null>(null);
  const [manifest, setManifest] = useState<ManifestEntry[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<Filter>("all");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // `note` replaces the dollar figure whenever a run costs no API credits, so the
  // badge never shows "$0.00" for a run that is really billed somewhere else.
  const [estimate, setEstimate] = useState<{
    cost: number;
    note: string | null;
  } | null>(null);

  const load = useCallback(async () => {
    try {
      const [repos, proposals] = await Promise.all([getRepos(), getProposals()]);
      setData(repos);
      setManifest(proposals.manifest);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const proposalByName = useMemo(() => new Map(manifest.map((m) => [m.name, m])), [manifest]);
  const auditByName = useMemo(
    () => new Map((data?.audit?.repos ?? []).map((a) => [a.name, a])),
    [data],
  );

  const repos = useMemo(() => {
    const list = data?.repos ?? [];
    const filtered = list.filter((r) => {
      switch (filter) {
        case "no-description":
          return !r.description;
        case "no-readme":
          return !r.files.hasReadme;
        case "no-topics":
          return r.topics.length === 0;
        case "stale":
          return auditByName.get(r.name)?.issues.some((i) => i.code === "stale") ?? false;
        case "proposed":
          return proposalByName.has(r.name);
        default:
          return true;
      }
    });
    // Worst health first: the point of the screen is what needs work.
    return filtered.sort(
      (a, b) => (auditByName.get(a.name)?.score ?? 100) - (auditByName.get(b.name)?.score ?? 100),
    );
  }, [data, filter, auditByName, proposalByName]);

  // Keep the cost estimate honest as the selection changes.
  useEffect(() => {
    if (selected.size === 0) {
      setEstimate(null);
      return;
    }
    void getEstimate(selected.size).then((e) =>
      setEstimate({
        cost: e.estimatedCostUsd,
        note: e.mockAi
          ? "mock mode · free"
          : e.free
            ? "Claude subscription · no API cost"
            : null,
      }),
    );
  }, [selected]);

  async function runScan() {
    setBusy(true);
    setError(null);
    try {
      const { jobId } = await startScan();
      navigate({ page: "run", jobId });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  async function runGenerate() {
    setBusy(true);
    setError(null);
    try {
      const { jobId } = await startGenerate([...selected]);
      navigate({ page: "run", jobId });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  function toggle(name: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  if (!data) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-10">
        {error ? <Banner tone="error">{error}</Banner> : <Spinner label="Loading repositories" />}
      </div>
    );
  }

  if (!data.scanned) {
    return (
      <div className="mx-auto max-w-xl px-6 py-20">
        <EmptyState
          title="Nothing scanned yet"
          action={
            <Button variant="primary" onClick={() => void runScan()} disabled={busy}>
              {busy ? "Starting…" : "Scan my account"}
            </Button>
          }
        >
          Scanning reads your repositories and their file trees. It is read-only — nothing on GitHub
          changes, and it costs nothing.
        </EmptyState>
        {error && (
          <div className="mt-4">
            <Banner tone="error">{error}</Banner>
          </div>
        )}
      </div>
    );
  }

  const totals = data.audit?.totals;
  const allShownSelected = repos.length > 0 && repos.every((r) => selected.has(r.name));
  const someShownSelected = repos.some((r) => selected.has(r.name));

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-6 py-8 pb-28">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[19px] font-semibold">Repositories</h1>
          <p className="mt-1 text-[12.5px] text-subtle">
            {data.owner} · scanned {relativeTime(data.scannedAt ?? null)}
          </p>
        </div>
        <Button onClick={() => void runScan()} disabled={busy} icon={<RefreshIcon />}>
          Rescan
        </Button>
      </div>

      {error && <Banner tone="error">{error}</Banner>}

      <StatRow
        items={[
          { label: "Repositories", value: String(totals?.repos ?? data.repos.length) },
          {
            label: "No description",
            value: String(totals?.missingDescription ?? 0),
            ...(totals?.missingDescription ? { tone: "bad" as const } : {}),
          },
          {
            label: "No README",
            value: String(totals?.missingReadme ?? 0),
            ...(totals?.missingReadme ? { tone: "bad" as const } : {}),
          },
          {
            label: "No topics",
            value: String(totals?.missingTopics ?? 0),
            ...(totals?.missingTopics ? { tone: "warn" as const } : {}),
          },
          { label: "Average health", value: String(data.audit?.averageScore ?? 0) },
        ]}
      />

      {data.priority.length > 0 && (
        <Panel
          title="Fix these first"
          description="Lowest health, highest visibility, and fixable by this tool"
          actions={
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set(data.priority))}>
              Select all {data.priority.length}
            </Button>
          }
        >
          <div className="flex flex-wrap gap-1.5">
            {data.priority.map((name) => {
              const active = selected.has(name);
              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => toggle(name)}
                  className={`rounded-md border px-2.5 py-1 text-[12.5px] transition-colors ${
                    active
                      ? "border-accent/50 bg-accent/12 text-text"
                      : "border-line bg-raised text-muted hover:border-line-strong hover:text-text"
                  }`}
                >
                  {name}
                </button>
              );
            })}
          </div>
        </Panel>
      )}

      <div className="flex flex-wrap items-center gap-1">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={`rounded-md px-2.5 py-1.5 text-[12.5px] transition-colors ${
              filter === f.id
                ? "bg-raised text-text"
                : "text-subtle hover:bg-raised/60 hover:text-text"
            }`}
          >
            {f.label}
          </button>
        ))}
        {/* The Missing column uses single letters; this is what decodes them. */}
        <span className="ml-auto hidden items-center gap-2.5 text-[11.5px] text-subtle lg:flex">
          {[
            ["D", "description"],
            ["R", "readme"],
            ["T", "topics"],
            ["L", "license"],
          ].map(([key, label]) => (
            <span key={key} className="flex items-center gap-1">
              <span className="font-mono text-line-strong">{key}</span>
              {label}
            </span>
          ))}
        </span>
      </div>

      {/* The table has a floor width - below it the columns collide rather than
          wrap, so it scrolls inside its own container instead of squeezing. */}
      <div className="overflow-x-auto rounded-panel border border-line bg-surface">
        <table className="w-full min-w-[860px] text-left">
          <thead>
            <tr className="border-b border-line text-[11.5px] font-medium text-subtle">
              <th className="w-10 py-2.5 pr-2 pl-4">
                <Checkbox
                  checked={allShownSelected}
                  {...(someShownSelected && !allShownSelected ? { indeterminate: true } : {})}
                  onChange={(next) =>
                    setSelected(next ? new Set(repos.map((r) => r.name)) : new Set())
                  }
                  label="Select all shown"
                />
              </th>
              <th className="px-3 py-2.5 font-medium">Repository</th>
              <th className="w-28 px-3 py-2.5 font-medium">Health</th>
              <th className="w-28 px-3 py-2.5 font-medium">Missing</th>
              <th className="w-28 px-3 py-2.5 font-medium">Language</th>
              <th className="w-16 px-3 py-2.5 text-right font-medium">Stars</th>
              <th className="w-24 px-3 py-2.5 font-medium">Pushed</th>
              <th className="w-24 py-2.5 pr-4 pl-3 font-medium">Proposal</th>
            </tr>
          </thead>
          <tbody>
            {repos.map((repo) => (
              <Row
                key={repo.name}
                repo={repo}
                score={auditByName.get(repo.name)?.score ?? 100}
                proposal={proposalByName.get(repo.name)}
                checked={selected.has(repo.name)}
                onToggle={() => toggle(repo.name)}
              />
            ))}
            {repos.length === 0 && (
              <tr>
                <td colSpan={8} className="py-12 text-center text-[13px] text-subtle">
                  No repositories match this filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {selected.size > 0 && (
        <div className="fixed inset-x-0 bottom-6 z-20 flex justify-center px-6">
          <div className="flex items-center gap-3 rounded-full border border-line-strong bg-raised/95 py-2 pr-2 pl-4 shadow-[0_8px_32px_rgba(0,0,0,0.45)] backdrop-blur-md">
            <span className="text-[13px] text-text">
              <span className="tabular font-medium">{selected.size}</span> selected
            </span>
            {estimate && (
              <span className="text-[12.5px] text-subtle">
                {estimate.note ?? `≈ ${money(estimate.cost)}`}
              </span>
            )}
            <span className="h-4 w-px bg-line-strong" />
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
              Clear
            </Button>
            <Button
              size="sm"
              variant="primary"
              onClick={() => void runGenerate()}
              disabled={busy}
              icon={<SparkIcon className="size-3.5" />}
            >
              Generate
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

const STATUS_TONE: Record<ProposalStatus, "good" | "accent" | "warn" | "neutral" | "bad"> = {
  approved: "good",
  applied: "accent",
  pending: "warn",
  skipped: "neutral",
  failed: "bad",
};

/**
 * Four fixed slots rather than a repeated comma list. Every row prints the same
 * glyphs in the same positions, so the column reads as a matrix you can scan
 * down in one pass - the list version was the same six words on every line.
 */
function MissingSlots({ repo }: { repo: RepoSummary }) {
  const slots = [
    { key: "D", label: "description", missing: !repo.description, severe: true },
    { key: "R", label: "README", missing: !repo.files.hasReadme, severe: true },
    { key: "T", label: "topics", missing: repo.topics.length === 0, severe: false },
    {
      key: "L",
      label: "license",
      missing: !repo.files.hasLicenseFile && !repo.license,
      severe: false,
    },
  ];

  return (
    <span className="flex gap-1">
      {slots.map((slot) => (
        <span
          key={slot.key}
          title={slot.missing ? `Missing ${slot.label}` : `Has ${slot.label}`}
          className={`grid size-4.5 place-items-center rounded font-mono text-[10.5px] leading-none ${
            slot.missing
              ? slot.severe
                ? "bg-bad/15 text-bad"
                : "bg-warn/15 text-warn"
              : "bg-transparent text-line-strong"
          }`}
        >
          {slot.key}
        </span>
      ))}
    </span>
  );
}

function Row({
  repo,
  score,
  proposal,
  checked,
  onToggle,
}: {
  repo: RepoSummary;
  score: number;
  proposal: ManifestEntry | undefined;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <tr
      className={`border-b border-line/60 text-[13px] transition-colors last:border-0 ${
        checked ? "bg-accent/[0.045]" : "hover:bg-hover/60"
      }`}
    >
      <td className="py-2.5 pr-2 pl-4">
        <Checkbox checked={checked} onChange={onToggle} label={`Select ${repo.name}`} />
      </td>
      <td className="max-w-0 px-3 py-2.5">
        <button
          type="button"
          onClick={() => navigate({ page: "repo", name: repo.name })}
          className="block max-w-full truncate font-medium text-text hover:text-accent"
        >
          {repo.name}
        </button>
        <span className="block max-w-full truncate text-[12px] text-subtle">
          {repo.description ?? <span className="italic">no description</span>}
        </span>
      </td>
      <td className="px-3 py-2.5">
        <HealthMeter score={score} />
      </td>
      <td className="px-3 py-2.5">
        <MissingSlots repo={repo} />
      </td>
      <td className="px-3 py-2.5 text-[12.5px] text-muted">{repo.language ?? "—"}</td>
      <td className="tabular px-3 py-2.5 text-right text-[12.5px] text-muted">{repo.stars}</td>
      <td className="px-3 py-2.5 text-[12.5px] text-subtle">{relativeTime(repo.pushedAt)}</td>
      <td className="py-2.5 pr-4 pl-3">
        {proposal ? (
          <Badge tone={STATUS_TONE[proposal.status]}>{proposal.status}</Badge>
        ) : (
          <span className="text-[12.5px] text-line-strong">—</span>
        )}
      </td>
    </tr>
  );
}
