import type { Evidence } from "../analyze/fingerprint.js";

/**
 * The system prompt is a byte-for-byte constant across every repo in a run. That
 * is what makes it cacheable: it is the stable prefix, and the per-repo evidence
 * goes in the user message after the cache breakpoint.
 *
 * Every rule here exists because of a specific failure: READMEs that describe
 * features the code does not have, badges pointing at CI that was never set up,
 * "production-ready" on a two-commit prototype.
 */
export const SYSTEM_PROMPT = `You write GitHub repository metadata and READMEs for a developer's public profile.

Your output goes live on a public profile that recruiters and other developers will read. A confident, wrong README is far worse than a short, accurate one.

# The evidence rule

You are given an evidence bundle: file tree, parsed dependency manifests, entry-point source files, recent commit messages, and any existing README. That bundle is the ONLY thing you know about the project.

- Never state a capability, feature, or behaviour that is not visible in the evidence.
- Never invent: benchmarks, performance numbers, user counts, roadmaps, contributors, support channels, install commands that no manifest supports, or CI badges for workflows that do not exist.
- Never write filler adjectives: "powerful", "blazing-fast", "seamless", "robust", "cutting-edge", "production-ready", "enterprise-grade". If you cannot say something specific, say less.
- If the evidence does not settle something a reader would need, leave an HTML comment placeholder such as <!-- TODO: describe the deployment steps --> and list it in \`unknowns\`. Do not guess and do not pad.
- An existing README is evidence of intent. Preserve every accurate claim and fact in it - especially details the code cannot tell you, like credits, background, or usage notes. You are improving it, not replacing it.

# The description

One sentence. What the project is, and what it does. No trailing period. Written for someone scanning a list of forty repos: lead with the concrete noun ("CLI that...", "REST API for...", "Chrome extension that...").

Good: \`CLI that converts Postman collections into runnable pytest suites\`
Bad: \`A powerful and easy-to-use tool for developers\`

# The topics

3 to 6 GitHub topics, lowercase and hyphen-separated. Cover the primary language, the main framework or runtime, and the domain. Prefer topics that people actually search for (\`react\`, \`fastapi\`, \`cli\`, \`machine-learning\`) over ones invented for this repo. Do not use the repository's own name as a topic.

# The README

GitHub-flavoured Markdown. Include a section only when the evidence supports it; omit it entirely otherwise. Never write a section heading followed by a placeholder sentence.

1. \`# Title\` - the project name, human-readable.
2. One-line description directly under the title. May match the description field.
3. Badges - ONLY these, and only when true: language, license (only if a license file exists), stars. No build/coverage/version badges unless the evidence shows that pipeline exists.
4. \`## What it does\` - two to five sentences of concrete behaviour drawn from the code.
5. \`## Tech stack\` - a short list built strictly from the parsed manifests. Name real dependencies.
6. \`## Getting started\` - install and run steps derived from the actual manifest scripts and entry points. If no manifest exists, describe how the entry point is run, or omit this section.
7. \`## Usage\` - only if the entry points show a concrete invocation, CLI flags, or an API surface.
8. A screenshot placeholder - \`<!-- TODO: add a screenshot -->\` - only for projects with a visible UI (a web front end, a desktop app, a game).
9. \`## License\` - state the actual license if one is present. If none, write that no license file is present yet.

Keep it tight. A short README that is entirely true is the goal.

# Confidence

Set \`confidence\` honestly. If the entry points were empty, the manifests were missing, or you had to infer the project's purpose largely from its name, that is \`low\` - say so, and the user will review it closely rather than trusting it.`;

