import type {
  AccountAudit,
  HygieneIssue,
  RepoAudit,
  RepoSummary,
} from "../../shared/types.js";

const DAY = 24 * 60 * 60 * 1000;
const STALE_DAYS = 365;

/**
 * Weights are the penalty subtracted from a perfect 100. They encode what
 * actually matters to a visitor: an unlabelled repo in the grid hurts more than
 * a missing .gitignore nobody will ever look at.
 */
const WEIGHTS: Record<string, number> = {
  "missing-description": 25,
  "missing-readme": 25,
  "stub-readme": 12,
  "missing-topics": 15,
  "missing-license": 10,
  "missing-homepage": 8,
  "missing-gitignore": 5,
  stale: 5,
  "near-empty": 10,
  "legacy-default-branch": 3,
};

function issue(
  code: keyof typeof WEIGHTS,
  severity: HygieneIssue["severity"],
  title: string,
  fix: string,
  automatable: boolean,
): HygieneIssue {
  return { code, severity, title, fix, automatable };
}

export function auditRepo(repo: RepoSummary): RepoAudit {
  const issues: HygieneIssue[] = [];

  if (!repo.description || repo.description.trim().length === 0) {
    issues.push(
      issue(
        "missing-description",
        "high",
        "No description",
        "Generate a one-line description from the code.",
        true,
      ),
    );
  }

  if (repo.topics.length === 0) {
    issues.push(
      issue("missing-topics", "high", "No topics", "Add 3-6 topics so the repo is discoverable.", true),
    );
  }

  if (!repo.files.hasReadme) {
    issues.push(
      issue(
        "missing-readme",
        "high",
        "No README",
        "Generate a README from the actual code and dependencies.",
        true,
      ),
    );
  }

  if (!repo.files.hasLicenseFile && !repo.license) {
    issues.push(
      issue(
        "missing-license",
        "medium",
        "No license",
        "Add a LICENSE file - without one, nobody may legally reuse the code.",
        false,
      ),
    );
  }

  // A homepage link only makes sense when there is something deployed to link to.
  if (!repo.homepage && repo.files.deployHints.length > 0) {
    issues.push(
      issue(
        "missing-homepage",
        "medium",
        "Deployable but no homepage link",
        `Found ${repo.files.deployHints.join(", ")} - add the live URL to the repo's homepage field.`,
        false,
      ),
    );
  }

  if (!repo.files.hasGitignore && !repo.isEmpty) {
    issues.push(
      issue("missing-gitignore", "low", "No .gitignore", "Add one for the project's language.", false),
    );
  }

  const pushed = repo.pushedAt ? Date.parse(repo.pushedAt) : 0;
  if (pushed && Date.now() - pushed > STALE_DAYS * DAY) {
    const years = ((Date.now() - pushed) / (365 * DAY)).toFixed(1);
    issues.push(
      issue(
        "stale",
        "low",
        `No commits in ${years} years`,
        "Still worth a README, or archive it to signal it is finished.",
        false,
      ),
    );
  }

  if (repo.isEmpty || repo.sizeKb < 5) {
    issues.push(
      issue(
        "near-empty",
        "medium",
        "Almost no content",
        "Consider deleting or making it private - empty repos dilute the profile.",
        false,
      ),
    );
  }

  if (repo.defaultBranch === "master") {
    issues.push(
      issue(
        "legacy-default-branch",
        "low",
        "Default branch is `master`",
        "Rename to `main` in repo settings.",
        false,
      ),
    );
  }

  const penalty = issues.reduce((sum, i) => sum + (WEIGHTS[i.code] ?? 0), 0);
  return { name: repo.name, score: Math.max(0, 100 - penalty), issues };
}

export function auditAccount(owner: string, repos: RepoSummary[], scannedAt: string): AccountAudit {
  const audits = repos.map(auditRepo);
  const has = (name: string, code: string) =>
    audits.find((a) => a.name === name)?.issues.some((i) => i.code === code) ?? false;

  const totals = {
    repos: repos.length,
    missingDescription: repos.filter((r) => has(r.name, "missing-description")).length,
    missingTopics: repos.filter((r) => has(r.name, "missing-topics")).length,
    missingReadme: repos.filter((r) => has(r.name, "missing-readme")).length,
    missingLicense: repos.filter((r) => has(r.name, "missing-license")).length,
    stale: repos.filter((r) => has(r.name, "stale")).length,
  };

  const averageScore =
    audits.length === 0
      ? 100
      : Math.round(audits.reduce((s, a) => s + a.score, 0) / audits.length);

  return {
    scannedAt,
    owner,
    totals,
    averageScore,
    repos: audits.sort((a, b) => a.score - b.score),
  };
}

/**
 * The "fix these first" list: worst scores first, but only repos where the tool
 * can actually do the work. Stars break ties - a visible repo is worth more.
 */
export function prioritise(audit: AccountAudit, repos: RepoSummary[], limit = 10): string[] {
  const starsOf = new Map(repos.map((r) => [r.name, r.stars]));
  return audit.repos
    .filter((a) => a.issues.some((i) => i.automatable))
    .sort((a, b) => a.score - b.score || (starsOf.get(b.name) ?? 0) - (starsOf.get(a.name) ?? 0))
    .slice(0, limit)
    .map((a) => a.name);
}
