/**
 * Extracts a concrete tech stack from dependency manifests. This is deliberately
 * evidence-based: the model is told what the project actually depends on, rather
 * than being left to infer a stack from file extensions and guess wrong.
 */

export interface ParsedManifest {
  file: string;
  ecosystem: string;
  packageName?: string;
  version?: string;
  description?: string;
  dependencies: string[];
  scripts?: Record<string, string>;
  /** Entry point or binary declared by the manifest, when it names one. */
  entry?: string;
}

export const MANIFEST_FILES = [
  "package.json",
  "pyproject.toml",
  "requirements.txt",
  "setup.py",
  "go.mod",
  "Cargo.toml",
  "composer.json",
  "pom.xml",
  "Gemfile",
  "pubspec.yaml",
] as const;

const MAX_DEPS = 40;

function trim(list: string[]): string[] {
  return [...new Set(list.filter(Boolean))].slice(0, MAX_DEPS);
}

export function parseManifest(file: string, text: string): ParsedManifest | null {
  try {
    switch (file) {
      case "package.json":
        return parsePackageJson(text);
      case "composer.json":
        return parseComposerJson(text);
      case "pyproject.toml":
        return parsePyproject(text);
      case "requirements.txt":
        return parseRequirements(text);
      case "setup.py":
        return parseSetupPy(text);
      case "go.mod":
        return parseGoMod(text);
      case "Cargo.toml":
        return parseCargoToml(text);
      case "pom.xml":
        return parsePom(text);
      case "Gemfile":
        return parseGemfile(text);
      case "pubspec.yaml":
        return parsePubspec(text);
      default:
        return null;
    }
  } catch {
    // A malformed manifest is evidence too, but not something to crash a scan over.
    return null;
  }
}

function parsePackageJson(text: string): ParsedManifest {
  const pkg = JSON.parse(text) as {
    name?: string;
    version?: string;
    description?: string;
    main?: string;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    scripts?: Record<string, string>;
  };
  const manifest: ParsedManifest = {
    file: "package.json",
    ecosystem: "npm",
    dependencies: trim([
      ...Object.keys(pkg.dependencies ?? {}),
      ...Object.keys(pkg.devDependencies ?? {}),
    ]),
  };
  if (pkg.name) manifest.packageName = pkg.name;
  if (pkg.version) manifest.version = pkg.version;
  if (pkg.description) manifest.description = pkg.description;
  if (pkg.main) manifest.entry = pkg.main;
  if (pkg.scripts) manifest.scripts = pkg.scripts;
  return manifest;
}

function parseComposerJson(text: string): ParsedManifest {
  const pkg = JSON.parse(text) as {
    name?: string;
    description?: string;
    require?: Record<string, string>;
    scripts?: Record<string, string>;
  };
  const manifest: ParsedManifest = {
    file: "composer.json",
    ecosystem: "composer",
    dependencies: trim(Object.keys(pkg.require ?? {})),
  };
  if (pkg.name) manifest.packageName = pkg.name;
  if (pkg.description) manifest.description = pkg.description;
  if (pkg.scripts) manifest.scripts = pkg.scripts;
  return manifest;
}