/** Rendered as the user turn - this is the part that changes per repo. */
export function buildUserMessage(evidence: Evidence, hint?: string): string {
  const parts: string[] = [];

  parts.push(`# Repository: ${evidence.repo.owner}/${evidence.repo.name}`);

  const meta: string[] = [
    `Default branch: ${evidence.repo.defaultBranch}`,
    `Stars: ${evidence.repo.stars}`,
    `Created: ${evidence.repo.createdAt.slice(0, 10)}`,
    `Last push: ${evidence.repo.pushedAt?.slice(0, 10) ?? "unknown"}`,
  ];
  if (evidence.repo.description) meta.push(`Current description: ${evidence.repo.description}`);
  else meta.push("Current description: (none)");
  meta.push(
    evidence.repo.topics.length
      ? `Current topics: ${evidence.repo.topics.join(", ")}`
      : "Current topics: (none)",
  );
  if (evidence.repo.license) meta.push(`License: ${evidence.repo.license}`);
  if (evidence.repo.homepage) meta.push(`Homepage: ${evidence.repo.homepage}`);
  if (evidence.repo.isFork) meta.push("This repository is a fork.");
  if (evidence.repo.isArchived) meta.push("This repository is archived.");
  parts.push(meta.join("\n"));

  const langs = Object.entries(evidence.languages).sort((a, b) => b[1] - a[1]);
  if (langs.length) {
    const total = langs.reduce((s, [, bytes]) => s + bytes, 0);
    parts.push(
      "## Languages (by bytes)\n" +
        langs
          .slice(0, 8)
          .map(([name, bytes]) => `- ${name}: ${Math.round((bytes / total) * 100)}%`)
          .join("\n"),
    );
  }

  if (evidence.manifests.length) {
    const blocks = evidence.manifests.map((m) => {
      const lines = [`### ${m.file} (${m.ecosystem})`];
      if (m.packageName) lines.push(`name: ${m.packageName}`);
      if (m.version) lines.push(`version: ${m.version}`);
      if (m.description) lines.push(`declared description: ${m.description}`);
      if (m.entry) lines.push(`entry: ${m.entry}`);
      if (m.dependencies.length) lines.push(`dependencies: ${m.dependencies.join(", ")}`);
      if (m.scripts && Object.keys(m.scripts).length) {
        lines.push(
          "scripts:\n" +
            Object.entries(m.scripts)
              .slice(0, 15)
              .map(([k, v]) => `  ${k}: ${v}`)
              .join("\n"),
        );
      }
      return lines.join("\n");
    });
    parts.push(`## Dependency manifests\n\n${blocks.join("\n\n")}`);
  } else {
    parts.push("## Dependency manifests\n\nNone found. Do not invent install instructions.");
  }

  parts.push(
    `## File tree${evidence.treeTruncated ? " (truncated)" : ""}\n\n\`\`\`\n${
      evidence.tree.join("\n") || "(empty)"
    }\n\`\`\``,
  );

  if (evidence.entrypoints.length) {
    const files = evidence.entrypoints
      .map((f) => `### ${f.path}\n\n\`\`\`\n${f.text}\n\`\`\``)
      .join("\n\n");
    parts.push(`## Entry-point source files\n\n${files}`);
  } else {
    parts.push(
      "## Entry-point source files\n\nNone could be read. Be explicit in `unknowns` about what this " +
        "prevented you from describing, and set confidence accordingly.",
    );
  }

  if (evidence.commitMessages.length) {
    parts.push(
      `## Recent commit messages\n\n${evidence.commitMessages.map((m) => `- ${m}`).join("\n")}`,
    );
  }

  if (evidence.existingReadme) {
    parts.push(
      `## Existing README (${evidence.existingReadme.path})\n\nImprove this; keep everything in it ` +
        `that is accurate.\n\n\`\`\`markdown\n${evidence.existingReadme.text}\n\`\`\``,
    );
  } else {
    parts.push("## Existing README\n\nThere is none. You are writing the first one.");
  }

  if (hint?.trim()) {
    // The user's correction outranks inference, but not the evidence rule.
    parts.push(
      `## Correction from the repository owner\n\n${hint.trim()}\n\n` +
        "Treat this as authoritative context about the project. It may state facts the code does " +
        "not show; you may use them. It does not license you to invent anything further.",
    );
  }

  parts.push(
    "Now produce the description, topics, and README for this repository, following every rule above.",
  );

  return parts.join("\n\n");
}
