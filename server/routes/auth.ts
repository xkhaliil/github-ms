import type { FastifyInstance } from "fastify";
import { describeAnthropicError, resetAnthropicCache, testAnthropicKey } from "../ai/client.js";
import { describeGithubError, resetClientCache, testGithubToken } from "../github/client.js";
import {
  authStatus,
  clearCredentials,
  getCredentials,
  persistCredentials,
  setAnthropicKey,
  setGithubIdentity,
  setGithubToken,
} from "../session.js";
import { readSettings } from "../store/index.js";
import type { ConnectionTest } from "../../shared/types.js";

interface TestBody {
  kind?: "anthropic" | "github";
  /** Omitted when re-testing a key already held in memory. */
  value?: string;
}

interface SaveBody {
  anthropicKey?: string;
  githubToken?: string;
  remember?: boolean;
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/auth/status", async () => authStatus());

  /**
   * Tests one credential live. Accepts a value directly so a key can be verified
   * before it is stored anywhere - nothing is persisted by this route.
   */
  app.post<{ Body: TestBody }>("/api/auth/test", async (req, reply): Promise<ConnectionTest> => {
    const { kind } = req.body ?? {};
    if (kind !== "anthropic" && kind !== "github") {
      reply.code(400);
      return { ok: false, kind: "github", error: "Unknown credential kind." };
    }

    const held = getCredentials();
    const value =
      req.body?.value?.trim() ||
      (kind === "anthropic" ? held.anthropicKey : held.githubToken) ||
      "";

    if (!value) {
      return {
        ok: false,
        kind,
        error: kind === "anthropic" ? "Enter an Anthropic API key." : "Enter a GitHub token.",
      };
    }

    try {
      if (kind === "anthropic") {
        const settings = await readSettings();
        const { identity, warning } = await testAnthropicKey(value, settings.model);
        return warning === undefined
          ? { ok: true, kind, identity }
          : { ok: true, kind, identity, warning };
      }
      const { identity, warning } = await testGithubToken(value);
      // Cache the identity so the UI can show who is connected without re-testing.
      if (value === held.githubToken) setGithubIdentity(identity);
      return warning === undefined
        ? { ok: true, kind, identity }
        : { ok: true, kind, identity, warning };
    } catch (err) {
      const described = kind === "anthropic" ? describeAnthropicError(err) : describeGithubError(err);
      return { ok: false, kind, ...described };
    }
  });

  /** Stores credentials in memory; writes them to disk only when `remember` is true. */
  app.post<{ Body: SaveBody }>("/api/auth/save", async (req) => {
    const { anthropicKey, githubToken, remember } = req.body ?? {};

    if (typeof anthropicKey === "string") {
      setAnthropicKey(anthropicKey);
      resetAnthropicCache();
    }
    if (typeof githubToken === "string") {
      setGithubToken(githubToken);
      resetClientCache();
      setGithubIdentity(null);
      // Refresh the identity so the dashboard has an owner to work with.
      if (githubToken.trim()) {
        try {
          const { identity } = await testGithubToken(githubToken.trim());
          setGithubIdentity(identity);
        } catch {
          // A save with a bad token is still a save; the test route reports why.
        }
      }
    }

    let permissionsRestricted = true;
    if (remember) {
      const result = await persistCredentials();
      permissionsRestricted = result.permissionsRestricted;
    }

    return { status: authStatus(), permissionsRestricted };
  });

  app.post("/api/auth/clear", async () => {
    await clearCredentials();
    resetClientCache();
    resetAnthropicCache();
    return authStatus();
  });
}