/** Minimal TOML reading - enough for names and dependency keys, no TOML parser needed. */
function parsePyproject(text: string): ParsedManifest {
  const name = /^\s*name\s*=\s*["']([^"']+)["']/m.exec(text)?.[1];
  const version = /^\s*version\s*=\s*["']([^"']+)["']/m.exec(text)?.[1];
  const description = /^\s*description\s*=\s*["']([^"']+)["']/m.exec(text)?.[1];

  const deps: string[] = [];
  // [project] dependencies = ["fastapi>=0.1", ...]
  const arrayBlock = /dependencies\s*=\s*\[([\s\S]*?)\]/m.exec(text)?.[1];
  if (arrayBlock) {
    for (const m of arrayBlock.matchAll(/["']([A-Za-z0-9._-]+)/g)) deps.push(m[1]!);
  }
  // [tool.poetry.dependencies] name = "^1.0"
  // No /m flag: with it, `$` matches the first line end and the lazy capture
  // comes back empty, silently dropping every dependency.
  const poetry = /\[tool\.poetry\.dependencies\]\r?\n([\s\S]*?)(?=\n\[|$)/.exec(text)?.[1];
  if (poetry) {
    for (const m of poetry.matchAll(/^\s*([A-Za-z0-9._-]+)\s*=/gm)) deps.push(m[1]!);
  }

  const manifest: ParsedManifest = {
    file: "pyproject.toml",
    ecosystem: "python",
    dependencies: trim(deps.filter((d) => d.toLowerCase() !== "python")),
  };
  if (name) manifest.packageName = name;
  if (version) manifest.version = version;
  if (description) manifest.description = description;
  return manifest;
}

function parseRequirements(text: string): ParsedManifest {
  const deps = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#") && !l.startsWith("-"))
    .map((l) => l.split(/[<>=!~[; ]/)[0] ?? "");
  return { file: "requirements.txt", ecosystem: "python", dependencies: trim(deps) };
}

function parseSetupPy(text: string): ParsedManifest {
  const name = /name\s*=\s*["']([^"']+)["']/.exec(text)?.[1];
  const block = /install_requires\s*=\s*\[([\s\S]*?)\]/.exec(text)?.[1] ?? "";
  const deps = [...block.matchAll(/["']([A-Za-z0-9._-]+)/g)].map((m) => m[1]!);
  const manifest: ParsedManifest = {
    file: "setup.py",
    ecosystem: "python",
    dependencies: trim(deps),
  };
  if (name) manifest.packageName = name;
  return manifest;
}

function parseGoMod(text: string): ParsedManifest {
  const module = /^module\s+(\S+)/m.exec(text)?.[1];
  const version = /^go\s+(\S+)/m.exec(text)?.[1];
  const deps = [...text.matchAll(/^\s+([\w.\-/]+)\s+v[\d.]+/gm)].map((m) => m[1]!);
  const manifest: ParsedManifest = { file: "go.mod", ecosystem: "go", dependencies: trim(deps) };
  if (module) manifest.packageName = module;
  if (version) manifest.version = `go ${version}`;
  return manifest;
}

function parseCargoToml(text: string): ParsedManifest {
  const name = /^\s*name\s*=\s*["']([^"']+)["']/m.exec(text)?.[1];
  const version = /^\s*version\s*=\s*["']([^"']+)["']/m.exec(text)?.[1];
  const description = /^\s*description\s*=\s*["']([^"']+)["']/m.exec(text)?.[1];
  const block = /\[dependencies\]\r?\n([\s\S]*?)(?=\n\[|$)/.exec(text)?.[1] ?? "";
  const deps = [...block.matchAll(/^\s*([A-Za-z0-9._-]+)\s*=/gm)].map((m) => m[1]!);
  const manifest: ParsedManifest = {
    file: "Cargo.toml",
    ecosystem: "rust",
    dependencies: trim(deps),
  };
  if (name) manifest.packageName = name;
  if (version) manifest.version = version;
  if (description) manifest.description = description;
  return manifest;
}

function parsePom(text: string): ParsedManifest {
  const artifact = /<artifactId>([^<]+)<\/artifactId>/.exec(text)?.[1];
  const description = /<description>([^<]+)<\/description>/.exec(text)?.[1];
  const deps = [...text.matchAll(/<dependency>[\s\S]*?<artifactId>([^<]+)<\/artifactId>/g)].map(
    (m) => m[1]!,
  );
  const manifest: ParsedManifest = { file: "pom.xml", ecosystem: "maven", dependencies: trim(deps) };
  if (artifact) manifest.packageName = artifact;
  if (description) manifest.description = description;
  return manifest;
}

function parseGemfile(text: string): ParsedManifest {
  const deps = [...text.matchAll(/^\s*gem\s+["']([^"']+)["']/gm)].map((m) => m[1]!);
  return { file: "Gemfile", ecosystem: "ruby", dependencies: trim(deps) };
}

function parsePubspec(text: string): ParsedManifest {
  const name = /^name:\s*(\S+)/m.exec(text)?.[1];
  const description = /^description:\s*(.+)$/m.exec(text)?.[1]?.trim();
  const block = /^dependencies:\s*$([\s\S]*?)(^\S|$)/m.exec(text)?.[1] ?? "";
  const deps = [...block.matchAll(/^\s{2}([A-Za-z0-9._]+):/gm)].map((m) => m[1]!);
  const manifest: ParsedManifest = {
    file: "pubspec.yaml",
    ecosystem: "dart",
    dependencies: trim(deps),
  };
  if (name) manifest.packageName = name;
  if (description) manifest.description = description;
  return manifest;
}
