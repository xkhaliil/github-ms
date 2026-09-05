import { useCallback, useEffect, useState } from "react";
import { getAuthStatus, initSession } from "./api.js";
import { Setup } from "./pages/Setup.js";
import { Dashboard } from "./pages/Dashboard.js";
import { RepoDetail } from "./pages/RepoDetail.js";
import { Run } from "./pages/Run.js";
import { SettingsPage } from "./pages/Settings.js";
import { Banner, Spinner } from "./components/ui.js";
import { Lockup } from "./components/Logo.js";
import type { AuthStatus } from "@shared/types.js";

export type Route =
  | { page: "setup" }
  | { page: "dashboard" }
  | { page: "repo"; name: string }
  | { page: "run"; jobId?: string }
  | { page: "settings" };

/** Hash routing keeps deep links working across reloads without a router dependency. */
function parseHash(): Route {
  const hash = window.location.hash.replace(/^#\/?/, "");
  const [page, param] = hash.split("/");
  if (page === "repo" && param) return { page: "repo", name: decodeURIComponent(param) };
  if (page === "run") return param ? { page: "run", jobId: param } : { page: "run" };
  if (page === "settings") return { page: "settings" };
  if (page === "setup") return { page: "setup" };
  return { page: "dashboard" };
}

export function navigate(route: Route): void {
  const hash =
    route.page === "repo"
      ? `#/repo/${encodeURIComponent(route.name)}`
      : route.page === "run" && route.jobId
        ? `#/run/${route.jobId}`
        : `#/${route.page}`;
  window.location.hash = hash;
}

export function App() {
  const [route, setRoute] = useState<Route>(parseHash);
  const [auth, setAuth] = useState<AuthStatus | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);

  useEffect(() => {
    const onHashChange = () => setRoute(parseHash());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const refreshAuth = useCallback(async () => {
    setAuth(await getAuthStatus());
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        await initSession();
        await refreshAuth();
      } catch (err) {
        setBootError(err instanceof Error ? err.message : String(err));
      }
    })();
  }, [refreshAuth]);

  if (bootError) {
    return (
      <div className="mx-auto max-w-lg px-6 py-24">
        <Banner tone="error">{bootError}</Banner>
      </div>
    );
  }

  if (!auth) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner label="Starting gitms" />
      </div>
    );
  }

  // Everything downstream needs both credentials, so an unconfigured app has
  // exactly one thing it can usefully show.
  const showSetup = !auth.ready || route.page === "setup";

  return (
    <div className="flex h-full flex-col">
      <Header auth={auth} route={route} showSetup={showSetup} />
      <main className="flex-1 overflow-y-auto">
        {showSetup ? (
          <Setup auth={auth} onSaved={refreshAuth} />
        ) : route.page === "repo" ? (
          <RepoDetail name={route.name} />
        ) : route.page === "run" ? (
          <Run jobId={route.jobId} />
        ) : route.page === "settings" ? (
          <SettingsPage auth={auth} onAuthChange={refreshAuth} />
        ) : (
          <Dashboard />
        )}
      </main>
    </div>
  );
}

function Header({
  auth,
  route,
  showSetup,
}: {
  auth: AuthStatus;
  route: Route;
  showSetup: boolean;
}) {
  const tabs: { page: Route["page"]; label: string }[] = [
    { page: "dashboard", label: "Repositories" },
    { page: "run", label: "Runs" },
    { page: "settings", label: "Settings" },
  ];

  const isActive = (page: Route["page"]) =>
    route.page === page || (route.page === "repo" && page === "dashboard");

  return (
    <header className="sticky top-0 z-20 flex h-13 shrink-0 items-center gap-6 border-b border-line bg-bg/85 px-5 backdrop-blur-md">
      <button
        type="button"
        onClick={() => navigate({ page: "dashboard" })}
        aria-label="gitms home"
      >
        <Lockup />
      </button>

      {!showSetup && (
        <nav className="flex items-center gap-0.5">
          {tabs.map((tab) => (
            <button
              key={tab.page}
              type="button"
              onClick={() => navigate({ page: tab.page } as Route)}
              className={`rounded-md px-2.5 py-1.5 text-[13px] transition-colors ${
                isActive(tab.page)
                  ? "bg-raised text-text"
                  : "text-subtle hover:bg-raised/60 hover:text-text"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      )}

      {auth.github.identity && (
        <button
          type="button"
          onClick={() => navigate({ page: "settings" })}
          className="ml-auto flex items-center gap-2 rounded-full py-1 pr-2.5 pl-1 text-[12.5px] text-muted transition-colors hover:bg-raised hover:text-text"
        >
          <img
            src={auth.github.identity.avatarUrl}
            alt=""
            className="size-5.5 rounded-full ring-1 ring-line"
          />
          {auth.github.identity.login}
        </button>
      )}
    </header>
  );
}
