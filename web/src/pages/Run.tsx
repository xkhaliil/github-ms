import { useCallback, useEffect, useState } from "react";
import { navigate } from "../App.js";
import {
  bulkUpdateProposals,
  cancelJob,
  getJobs,
  getProposals,
  startApply,
  streamJob,
} from "../api.js";
import {
  Badge,
  Banner,
  Button,
  Panel,
  Spinner,
  Switch,
  money,
} from "../components/ui.js";
import { CheckIcon, CircleIcon, DashIcon, DotIcon, UploadIcon, XIcon } from "../components/icons.js";
import type { JobSnapshot, JobStep, RepoProposal } from "@shared/types.js";

export function Run({ jobId }: { jobId?: string }) {
  const [job, setJob] = useState<JobSnapshot | null>(null);
  const [recent, setRecent] = useState<JobSnapshot[]>([]);
  const [proposals, setProposals] = useState<RepoProposal[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [dryRun, setDryRun] = useState(true);
  const [confirming, setConfirming] = useState(false);

  const loadProposals = useCallback(async () => {
    const { proposals: list } = await getProposals();
    setProposals(list);
  }, []);

  useEffect(() => {
    void getJobs().then(({ current, recent: history }) => {
      setRecent(history);
      if (!jobId && current) navigate({ page: "run", jobId: current.id });
    });
    void loadProposals();
  }, [jobId, loadProposals]);

  useEffect(() => {
    if (!jobId) return;
    const stop = streamJob(
      jobId,
      (snapshot) => {
        setJob(snapshot);
        if (["done", "failed", "cancelled"].includes(snapshot.state)) void loadProposals();
      },
      setError,
    );
    return stop;
  }, [jobId, loadProposals]);

  const approved = proposals.filter((p) => p.status === "approved");
  const pending = proposals.filter((p) => p.status === "pending");
  const running = job !== null && ["queued", "running"].includes(job.state);

  async function runApply(real: boolean) {
    setError(null);
    setConfirming(false);
    try {
      const { jobId: id } = await startApply(!real);
      navigate({ page: "run", jobId: id });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function approveAll(minConfidence: "high" | "medium") {
    try {
      await bulkUpdateProposals({ status: "approved", minConfidence });
      await loadProposals();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5 px-6 py-8">
      <h1 className="text-[19px] font-semibold">Runs</h1>

      {error && <Banner tone="error">{error}</Banner>}

      {job ? (
        <JobView job={job} onCancel={() => void cancelJob(job.id)} />
      ) : (
        <p className="rounded-panel border border-dashed border-line px-4 py-3 text-[13px] text-subtle">
          No run selected. Start a scan or a generation from the Repositories tab.
        </p>
      )}

      <Panel
        title="Review queue"
        description={`${approved.length} approved · ${pending.length} awaiting review`}
        actions={
          pending.length > 0 ? (
            <>
              <Button size="sm" onClick={() => void approveAll("high")}>
                Approve high
              </Button>
              <Button size="sm" onClick={() => void approveAll("medium")}>
                Approve medium+
              </Button>
            </>
          ) : undefined
        }
      >
        {pending.length === 0 ? (
          <p className="text-[13px] text-subtle">
            {approved.length > 0
              ? "Everything generated has been reviewed."
              : "Nothing generated yet."}
          </p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {pending.map((p) => (
              <button
                key={p.name}
                type="button"
                onClick={() => navigate({ page: "repo", name: p.name })}
                className="inline-flex items-center gap-1.5 rounded-md border border-line bg-raised px-2.5 py-1 text-[12.5px] text-muted transition-colors hover:border-line-strong hover:text-text"
              >
                <span
                  className={
                    p.confidence === "low"
                      ? "text-bad"
                      : p.confidence === "medium"
                        ? "text-warn"
                        : "text-good"
                  }
                >
                  <DotIcon className="size-2" />
                </span>
                {p.name}
              </button>
            ))}
          </div>
        )}
      </Panel>

      <Panel
        title="Apply to GitHub"
        description="Only approved proposals are ever written"
      >
        <div className="-mt-2 border-b border-line">
          <Switch
            checked={dryRun}
            onChange={setDryRun}
            label="Dry run"
            description="Prints the exact API calls and sends nothing. Recommended before the real thing."
          />
        </div>

        <div className="pt-4">
          {confirming ? (
            <Banner tone="warn">
              <p className="mb-3">
                This writes to <strong className="tabular">{approved.length}</strong>{" "}
                {approved.length === 1 ? "repository" : "repositories"} on GitHub — description,
                topics, and <span className="font-mono text-[12px]">README.md</span> on the default
                branch. Existing READMEs are backed up locally first.
              </p>
              <div className="flex gap-2">
                <Button size="sm" variant="danger" onClick={() => void runApply(true)}>
                  Yes, apply for real
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
                  Cancel
                </Button>
              </div>
            </Banner>
          ) : (
            <div className="flex items-center gap-3">
              <Button
                variant={dryRun ? "secondary" : "danger"}
                disabled={approved.length === 0 || running}
                onClick={() => (dryRun ? void runApply(false) : setConfirming(true))}
                icon={<UploadIcon className="size-3.5" />}
              >
                {dryRun ? `Dry run (${approved.length})` : `Apply ${approved.length} for real`}
              </Button>
              {approved.length === 0 && (
                <span className="text-[12.5px] text-subtle">Approve something first.</span>
              )}
            </div>
          )}
        </div>
      </Panel>

      {recent.length > 0 && (
        <Panel title="History" bodyClassName="p-0">
          <ul>
            {recent.map((r) => (
              <li
                key={r.id}
                className="flex items-center gap-3 border-b border-line/60 px-4 py-2.5 text-[13px] last:border-0"
              >
                <button
                  type="button"
                  onClick={() => navigate({ page: "run", jobId: r.id })}
                  className="w-20 text-left font-medium text-text hover:text-accent"
                >
                  {r.kind}
                </button>
                <Badge
                  tone={
                    r.state === "done"
                      ? "good"
                      : r.state === "failed"
                        ? "bad"
                        : r.state === "cancelled"
                          ? "neutral"
                          : "accent"
                  }
                >
                  {r.state}
                </Badge>
                <span className="tabular text-[12.5px] text-subtle">
                  {r.completed}/{r.total}
                </span>
                <span className="tabular ml-auto text-[12px] text-subtle">
                  {new Date(r.startedAt).toLocaleTimeString()}
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}

const STEP_ICON: Record<JobStep["state"], { node: React.ReactNode; tone: string }> = {
  done: { node: <CheckIcon className="size-3.5" />, tone: "text-good" },
  failed: { node: <XIcon className="size-3.5" />, tone: "text-bad" },
  skipped: { node: <DashIcon className="size-3.5" />, tone: "text-subtle" },
  running: { node: <DotIcon className="size-3.5 animate-pulse" />, tone: "text-accent" },
  pending: { node: <CircleIcon className="size-3.5" />, tone: "text-line-strong" },
};

function JobView({ job, onCancel }: { job: JobSnapshot; onCancel: () => void }) {
  const running = ["queued", "running"].includes(job.state);
  const percent = job.total === 0 ? 0 : Math.round((job.completed / job.total) * 100);

  return (
    <Panel
      title={<span className="capitalize">{job.kind}</span>}
      description={new Date(job.startedAt).toLocaleTimeString()}
      actions={
        <>
          <Badge
            tone={
              job.state === "done"
                ? "good"
                : job.state === "failed"
                  ? "bad"
                  : job.state === "cancelled"
                    ? "neutral"
                    : "accent"
            }
          >
            {job.state}
          </Badge>
          {running && (
            <Button size="sm" variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
          )}
        </>
      }
    >
      <div className="mb-4 flex items-center gap-4">
        <div className="h-0.75 flex-1 overflow-hidden rounded-full bg-line">
          <div
            className={`h-full rounded-full transition-[width] duration-300 ${
              job.state === "failed" ? "bg-bad" : job.state === "done" ? "bg-good" : "bg-accent"
            }`}
            style={{ width: `${percent}%` }}
          />
        </div>
        <span className="tabular text-[12.5px] text-muted">
          {job.completed}/{job.total}
        </span>
        {running && <Spinner />}
      </div>

      {job.kind === "generate" && (
        <div className="mb-4 flex flex-wrap gap-x-6 gap-y-1 rounded-control border border-line bg-bg px-3 py-2.5 text-[12px]">
          {job.provider === "claude-code" ? (
            <Meta
              label="Cost"
              value={`subscription · ${money(job.usage.estimatedCostUsd)} if billed`}
            />
          ) : (
            <Meta label="Spent" value={money(job.usage.estimatedCostUsd)} />
          )}
          <Meta label="Input" value={job.usage.inputTokens.toLocaleString()} />
          <Meta label="Output" value={job.usage.outputTokens.toLocaleString()} />
          <Meta
            label="Cache reads"
            value={job.usage.cacheReadTokens.toLocaleString()}
            tone={job.completed > 1 && job.usage.cacheReadTokens === 0 ? "text-warn" : undefined}
          />
        </div>
      )}

      {job.error && (
        <div className="mb-4">
          <Banner tone="error">{job.error}</Banner>
        </div>
      )}

      {job.steps.length > 0 && (
        <ul className="max-h-80 space-y-0.5 overflow-y-auto">
          {job.steps.map((step) => {
            const icon = STEP_ICON[step.state];
            return (
              <li
                key={step.repo}
                className="flex items-center gap-2.5 rounded-md px-1.5 py-1 text-[13px] hover:bg-hover/60"
              >
                <span className={icon.tone}>{icon.node}</span>
                <button
                  type="button"
                  onClick={() => navigate({ page: "repo", name: step.repo })}
                  className="text-text hover:text-accent"
                >
                  {step.repo}
                </button>
                {step.message && (
                  <span className="truncate text-[12px] text-subtle">{step.message}</span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {job.plannedCalls && job.plannedCalls.length > 0 && (
        <div className="mt-5 border-t border-line pt-4">
          <h3 className="mb-2 text-[12px] font-medium text-subtle">
            Calls this would make — nothing was sent
          </h3>
          <div className="max-h-72 overflow-auto rounded-control border border-line bg-bg p-3 font-mono text-[11.5px] leading-relaxed">
            {job.plannedCalls.map((call, i) => (
              <div key={i} className="mb-2 last:mb-0">
                <span className="text-accent">{call.method}</span>{" "}
                <span className="text-text">{call.path}</span>
                <div className="pl-4 text-subtle">{call.summary}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </Panel>
  );
}

function Meta({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <span className="flex gap-1.5">
      <span className="text-subtle">{label}</span>
      <span className={`tabular ${tone ?? "text-text"}`}>{value}</span>
    </span>
  );
}
