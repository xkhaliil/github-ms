import { describe, expect, it } from "vitest";
import { auditAccount, auditRepo, prioritise } from "../core/analyze/hygiene.js";
import type { RepoSummary } from "../shared/types.js";

function repo(overrides: Partial<RepoSummary> = {}): RepoSummary {
  return {
    name: "example",
    fullName: "someone/example",
    owner: "someone",
    htmlUrl: "https://github.com/someone/example",
    description: "does a thing",
    topics: ["cli", "python", "testing"],
    language: "Python",
    stars: 3,
    forks: 0,
    isFork: false,
    isArchived: false,
    isPrivate: false,
    isEmpty: false,
    defaultBranch: "main",
    homepage: null,
    license: "MIT",
    createdAt: "2024-01-01T00:00:00Z",
    pushedAt: new Date().toISOString(),
    sizeKb: 400,
    files: {
      hasReadme: true,
      hasLicenseFile: true,
      hasGitignore: true,
      hasCi: false,
      deployHints: [],
      incomplete: false,
    },
    ...overrides,
  };
}

const codes = (r: RepoSummary) => auditRepo(r).issues.map((i) => i.code);

describe("auditRepo", () => {
  it("gives a healthy repo a perfect score and no issues", () => {
    const result = auditRepo(repo());
    expect(result.score).toBe(100);
    expect(result.issues).toEqual([]);
  });

  it("flags the three things that matter most on a profile", () => {
    const found = codes(
      repo({
        description: null,
        topics: [],
        files: { ...repo().files, hasReadme: false },
      }),
    );
    expect(found).toContain("missing-description");
    expect(found).toContain("missing-topics");
    expect(found).toContain("missing-readme");
  });

  it("scores a bare repo far below a documented one", () => {
    const bare = auditRepo(
      repo({
        description: null,
        topics: [],
        license: null,
        files: {
          hasReadme: false,
          hasLicenseFile: false,
          hasGitignore: false,
          hasCi: false,
          deployHints: [],
          incomplete: false,
        },
      }),
    );
    expect(bare.score).toBeLessThan(30);
  });

  it("treats an empty description string as missing", () => {
    expect(codes(repo({ description: "   " }))).toContain("missing-description");
  });

  it("only asks for a homepage when something looks deployable", () => {
    expect(codes(repo({ homepage: null }))).not.toContain("missing-homepage");
    expect(
      codes(repo({ homepage: null, files: { ...repo().files, deployHints: ["vercel.json"] } })),
    ).toContain("missing-homepage");
  });

  it("accepts a license from the API even without a LICENSE file in the tree", () => {
    expect(
      codes(repo({ license: "MIT", files: { ...repo().files, hasLicenseFile: false } })),
    ).not.toContain("missing-license");
  });

  it("flags repos with no commits in over a year", () => {
    const old = new Date(Date.now() - 400 * 86_400_000).toISOString();
    expect(codes(repo({ pushedAt: old }))).toContain("stale");
    expect(codes(repo())).not.toContain("stale");
  });

  it("flags near-empty repos", () => {
    expect(codes(repo({ sizeKb: 1 }))).toContain("near-empty");
  });

  it("flags a legacy default branch", () => {
    expect(codes(repo({ defaultBranch: "master" }))).toContain("legacy-default-branch");
  });
});

describe("auditAccount", () => {
  const repos = [
    repo({ name: "good" }),
    repo({ name: "no-desc", description: null }),
    repo({ name: "bare", description: null, topics: [], files: { ...repo().files, hasReadme: false } }),
  ];

  it("counts what is missing across the account", () => {
    const audit = auditAccount("someone", repos, new Date().toISOString());
    expect(audit.totals.repos).toBe(3);
    expect(audit.totals.missingDescription).toBe(2);
    expect(audit.totals.missingReadme).toBe(1);
  });

  it("sorts worst-first so the dashboard leads with what needs work", () => {
    const audit = auditAccount("someone", repos, new Date().toISOString());
    expect(audit.repos[0]!.name).toBe("bare");
    expect(audit.repos.at(-1)!.name).toBe("good");
  });
});

describe("prioritise", () => {
  it("lists only repos this tool can actually fix", () => {
    const repos = [
      repo({ name: "healthy" }),
      repo({ name: "fixable", description: null }),
      // Only a human decision (license) - nothing automatable here.
      repo({ name: "human-only", license: null, files: { ...repo().files, hasLicenseFile: false } }),
    ];
    const audit = auditAccount("someone", repos, new Date().toISOString());
    const priority = prioritise(audit, repos);
    expect(priority).toContain("fixable");
    expect(priority).not.toContain("human-only");
    expect(priority).not.toContain("healthy");
  });

  it("breaks ties by stars, so visible repos get fixed first", () => {
    const repos = [
      repo({ name: "quiet", description: null, stars: 0 }),
      repo({ name: "popular", description: null, stars: 90 }),
    ];
    const audit = auditAccount("someone", repos, new Date().toISOString());
    expect(prioritise(audit, repos)[0]).toBe("popular");
  });
});
