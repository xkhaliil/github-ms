import { useEffect, useState } from "react";
import { navigate } from "../App.js";
import { clearCredentials, getSettings, updateSettings } from "../api.js";
import { Banner, Button, Field, Panel, Select, Spinner, Switch } from "../components/ui.js";
import { KeyIcon } from "../components/icons.js";
import { EFFORTS, MODELS, type AuthStatus, type Settings } from "@shared/types.js";

const MODEL_NOTES: Record<(typeof MODELS)[number], string> = {
  "claude-opus-5": "Best quality. Around $0.18 per repository.",
  "claude-sonnet-5": "Cheaper and faster. Around $0.07 per repository, with some quality cost.",
};

const EFFORT_NOTE =
  "How much reasoning to spend per repository. Medium is a good default; high helps on repos with sparse or confusing code.";

export function SettingsPage({
  auth,
  onAuthChange,
}: {
  auth: AuthStatus;
  onAuthChange: () => Promise<void>;
}) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(() => {
    void getSettings()
      .then(setSettings)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
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
        {error ? <Banner tone="error">{error}</Banner> : <Spinner label="Loading settings" />}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5 px-6 py-8">
      <h1 className="text-[19px] font-semibold">Settings</h1>

      {error && <Banner tone="error">{error}</Banner>}

      <Panel title="Generation">
        <div className="grid items-start gap-4 sm:grid-cols-2">
          <Field label="Model" hint={MODEL_NOTES[settings.model]}>
            <Select
              value={settings.model}
              onChange={(e) => void patch({ model: e.target.value as Settings["model"] })}
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
              onChange={(e) => void patch({ effort: e.target.value as Settings["effort"] })}
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
          <Row label="Anthropic" value={auth.anthropic.masked ?? "not set"} mono />
          <Row label="GitHub" value={auth.github.masked ?? "not set"} mono />
          <Row
            label="Storage"
            value={auth.remembered ? "on disk in ~/.gitms" : "in memory only"}
          />
        </dl>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={() => navigate({ page: "setup" })} icon={<KeyIcon className="size-3.5" />}>
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
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <dt className="text-muted">{label}</dt>
      <dd className={`truncate text-text ${mono ? "font-mono text-[12.5px]" : ""}`}>{value}</dd>
    </div>
  );
}
