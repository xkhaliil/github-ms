/**
 * Realistic fixture data so every screen can be rendered and reviewed without
 * touching a real GitHub account.
 *
 * The app stores its data in the browser now, so this module only builds the
 * fixtures and exports them; `shoot.mjs` injects them into the page's IndexedDB.
 * Run directly (`npm run qa:seed`) to print what would be seeded.
 *
 * Development tool only - it never runs as part of the app.
 */

const files = (over = {}) => ({
  hasReadme: false,
  hasLicenseFile: false,
  hasGitignore: true,
  hasCi: false,
  deployHints: [],
  incomplete: false,
  ...over,
});

const day = 86_400_000;
const ago = (days) => new Date(Date.now() - days * day).toISOString();

const repos = [
  {
    name: "portfolio-site",
    language: "TypeScript",
    stars: 12,
    description: null,
    topics: [],
    pushedAt: ago(4),
    sizeKb: 2400,
    files: files({ deployHints: ["vercel.json"] }),
  },
  {
    name: "pytest-postman",
    language: "Python",
    stars: 47,
    description: "converts postman stuff",
    topics: ["python"],
    pushedAt: ago(21),
    sizeKb: 890,
    files: files({ hasReadme: true, hasLicenseFile: true }),
    license: "MIT",
  },
  {
    name: "raycast-timezones",
    language: "TypeScript",
    stars: 3,
    description: null,
    topics: [],
    pushedAt: ago(140),
    sizeKb: 320,
    files: files(),
  },
  {
    name: "algo-notes",
    language: "Java",
    stars: 0,
    description: null,
    topics: [],
    pushedAt: ago(520),
    sizeKb: 60,
    defaultBranch: "master",
    files: files(),
  },
  {
    name: "dotfiles",
    language: "Shell",
    stars: 1,
    description: "my dotfiles",
    topics: ["dotfiles", "shell", "macos"],
    pushedAt: ago(9),
    sizeKb: 140,
    files: files({ hasReadme: true }),
  },
  {
    name: "scrapy-realestate",
    language: "Python",
    stars: 8,
    description: null,
    topics: [],
    pushedAt: ago(300),
    sizeKb: 510,
    files: files(),
  },
  {
    name: "wasm-image-lab",
    language: "Rust",
    stars: 21,
    description: null,
    topics: ["rust"],
    pushedAt: ago(60),
    sizeKb: 1100,
    files: files({ hasCi: true }),
  },
  {
    name: "todo-app-tutorial",
    language: "JavaScript",
    stars: 0,
    description: null,
    topics: [],
    pushedAt: ago(700),
    sizeKb: 3,
    files: files(),
  },
];

const full = repos.map((r) => ({
  fullName: `wassim/${r.name}`,
  owner: "wassim",
  htmlUrl: `https://github.com/wassim/${r.name}`,
  description: null,
  topics: [],
  language: null,
  stars: 0,
  forks: 0,
  isFork: false,
  isArchived: false,
  isPrivate: false,
  isEmpty: false,
  defaultBranch: "main",
  homepage: null,
  license: null,
  createdAt: ago(900),
  sizeKb: 100,
  ...r,
}));

const scannedAt = new Date().toISOString();

// Reuse the real auditor so the fixture scores are the ones the app computes.
const { auditAccount } = await import("../core/analyze/hygiene.ts");

const proposalMeta = {
  name: "raycast-timezones",
  status: "pending",
  description:
    "Raycast extension that shows the current time for a saved list of teammates",
  topics: ["raycast", "raycast-extension", "typescript", "timezones"],
  confidence: "high",
  reasoning:
    "package.json declares @raycast/api and a `timezones` command; src/index.tsx renders a List of saved people with a resolved local time using Intl.DateTimeFormat.",
  unknowns: [
    "Whether the extension was ever published to the Raycast store - nothing in the repo says.",
  ],
  generatedAt: scannedAt,
  model: "claude-opus-5",
};

const readme = `# raycast-timezones

Raycast extension that shows the current time for a saved list of teammates.

![TypeScript](https://img.shields.io/badge/TypeScript-3178c6?logo=typescript&logoColor=white)

## What it does

Adds a \`Timezones\` command to Raycast. Each entry stores a person's name and an
IANA timezone; the list renders their current local time, refreshed whenever the
command opens. Entries are persisted through Raycast's \`LocalStorage\` API, so the
list survives restarts.

## Tech stack

- \`@raycast/api\` — command surface, list rendering and local storage
- \`react\` — the extension renders as a React tree
- \`typescript\`

## Getting started

\`\`\`bash
npm install
npm run dev
\`\`\`

\`npm run dev\` builds the extension and loads it into a running Raycast instance.

<!-- TODO: add a screenshot of the command in Raycast -->

## License

No license file is present yet.
`;

const evidence = {
  repo: { name: "raycast-timezones", owner: "wassim" },
  languages: { TypeScript: 18400, CSS: 900 },
  tree: [
    "package.json",
    "tsconfig.json",
    "assets/icon.png",
    "src/index.tsx",
    "src/storage.ts",
    "src/types.ts",
  ],
  treeTruncated: false,
  manifests: [
    {
      file: "package.json",
      ecosystem: "npm",
      dependencies: [
        "@raycast/api",
        "react",
        "typescript",
        "@types/react",
        "eslint",
      ],
    },
  ],
  existingReadme: null,
  entrypoints: [
    {
      path: "src/index.tsx",
      text:
        'import { List, LocalStorage } from "@raycast/api";\n' +
        'import { useEffect, useState } from "react";\n\n' +
        "export default function Command() {\n" +
        "  const [people, setPeople] = useState<Person[]>([]);\n" +
        "  useEffect(() => { void load().then(setPeople); }, []);\n" +
        "  return (\n    <List>\n      {people.map((p) => (\n" +
        "        <List.Item key={p.id} title={p.name} accessories={[{ text: localTime(p.tz) }]} />\n" +
        "      ))}\n    </List>\n  );\n}\n",
    },
  ],
  commitMessages: [
    "add timezone picker to the add-person form",
    "persist people through LocalStorage",
    "initial commit",
  ],
  bytes: 14_820,
};

/** Everything the page needs, in the shape the browser store writes. */
export const fixtures = {
  inventory: { scannedAt, owner: "wassim", repos: full },
  audit: auditAccount("wassim", full, scannedAt),
  proposals: [{ ...proposalMeta, readme }],
  evidence: { "raycast-timezones": evidence },
};

// Running this file directly is a dry check that the fixtures still build.
if (import.meta.filename === process.argv[1]) {
  console.log(
    `fixtures ready: ${full.length} repos, ${fixtures.proposals.length} proposal(s).`,
    "\nRun `npm run qa:shoot` to load them into a browser and screenshot every screen.",
  );
}
