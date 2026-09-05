import { useState } from "react";
import { navigate } from "../App.js";
import { saveCredentials, testCredential } from "../api.js";
import { Banner, Button, Field, Input, Spinner, Switch } from "../components/ui.js";
import { CheckIcon, XIcon } from "../components/icons.js";
import type { AuthStatus, ConnectionTest } from "@shared/types.js";

type TestState =
  | { status: "idle" }
  | { status: "testing" }
  | { status: "done"; result: ConnectionTest };

export function Setup({ auth, onSaved }: { auth: AuthStatus; onSaved: () => Promise<void> }) {
  const [anthropicKey, setAnthropicKey] = useState("");
  const [githubToken, setGithubToken] = useState("");
  const [remember, setRemember] = useState(auth.remembered);
  const [anthropicTest, setAnthropicTest] = useState<TestState>({ status: "idle" });
  const [githubTest, setGithubTest] = useState<TestState>({ status: "idle" });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // A key already in memory counts as verified; a newly typed one must be tested.
  const anthropicOk =
    (anthropicTest.status === "done" && anthropicTest.result.ok) ||
    (auth.anthropic.present && anthropicKey === "");
  const githubOk =
    (githubTest.status === "done" && githubTest.result.ok) ||
    (auth.github.present && githubToken === "");

  async function runTest(kind: "anthropic" | "github") {
    const setState = kind === "anthropic" ? setAnthropicTest : setGithubTest;
    const typed = kind === "anthropic" ? anthropicKey.trim() : githubToken.trim();
    setState({ status: "testing" });
    try {
      setState({ status: "done", result: await testCredential(kind, typed || undefined) });
    } catch (err) {
      setState({
        status: "done",
        result: { ok: false, kind, error: err instanceof Error ? err.message : String(err) },
      });
    }
  }

  async function save() {
    setSaving(true);
    setSaveError(null);
    try {
      const payload: { anthropicKey?: string; githubToken?: string; remember?: boolean } = {
        remember,
      };
      if (anthropicKey.trim()) payload.anthropicKey = anthropicKey.trim();
      if (githubToken.trim()) payload.githubToken = githubToken.trim();

      const result = await saveCredentials(payload);
      // Clear the inputs: the values are held by the credential store now and
      // should not sit in the DOM where a screenshot or extension can read them.
      setAnthropicKey("");
      setGithubToken("");
      await onSaved();
      if (result.status.ready) navigate({ page: "dashboard" });
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-140 px-6 py-14">
      <header className="mb-9">
        <h1 className="text-[22px] font-semibold">Connect your accounts</h1>
        <p className="mt-2 text-[13.5px] leading-relaxed text-muted">
          Both keys stay in this browser. gitms has no server — the page calls{" "}
          <span className="font-mono text-[12.5px] text-text">api.anthropic.com</span> and{" "}
          <span className="font-mono text-[12.5px] text-text">api.github.com</span> directly, so
          your keys are never sent to us and there is nowhere for them to be logged.
        </p>
      </header>

      <div className="space-y-8">
        <CredentialStep
          index={1}
          title="Anthropic API key"
          subtitle="Writes the descriptions and READMEs."
          state={anthropicTest}
          describe={(identity: { model: string }) => `Valid — will use ${identity.model}`}
        >
          <Field
            label="Key"
            hint={
              <>
                Create one at{" "}
                <a
                  className="text-accent hover:underline"
                  href="https://console.anthropic.com/settings/keys"
                  target="_blank"
                  rel="noreferrer"
                >
                  console.anthropic.com
                </a>
                . Testing is free — it checks authentication without generating anything.
              </>
            }
          >
            <Input
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={anthropicKey}
              onChange={(e) => {
                setAnthropicKey(e.target.value);
                setAnthropicTest({ status: "idle" });
              }}
              placeholder={auth.anthropic.masked ?? "sk-ant-..."}
              className="font-mono"
            />
          </Field>
          <Button
            size="sm"
            onClick={() => void runTest("anthropic")}
            disabled={
              anthropicTest.status === "testing" || (!anthropicKey.trim() && !auth.anthropic.present)
            }
          >
            Test connection
          </Button>
        </CredentialStep>

        <CredentialStep
          index={2}
          title="GitHub token"
          subtitle="Reads your repositories, and later writes the approved changes."
          state={githubTest}
          describe={(identity: { login: string; publicRepos: number }) =>
            `Connected as ${identity.login} — ${identity.publicRepos} public repos`
          }
        >
          <Field
            label="Token"
            hint={
              <>
                A{" "}
                <a
                  className="text-accent hover:underline"
                  href="https://github.com/settings/tokens/new?scopes=repo&description=gitms"
                  target="_blank"
                  rel="noreferrer"
                >
                  classic token with the <span className="font-mono">repo</span> scope
                </a>{" "}
                is simplest. Fine-grained tokens need Metadata: read, Contents: write and
                Administration: write.
              </>
            }
          >
            <Input
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={githubToken}
              onChange={(e) => {
                setGithubToken(e.target.value);
                setGithubTest({ status: "idle" });
              }}
              placeholder={auth.github.masked ?? "ghp_..."}
              className="font-mono"
            />
          </Field>
          <Button
            size="sm"
            onClick={() => void runTest("github")}
            disabled={githubTest.status === "testing" || (!githubToken.trim() && !auth.github.present)}
          >
            Test connection
          </Button>
        </CredentialStep>

        <div className="border-t border-line pt-2">
          <Switch
            checked={remember}
            onChange={setRemember}
            label="Remember these keys in this browser"
            description="Keeps them in this site's local storage so they survive a reload — not encrypted, and readable by any script running on this page. Left off, they are cleared when you close the tab."
          />
        </div>

        {remember && (
          <Banner tone="warn">
            Stored keys stay in this browser until you clear them. On a shared or public computer,
            leave this off — and revoke the keys from Anthropic and GitHub if you ever suspect
            they leaked. Settings → Clear stored keys removes them here.
          </Banner>
        )}
        {saveError && <Banner tone="error">{saveError}</Banner>}

        <div className="flex items-center gap-3 border-t border-line pt-6">
          <Button
            variant="primary"
            onClick={() => void save()}
            disabled={saving || !anthropicOk || !githubOk}
          >
            {saving ? "Saving…" : "Save and continue"}
          </Button>
          {(!anthropicOk || !githubOk) && (
            <span className="text-[12.5px] text-subtle">Test both connections first.</span>
          )}
        </div>
      </div>
    </div>
  );
}

function CredentialStep({
  index,
  title,
  subtitle,
  state,
  describe,
  children,
}: {
  index: number;
  title: string;
  subtitle: string;
  state: TestState;
  // The two identity shapes differ; each caller narrows to the one it renders.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  describe: (identity: any) => string;
  children: React.ReactNode;
}) {
  const done = state.status === "done" && state.result.ok;

  return (
    <section>
      <div className="mb-4 flex items-start gap-3">
        <span
          className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border text-[11px] transition-colors ${
            done ? "border-good/40 bg-good/15 text-good" : "border-line-strong text-subtle"
          }`}
        >
          {done ? <CheckIcon className="size-3" /> : index}
        </span>
        <div>
          <h2 className="text-[14px] font-medium text-text">{title}</h2>
          <p className="mt-0.5 text-[12.5px] text-subtle">{subtitle}</p>
        </div>
      </div>

      <div className="space-y-3 pl-8">
        {children}
        <TestResult state={state} describe={describe} />
      </div>
    </section>
  );
}

function TestResult({
  state,
  describe,
}: {
  state: TestState;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  describe: (identity: any) => string;
}) {
  if (state.status === "idle") return null;
  if (state.status === "testing") return <Spinner label="Checking…" />;

  const { result } = state;
  if (!result.ok) {
    return (
      <div className="flex gap-2 text-[12.5px] leading-relaxed">
        <XIcon className="mt-0.5 size-3.5 text-bad" />
        <div>
          <span className="text-bad">{result.error}</span>
          {result.hint && <span className="mt-0.5 block text-subtle">{result.hint}</span>}
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-2 text-[12.5px] leading-relaxed">
      <CheckIcon className="mt-0.5 size-3.5 text-good" />
      <div>
        <span className="text-good">{describe(result.identity)}</span>
        {result.warning && <span className="mt-0.5 block text-warn">{result.warning}</span>}
      </div>
    </div>
  );
}
