import { addUsage, emptyUsage } from "@core/pricing.js";
import type {
  JobKind,
  JobSnapshot,
  JobStep,
  ModelId,
  PlannedCall,
  UsageTotals,
} from "@shared/types.js";

export class Cancelled extends Error {
  constructor() {
    super("Job cancelled");
    this.name = "Cancelled";
  }
}

type Listener = (snapshot: JobSnapshot) => void;

/**
 * The job runs in this tab rather than on a server, so subscribers are called
 * directly instead of over SSE. Everything else - the snapshot shape, the step
 * lifecycle, the usage meter - is unchanged, so the UI reads the same as before.
 *
 * A consequence worth being honest about: closing the tab ends the run. Each repo
 * is written to IndexedDB as it completes, so the work already done survives, and
 * the beforeunload guard in main.tsx warns before it happens.
 */
export class Job {
  readonly id = crypto.randomUUID();
  readonly kind: JobKind;
  private snapshot: JobSnapshot;
  private listeners = new Set<Listener>();
  private cancelRequested = false;
  private model: ModelId;
  private batch: boolean;

  constructor(kind: JobKind, model: ModelId, batch: boolean) {
    this.kind = kind;
    this.model = model;
    this.batch = batch;
    this.snapshot = {
      id: this.id,
      kind,
      state: "queued",
      startedAt: new Date().toISOString(),
      finishedAt: null,
      total: 0,
      completed: 0,
      steps: [],
      usage: emptyUsage(),
      error: null,
    };
  }

  get(): JobSnapshot {
    return this.snapshot;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.snapshot);
    return () => this.listeners.delete(listener);
  }

  private emit(patch: Partial<JobSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const l of this.listeners) l(this.snapshot);
  }

  setSteps(repos: string[]): void {
    const steps: JobStep[] = repos.map((repo) => ({ repo, state: "pending" }));
    this.emit({ steps, total: steps.length, state: "running" });
  }

  checkCancelled(): void {
    if (this.cancelRequested) throw new Cancelled();
  }

  cancel(): void {
    this.cancelRequested = true;
  }

  startStep(repo: string): void {
    this.updateStep(repo, { state: "running" });
  }

  finishStep(repo: string, state: JobStep["state"], message?: string): void {
    this.updateStep(repo, message === undefined ? { state } : { state, message });
    this.emit({ completed: this.snapshot.completed + 1 });
  }

  private updateStep(repo: string, patch: Partial<JobStep>): void {
    this.emit({
      steps: this.snapshot.steps.map((s) => (s.repo === repo ? { ...s, ...patch } : s)),
    });
  }

  recordUsage(delta: Partial<Omit<UsageTotals, "estimatedCostUsd">>): void {
    this.emit({ usage: addUsage(this.snapshot.usage, delta, this.model, this.batch) });
  }

  addPlannedCall(call: PlannedCall): void {
    this.emit({ plannedCalls: [...(this.snapshot.plannedCalls ?? []), call] });
  }

  finish(error?: unknown): void {
    const finishedAt = new Date().toISOString();
    if (error instanceof Cancelled) {
      this.emit({ state: "cancelled", finishedAt });
    } else if (error) {
      this.emit({
        state: "failed",
        finishedAt,
        error: error instanceof Error ? error.message : String(error),
      });
    } else {
      this.emit({ state: "done", finishedAt });
    }
  }
}

const jobs = new Map<string, Job>();
let active: Job | null = null;

export function currentJob(): Job | null {
  return active && ["queued", "running"].includes(active.get().state) ? active : null;
}

export function getJob(id: string): Job | undefined {
  return jobs.get(id);
}

export function recentJobs(limit = 10): JobSnapshot[] {
  return [...jobs.values()]
    .map((j) => j.get())
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    .slice(0, limit);
}

export function startJob(
  kind: JobKind,
  model: ModelId,
  batch: boolean,
  run: (job: Job) => Promise<void>,
): Job {
  if (currentJob()) throw new Error("A job is already running. Wait for it to finish or cancel it.");

  const job = new Job(kind, model, batch);
  jobs.set(job.id, job);
  active = job;

  void (async () => {
    try {
      await run(job);
      job.finish();
    } catch (err) {
      job.finish(err);
    }
  })();

  return job;
}
