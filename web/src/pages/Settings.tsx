import { useEffect, useState } from "react";
import { navigate } from "../App.js";
import {
  clearCredentials,
  clearLocalData,
  getSettings,
  updateSettings,
} from "../api.js";
import {
  Banner,
  Button,
  Field,
  Panel,
  Select,
  Spinner,
  Switch,
} from "../components/ui.js";
import { KeyIcon } from "../components/icons.js";
import { bridgeStatus } from "../lib/bridge.js";
import {
  EFFORTS,
  MODELS,
  PROVIDERS,
  type AuthStatus,
  type Provider,
  type Settings,
} from "@shared/types.js";

const MODEL_NOTES: Record<(typeof MODELS)[number], string> = {
  "claude-opus-5": "Best quality. Around $0.18 per repository.",
  "claude-sonnet-5":
    "Cheaper and faster. Around $0.07 per repository, with some quality cost.",
};

const EFFORT_NOTE =
  "How much reasoning to spend per repository. Medium is a good default; high helps on repos with sparse or confusing code.";

const PROVIDER_LABELS: Record<Provider, string> = {
  api: "Anthropic API key",
  "claude-code": "Claude Code CLI (subscription)",
};

/**
 * The CLI option is only real when the dev server is serving the bridge and the
 * binary is on this machine, so the hint reports what was actually detected
 * rather than describing a capability the run would then fail on.
 */
function providerHint(
  provider: Provider,
  bridge: { available: boolean; binary: string | null } | null,
): string {
  if (provider === "api") {
    return "Calls api.anthropic.com directly with your key. Billed against API credits, which a Claude subscription does not fund.";
  }
  if (bridge === null) return "Checking for a local Claude Code CLI…";
  if (!bridge.available) {
    return "Not available here. This needs the local dev server (npm run dev) and the Claude Code CLI installed — a deployed copy of this site cannot run one.";
  }
  return `Runs generation through ${bridge.binary}, billed to your Claude subscription instead of API credits. No API key needed.`;
}

