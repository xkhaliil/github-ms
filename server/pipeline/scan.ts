import { auditAccount } from "../analyze/hygiene.js";
import {
  applyScanFilters,
  deriveFileFacts,
  getTree,
  listOwnedRepos,
  scanOptionsFrom,
} from "../github/repos.js";
import { getGithubIdentity } from "../session.js";
import { readSettings, writeAudit, writeInventory, type Inventory } from "../store/index.js";
import type { Job } from "../jobs/queue.js";
import type { AccountAudit } from "../../shared/types.js";

export interface ScanResult {
  inventory: Inventory;
  audit: AccountAudit;
}

/**
 * One tree call per repo fills in the file facts the audit needs. It is the
 * slowest part of a scan, so it reports per-repo progress rather than leaving the
 * UI on a spinner for a minute.
 */
export async function runScan(job: Job): Promise<ScanResult> {
  const settings = await readSettings();
  const all = await listOwnedRepos();
  const repos = applyScanFilters(all, scanOptionsFrom(settings));

  job.setSteps(repos.map((r) => r.name));

  for (const repo of repos) {
    job.checkCancelled();
    job.startStep(repo.name);
    if (repo.isEmpty) {
      repo.files = {
        hasReadme: false,
        hasLicenseFile: false,
        hasGitignore: false,
        hasCi: false,
        deployHints: [],
        incomplete: true,
      };
      job.finishStep(repo.name, "done", "empty repository");
      continue;
    }
    const tree = await getTree(repo.owner, repo.name, repo.defaultBranch);
    repo.files = deriveFileFacts(tree);
    job.finishStep(
      repo.name,
      "done",
      tree.ok ? `${tree.paths.length} files` : "could not read file tree",
    );
  }

  const scannedAt = new Date().toISOString();
  const owner = getGithubIdentity()?.login ?? repos[0]?.owner ?? "unknown";

  const inventory: Inventory = { scannedAt, owner, repos };
  const audit = auditAccount(owner, repos, scannedAt);

  await writeInventory(inventory);
  await writeAudit(audit);

  return { inventory, audit };
}
