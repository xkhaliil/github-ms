import { randomUUID } from "node:crypto";
import type {
  JobKind,
  JobSnapshot,
  JobStep,
  ModelId,
  PlannedCall,
  UsageTotals,
} from "../../shared/types.js";
import { addUsage, emptyUsage } from "./pricing.js";

export class Cancelled extends Error {
  constructor() {
    super("Job cancelled");
    this.name = "Cancelled";
  }
}

type Listener = (snapshot: JobSnapshot) => void;

/**
 * A single running job with live subscribers. Jobs are in-memory only: this is a
 * local, single-user tool, and a job that does not survive a restart is the
 * honest behaviour - the proposals it wrote to disk do survive.
 */
export class Job {
  readonly id = randomUUID();
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

  /** Throws Cancelled so a long loop unwinds at the next repo boundary. */
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
    // Give SSE clients a tick to flush the terminal event before dropping them.
    setTimeout(() => this.listeners.clear(), 1000);
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

/**
 * Starts a job and returns immediately - the caller gets an id to stream from.
 * Only one job runs at a time; a second start is refused rather than queued, so
 * two tabs can never generate the same repo twice.
 */
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