export function SettingsPage({
  auth,
  onAuthChange,
}: {
  auth: AuthStatus;
  onAuthChange: () => Promise<void>;
}) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [bridge, setBridge] = useState<{
    available: boolean;
    binary: string | null;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [confirmWipe, setConfirmWipe] = useState(false);
  const [wiped, setWiped] = useState(false);

  useEffect(() => {
    void getSettings()
      .then(setSettings)
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : String(err)),
      );
    // Never throws - an absent bridge is reported as unavailable, not as an error.
    void bridgeStatus().then(setBridge);
  }, []);

  async function patch(update: Partial<Settings>) {
    try {
      setSettings(await updateSettings(update));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  if (!settings) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-10">
        {error ? (
          <Banner tone="error">{error}</Banner>
        ) : (
          <Spinner label="Loading settings" />
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5 px-6 py-8">
      <h1 className="text-[19px] font-semibold">Settings</h1>

      {error && <Banner tone="error">{error}</Banner>}

      <Panel title="Generation">
        <div className="mb-4">
          <Field label="Provider" hint={providerHint(settings.provider, bridge)}>
            <Select
              value={settings.provider}
              onChange={(e) =>
                void patch({ provider: e.target.value as Settings["provider"] })
              }
            >
              {PROVIDERS.map((p) => (
                <option key={p} value={p}>
                  {PROVIDER_LABELS[p]}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="grid items-start gap-4 sm:grid-cols-2">
          <Field label="Model" hint={MODEL_NOTES[settings.model]}>
            <Select
              value={settings.model}
              onChange={(e) =>
                void patch({ model: e.target.value as Settings["model"] })
              }
            >
              {MODELS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Effort" hint={EFFORT_NOTE}>
            <Select
              value={settings.effort}
              onChange={(e) =>
                void patch({ effort: e.target.value as Settings["effort"] })
              }
            >
              {EFFORTS.map((e) => (
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="mt-2 divide-y divide-line border-t border-line">
          <Switch
            checked={settings.batchMode}
            onChange={(v) => void patch({ batchMode: v })}
            label="Batch mode"
            description="Half price, but results arrive when the batch finishes rather than immediately."
          />
          <Switch
            checked={settings.mockAi}
            onChange={(v) => void patch({ mockAi: v })}
            label="Mock mode"
            description="Runs the whole pipeline without calling the API. Free — use it to check the flow before spending anything."
          />
        </div>
      </Panel>

      <Panel title="What to scan">
        <div className="-my-1 divide-y divide-line">
          <Switch
            checked={settings.includeForks}
            onChange={(v) => void patch({ includeForks: v })}
            label="Include forks"
            description="Off by default — a generated README on someone else's project is rarely wanted."
          />
          <Switch
            checked={settings.includeArchived}
            onChange={(v) => void patch({ includeArchived: v })}
            label="Include archived repositories"
          />
          <Switch
            checked={settings.includePrivate}
            onChange={(v) => void patch({ includePrivate: v })}
            label="Include private repositories"
            description="Private repos are not part of your public profile, but the tool can still tidy them."
          />
          <Switch
            checked={settings.overwriteExistingReadme}
            onChange={(v) => void patch({ overwriteExistingReadme: v })}
            label="Regenerate READMEs that already exist"
            description="Off by default. When on, the existing README is used as input and backed up locally before being replaced."
          />
        </div>
      </Panel>

      <Panel title="Credentials">
        <dl className="divide-y divide-line text-[13px]">
          <Row
            label="Anthropic"
            value={auth.anthropic.masked ?? "not set"}
            mono
          />
          <Row label="GitHub" value={auth.github.masked ?? "not set"} mono />
          <Row
            label="Storage"
            value={auth.remembered ? "saved in this browser" : "this tab only"}
          />
        </dl>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            onClick={() => navigate({ page: "setup" })}
            icon={<KeyIcon className="size-3.5" />}
          >
            Change keys
          </Button>
          {confirmClear ? (
            <>
              <Button
                variant="danger"
                onClick={() => {
                  void (async () => {
                    await clearCredentials();
                    await onAuthChange();
                    setConfirmClear(false);
                  })();
                }}
              >
                Confirm — forget both keys
              </Button>
              <Button variant="ghost" onClick={() => setConfirmClear(false)}>
                Cancel
              </Button>
            </>
          ) : (
            <Button variant="danger" onClick={() => setConfirmClear(true)}>
              Clear stored keys
            </Button>
          )}
        </div>
      </Panel>

      <Panel title="Local data">
        <p className="text-[13px] leading-relaxed text-muted">
          Your scan, proposals and evidence are stored in this browser only.
          Nothing was uploaded anywhere, so clearing them here is the whole
          deletion — but it cannot be undone, and proposals already applied to
          GitHub stay applied.
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          {confirmWipe ? (
            <>
              <Button
                variant="danger"
                onClick={() => {
                  void (async () => {
                    try {
                      await clearLocalData();
                      setWiped(true);
                      setConfirmWipe(false);
                    } catch (err) {
                      setError(
                        err instanceof Error ? err.message : String(err),
                      );
                    }
                  })();
                }}
              >
                Confirm — delete everything stored here
              </Button>
              <Button variant="ghost" onClick={() => setConfirmWipe(false)}>
                Cancel
              </Button>
            </>
          ) : (
            <Button variant="danger" onClick={() => setConfirmWipe(true)}>
              Delete local data
            </Button>
          )}
        </div>

        {wiped && (
          <div className="mt-4">
            <Banner tone="success">
              Local data deleted. Run a scan from the Repositories tab to start
              again.
            </Banner>
          </div>
        )}
      </Panel>
    </div>
  );
}

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <dt className="text-muted">{label}</dt>
      <dd
        className={`truncate text-text ${mono ? "font-mono text-[12.5px]" : ""}`}
      >
        {value}
      </dd>
    </div>
  );
}
