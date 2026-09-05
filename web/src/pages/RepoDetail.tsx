import { useCallback, useEffect, useMemo, useState } from "react";
import { navigate } from "../App.js";
import { getRepo, startGenerate, updateProposal, type RepoDetail as Detail } from "../api.js";
import { Markdown } from "../components/Markdown.js";
import {
  Badge,
  Banner,
  Button,
  ConfidenceBadge,
  Input,
  Panel,
  SeverityDot,
  Spinner,
  Tag,
  Textarea,
} from "../components/ui.js";
import { ArrowLeftIcon, ExternalIcon, SparkIcon } from "../components/icons.js";
import type { RepoProposal } from "@shared/types.js";

/** Mirror of the server's Evidence shape - only the fields this page renders. */
interface EvidenceView {
  tree: string[];
  treeTruncated: boolean;
  manifests: { file: string; ecosystem: string; dependencies: string[] }[];
  entrypoints: { path: string; text: string }[];
  commitMessages: string[];
  languages: Record<string, number>;
  bytes: number;
}

export function RepoDetail({ name }: { name: string }) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<RepoProposal | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [hint, setHint] = useState("");
  const [tab, setTab] = useState<"preview" | "edit">("preview");

  const load = useCallback(async () => {
    try {
      const result = await getRepo(name);
      setDetail(result);
      setDraft(result.proposal);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [name]);

  useEffect(() => {
    void load();
  }, [load]);

  const dirty = useMemo(() => {
    if (!draft || !detail?.proposal) return false;
    return (
      draft.description !== detail.proposal.description ||
      draft.readme !== detail.proposal.readme ||
      draft.topics.join(",") !== detail.proposal.topics.join(",")
    );
  }, [draft, detail]);

  async function persist(patch: Partial<RepoProposal>) {
    if (!draft) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await updateProposal(name, {
        description: draft.description,
        topics: draft.topics,
        readme: draft.readme,
        ...patch,
      });
      setDraft(updated);
      setDetail((prev) => (prev ? { ...prev, proposal: updated } : prev));
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function regenerate() {
    try {
      const { jobId } = await startGenerate([name], hint.trim() || undefined);
      navigate({ page: "run", jobId });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  if (!detail) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-10">
        {error ? <Banner tone="error">{error}</Banner> : <Spinner label="Loading repository" />}
      </div>
    );
  }

  const { repo, audit } = detail;
  const evidence = detail.evidence as EvidenceView | null;

  return (
    <div className="mx-auto max-w-6xl space-y-5 px-6 py-8">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => navigate({ page: "dashboard" })}
        icon={<ArrowLeftIcon className="size-3.5" />}
      >
        Repositories
      </Button>

      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-[19px] font-semibold">{repo.name}</h1>
        <a
          href={repo.htmlUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-[12.5px] text-subtle transition-colors hover:text-accent"
        >
          GitHub
          <ExternalIcon className="size-3" />
        </a>
        <span className="ml-auto flex items-center gap-2">
          {draft && <ConfidenceBadge value={draft.confidence} />}
          {draft ? (
            <Badge
              tone={
                draft.status === "approved"
                  ? "good"
                  : draft.status === "applied"
                    ? "accent"
                    : draft.status === "failed"
                      ? "bad"
                      : "neutral"
              }
            >
              {draft.status}
            </Badge>
          ) : (
            <Badge>no proposal</Badge>
          )}
        </span>
      </header>

      {error && <Banner tone="error">{error}</Banner>}

      <div className="grid items-start gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="space-y-5 lg:sticky lg:top-19">
          <Panel title="Audit">
            {audit.issues.length === 0 ? (
              <p className="text-[13px] text-good">Nothing to fix — this repo is in good shape.</p>
            ) : (
              <ul className="space-y-3">
                {audit.issues.map((issue) => (
                  <li key={issue.code} className="flex gap-2.5">
                    <span className="pt-[7px]">
                      <SeverityDot severity={issue.severity} />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[13px] text-text">{issue.title}</span>
                      <span className="block text-[12px] leading-relaxed text-subtle">
                        {issue.fix}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          {evidence && <EvidencePane evidence={evidence} />}

          {draft && (
            <Panel title="Why it wrote this">
              <p className="text-[12.5px] leading-relaxed text-muted">{draft.reasoning}</p>
              {draft.unknowns.length > 0 && (
                <div className="mt-4 border-t border-line pt-3">
                  <h3 className="mb-1.5 text-[12px] font-medium text-subtle">
                    Left out or unresolved
                  </h3>
                  <ul className="space-y-1">
                    {draft.unknowns.map((u, i) => (
                      <li key={i} className="flex gap-2 text-[12px] leading-relaxed text-muted">
                        <span className="text-line-strong">—</span>
                        {u}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Panel>
          )}
        </aside>

        <div className="space-y-5">
          {!draft ? (
            <Panel title="No proposal yet">
              <p className="mb-4 text-[13px] leading-relaxed text-muted">
                Generate one to see a proposed description, topics and README written from this
                repository's actual code.
              </p>
              <Button
                variant="primary"
                onClick={() => void regenerate()}
                icon={<SparkIcon className="size-3.5" />}
              >
                Generate for this repo
              </Button>
            </Panel>
          ) : (
            <>
              <Panel
                title="Description and topics"
                actions={
                  <span
                    className={`tabular text-[12px] ${
                      draft.description.length > 320 ? "text-warn" : "text-subtle"
                    }`}
                  >
                    {draft.description.length}/350
                  </span>
                }
              >
                <Textarea
                  value={draft.description}
                  onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                  rows={2}
                  maxLength={350}
                />
                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  {draft.topics.map((topic) => (
                    <Tag
                      key={topic}
                      onRemove={() =>
                        setDraft({ ...draft, topics: draft.topics.filter((t) => t !== topic) })
                      }
                    >
                      {topic}
                    </Tag>
                  ))}
                  <TopicInput
                    onAdd={(topic) =>
                      setDraft({ ...draft, topics: [...new Set([...draft.topics, topic])] })
                    }
                  />
                </div>
              </Panel>

              <Panel
                title="README"
                bodyClassName=""
                actions={
                  <div className="flex rounded-md border border-line bg-bg p-0.5">
                    {(["preview", "edit"] as const).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setTab(t)}
                        className={`rounded-[5px] px-2.5 py-1 text-[12px] capitalize transition-colors ${
                          tab === t ? "bg-raised text-text" : "text-subtle hover:text-text"
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                }
              >
                {tab === "edit" ? (
                  <textarea
                    value={draft.readme}
                    onChange={(e) => setDraft({ ...draft, readme: e.target.value })}
                    rows={28}
                    spellCheck={false}
                    className="w-full resize-y bg-transparent px-4 py-4 font-mono text-[12.5px] leading-[1.7] text-text outline-none"
                  />
                ) : (
                  <div className="markdown-body max-h-[70vh] overflow-y-auto px-5 py-4">
                    <Markdown source={draft.readme} />
                  </div>
                )}
              </Panel>

              <Panel title="Review">
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="primary"
                    onClick={() => void persist({ status: "approved" })}
                    disabled={saving || draft.status === "applied"}
                  >
                    Approve
                  </Button>
                  <Button onClick={() => void persist({})} disabled={saving || !dirty}>
                    {saving ? "Saving…" : dirty ? "Save edits" : "Saved"}
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => void persist({ status: "skipped" })}
                    disabled={saving || draft.status === "applied"}
                  >
                    Skip
                  </Button>
                  {saved && <span className="text-[12.5px] text-good">Saved</span>}
                  {draft.status === "applied" && (
                    <span className="text-[12.5px] text-accent">
                      Applied on {draft.applied?.at.slice(0, 10)}
                    </span>
                  )}
                </div>

                <div className="mt-5 border-t border-line pt-4">
                  <h3 className="text-[13px] font-medium text-text">Regenerate with a correction</h3>
                  <p className="mt-1 mb-2.5 text-[12px] leading-relaxed text-subtle">
                    Tell it what it got wrong, or what the code cannot show — "this is a university
                    assignment, not a library" — and it rewrites with that as context.
                  </p>
                  <div className="flex gap-2">
                    <Input
                      value={hint}
                      onChange={(e) => setHint(e.target.value)}
                      placeholder="Optional context for the rewrite"
                    />
                    <Button onClick={() => void regenerate()}>Regenerate</Button>
                  </div>
                </div>
              </Panel>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function TopicInput({ onAdd }: { onAdd: (topic: string) => void }) {
  const [value, setValue] = useState("");
  return (
    <input
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        if (e.key !== "Enter") return;
        e.preventDefault();
        const topic = value.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-");
        if (topic) onAdd(topic);
        setValue("");
      }}
      placeholder="add topic"
      className="w-24 rounded-md border border-dashed border-line-strong bg-transparent px-2 py-1 font-mono text-[12px] text-text placeholder:text-subtle outline-none focus:border-accent/60"
    />
  );
}

function EvidencePane({ evidence }: { evidence: EvidenceView }) {
  const [open, setOpen] = useState<"deps" | "tree" | "commits" | "code">("deps");

  const tabs = [
    { id: "deps", label: "Deps", count: evidence.manifests.length },
    { id: "tree", label: "Files", count: evidence.tree.length },
    { id: "commits", label: "Commits", count: evidence.commitMessages.length },
    { id: "code", label: "Code", count: evidence.entrypoints.length },
  ] as const;

  return (
    <Panel
      title="Evidence it was given"
      description={`${Math.round(evidence.bytes / 1024)} KB sent to the model`}
      bodyClassName="p-3"
    >
      <div className="mb-2.5 flex gap-0.5">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setOpen(t.id)}
            className={`rounded-md px-2 py-1 text-[12px] transition-colors ${
              open === t.id ? "bg-raised text-text" : "text-subtle hover:text-text"
            }`}
          >
            {t.label}
            <span className="tabular ml-1 text-[11px] opacity-60">{t.count}</span>
          </button>
        ))}
      </div>

      <div className="max-h-64 overflow-auto rounded-control border border-line bg-bg p-3 font-mono text-[11.5px] leading-relaxed text-muted">
        {open === "tree" && (
          <pre className="whitespace-pre-wrap">
            {evidence.tree.join("\n") || "(no files read)"}
            {evidence.treeTruncated && "\n… truncated"}
          </pre>
        )}
        {open === "deps" &&
          (evidence.manifests.length === 0 ? (
            <p>No dependency manifests found.</p>
          ) : (
            evidence.manifests.map((m) => (
              <div key={m.file} className="mb-3 last:mb-0">
                <div className="text-text">
                  {m.file} <span className="text-subtle">({m.ecosystem})</span>
                </div>
                <div className="mt-0.5 whitespace-pre-wrap">
                  {m.dependencies.join(", ") || "(none)"}
                </div>
              </div>
            ))
          ))}
        {open === "commits" && (
          <pre className="whitespace-pre-wrap">
            {evidence.commitMessages.map((m) => `· ${m}`).join("\n") || "(none read)"}
          </pre>
        )}
        {open === "code" &&
          (evidence.entrypoints.length === 0 ? (
            <p className="text-warn">
              No entry-point files could be read — treat the output with extra suspicion.
            </p>
          ) : (
            evidence.entrypoints.map((f) => (
              <div key={f.path} className="mb-3 last:mb-0">
                <div className="mb-1 text-text">{f.path}</div>
                <pre className="whitespace-pre-wrap">{f.text.slice(0, 1500)}</pre>
              </div>
            ))
          ))}
      </div>
    </Panel>
  );
}
