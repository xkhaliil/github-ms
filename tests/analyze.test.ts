import { describe, expect, it } from "vitest";
import { parseManifest } from "../core/analyze/manifests.js";
import {
  isTooThin,
  pickEntrypoints,
  trimTree,
} from "../core/analyze/fingerprint.js";
import { deriveFileFacts } from "../core/github/repos.js";
import type { Evidence } from "../core/analyze/fingerprint.js";

describe("parseManifest", () => {
  it("reads name, description, deps and scripts from package.json", () => {
    const parsed = parseManifest(
      "package.json",
      JSON.stringify({
        name: "thing",
        version: "1.2.3",
        description: "a thing",
        dependencies: { react: "^19", fastify: "^5" },
        devDependencies: { vitest: "^3" },
        scripts: { dev: "vite" },
      }),
    );
    expect(parsed?.ecosystem).toBe("npm");
    expect(parsed?.packageName).toBe("thing");
    expect(parsed?.dependencies).toEqual(["react", "fastify", "vitest"]);
    expect(parsed?.scripts?.["dev"]).toBe("vite");
  });

  it("returns null for a malformed manifest instead of throwing", () => {
    expect(parseManifest("package.json", "{ not json")).toBeNull();
  });

  it("strips version specifiers from requirements.txt", () => {
    const parsed = parseManifest(
      "requirements.txt",
      "flask>=2.0\n# a comment\nrequests==2.31.0\n-e .\nnumpy",
    );
    expect(parsed?.dependencies).toEqual(["flask", "requests", "numpy"]);
  });

  it("reads PEP 621 dependencies from pyproject.toml", () => {
    const parsed = parseManifest(
      "pyproject.toml",
      `[project]\nname = "svc"\ndescription = "an api"\ndependencies = ["fastapi>=0.100", "uvicorn"]\n`,
    );
    expect(parsed?.packageName).toBe("svc");
    expect(parsed?.dependencies).toEqual(["fastapi", "uvicorn"]);
  });

  it("reads poetry-style dependencies and drops the python pin", () => {
    const parsed = parseManifest(
      "pyproject.toml",
      `[tool.poetry]\nname = "svc"\n\n[tool.poetry.dependencies]\npython = "^3.11"\nhttpx = "^0.27"\n`,
    );
    expect(parsed?.dependencies).toEqual(["httpx"]);
  });

  it("reads the module path and requires from go.mod", () => {
    const parsed = parseManifest(
      "go.mod",
      "module github.com/me/tool\n\ngo 1.22\n\nrequire (\n\tgithub.com/spf13/cobra v1.8.0\n)\n",
    );
    expect(parsed?.packageName).toBe("github.com/me/tool");
    expect(parsed?.dependencies).toContain("github.com/spf13/cobra");
  });

  it("reads Cargo.toml package metadata and dependencies", () => {
    const parsed = parseManifest(
      "Cargo.toml",
      `[package]\nname = "cli"\nversion = "0.1.0"\n\n[dependencies]\nserde = "1"\ntokio = { version = "1" }\n`,
    );
    expect(parsed?.packageName).toBe("cli");
    expect(parsed?.dependencies).toEqual(["serde", "tokio"]);
  });
});

describe("trimTree", () => {
  it("drops vendored directories that say nothing about the project", () => {
    const { paths } = trimTree({
      paths: [
        "src/index.ts",
        "node_modules/react/index.js",
        "dist/bundle.js",
        "README.md",
      ],
      truncated: false,
      ok: true,
    });
    expect(paths).toEqual(["README.md", "src/index.ts"]);
  });

  it("caps depth so a deep tree does not crowd out the code", () => {
    const { paths } = trimTree({
      paths: ["a/b/c.ts", "a/b/c/d/e.ts"],
      truncated: false,
      ok: true,
    });
    expect(paths).toEqual(["a/b/c.ts"]);
  });

  it("reports truncation when the cap is hit", () => {
    const many = Array.from({ length: 400 }, (_, i) => `file${i}.ts`);
    const result = trimTree({ paths: many, truncated: false, ok: true });
    expect(result.paths).toHaveLength(300);
    expect(result.truncated).toBe(true);
  });
});

describe("pickEntrypoints", () => {
  it("prefers conventional entry points", () => {
    const picked = pickEntrypoints([
      "src/utils/helper.ts",
      "src/index.ts",
      "docs/guide.md",
    ]);
    expect(picked[0]).toBe("src/index.ts");
  });

  it("falls back to the shallowest source files when nothing matches", () => {
    const picked = pickEntrypoints(["deep/nested/thing.py", "top.py"]);
    expect(picked[0]).toBe("top.py");
  });

  it("ignores non-source files entirely", () => {
    expect(pickEntrypoints(["README.md", "logo.png"])).toEqual([]);
  });
});

describe("deriveFileFacts", () => {
  it("detects readme, license, gitignore, CI and deploy config", () => {
    const facts = deriveFileFacts({
      paths: [
        "README.md",
        "LICENSE",
        ".gitignore",
        ".github/workflows/ci.yml",
        "vercel.json",
        "src/index.ts",
      ],
      truncated: false,
      ok: true,
    });
    expect(facts).toMatchObject({
      hasReadme: true,
      hasLicenseFile: true,
      hasGitignore: true,
      hasCi: true,
      incomplete: false,
    });
    expect(facts.deployHints).toContain("vercel.json");
  });

  it("does not mistake a nested readme for a root one", () => {
    const facts = deriveFileFacts({
      paths: ["docs/README.md"],
      truncated: false,
      ok: true,
    });
    expect(facts.hasReadme).toBe(false);
  });

  it("marks an unreadable tree as incomplete", () => {
    expect(
      deriveFileFacts({ paths: [], truncated: false, ok: false }).incomplete,
    ).toBe(true);
  });
});

describe("isTooThin", () => {
  const base: Evidence = {
    repo: {
      name: "x",
      owner: "y",
      description: null,
      topics: [],
      homepage: null,
      license: null,
      stars: 0,
      createdAt: "2024-01-01T00:00:00Z",
      pushedAt: null,
      defaultBranch: "main",
      isFork: false,
      isArchived: false,
    },
    languages: {},
    tree: [],
    treeTruncated: false,
    manifests: [],
    existingReadme: null,
    entrypoints: [],
    commitMessages: [],
    bytes: 0,
  };

  it("refuses to describe a repo with nothing in it", () => {
    expect(isTooThin(base)).toBe(true);
  });

  it("accepts a repo once there is code to read", () => {
    expect(
      isTooThin({
        ...base,
        entrypoints: [{ path: "main.py", text: "print(1)" }],
      }),
    ).toBe(false);
  });

  it("accepts a repo with a manifest even when no entry point was readable", () => {
    expect(
      isTooThin({
        ...base,
        manifests: [
          { file: "package.json", ecosystem: "npm", dependencies: ["react"] },
        ],
      }),
    ).toBe(false);
  });
});
