import { execSync } from "child_process";
import { existsSync } from "fs";

const WORKTREE_BASE = "/tmp";

function worktreePath(shortId: string): string {
  return `${WORKTREE_BASE}/mc-${shortId}`;
}

function branchName(shortId: string): string {
  return `mc/${shortId}`;
}

/**
 * Create a git worktree for an agent to work in isolation.
 * Returns the worktree path on success, null on failure (caller falls back to project dir).
 */
export function createWorktree(
  projectPath: string,
  shortId: string,
): string | null {
  const wtPath = worktreePath(shortId);
  const branch = branchName(shortId);

  try {
    // Clean up stale worktree/branch if they exist from a previous run
    if (existsSync(wtPath)) {
      try {
        execSync(`git -C '${projectPath}' worktree remove --force '${wtPath}'`, {
          timeout: 10_000,
          stdio: "pipe",
        });
      } catch {
        execSync(`rm -rf '${wtPath}'`, { timeout: 5_000, stdio: "pipe" });
        execSync(`git -C '${projectPath}' worktree prune`, {
          timeout: 5_000,
          stdio: "pipe",
        });
      }
    }

    // Delete stale branch if it exists
    try {
      execSync(`git -C '${projectPath}' branch -D '${branch}'`, {
        timeout: 5_000,
        stdio: "pipe",
      });
    } catch {
      // Branch didn't exist — fine
    }

    // Create new worktree with a new branch off HEAD
    execSync(
      `git -C '${projectPath}' worktree add -b '${branch}' '${wtPath}'`,
      { timeout: 15_000, stdio: "pipe" },
    );

    console.log(
      `[git-worktree] created worktree at ${wtPath} (branch ${branch})`,
    );
    return wtPath;
  } catch (err) {
    console.error(`[git-worktree] failed to create worktree for ${shortId}:`, err);
    return null;
  }
}

/**
 * Remove a worktree and its branch. Best-effort, never throws.
 */
export function removeWorktree(
  projectPath: string,
  shortId: string,
): void {
  const wtPath = worktreePath(shortId);
  const branch = branchName(shortId);

  try {
    execSync(`git -C '${projectPath}' worktree remove --force '${wtPath}'`, {
      timeout: 10_000,
      stdio: "pipe",
    });
  } catch {
    // Fallback: rm + prune
    try {
      execSync(`rm -rf '${wtPath}'`, { timeout: 5_000, stdio: "pipe" });
      execSync(`git -C '${projectPath}' worktree prune`, {
        timeout: 5_000,
        stdio: "pipe",
      });
    } catch (e) {
      console.error(`[git-worktree] cleanup failed for ${shortId}:`, e);
    }
  }

  // Delete the branch
  try {
    execSync(`git -C '${projectPath}' branch -D '${branch}'`, {
      timeout: 5_000,
      stdio: "pipe",
    });
  } catch {
    // Branch already gone or never created
  }
}

/**
 * Merge the agent's branch into the main branch. Does NOT remove the worktree —
 * the agent session may still be alive and using it. Cleanup happens later (done/delete/abort).
 * On conflict: aborts merge, leaves branch for manual resolution.
 */
export function mergeBranch(
  projectPath: string,
  shortId: string,
): { merged: boolean; conflictMsg?: string } {
  const branch = branchName(shortId);

  try {
    // Get the main branch name
    const mainBranch = execSync(
      `git -C '${projectPath}' symbolic-ref --short HEAD`,
      { timeout: 5_000, stdio: "pipe" },
    )
      .toString()
      .trim();

    // Attempt merge
    execSync(`git -C '${projectPath}' merge '${branch}' --no-edit`, {
      timeout: 30_000,
      stdio: "pipe",
    });

    console.log(
      `[git-worktree] merged ${branch} into ${mainBranch} successfully`,
    );

    return { merged: true };
  } catch (err) {
    // Merge failed — likely conflict
    console.error(`[git-worktree] merge failed for ${branch}:`, err);

    // Abort the merge
    try {
      execSync(`git -C '${projectPath}' merge --abort`, {
        timeout: 5_000,
        stdio: "pipe",
      });
    } catch {
      // merge --abort can fail if no merge in progress
    }

    return {
      merged: false,
      conflictMsg: `⚠️ Branch ${branch} has merge conflicts. Resolve: \`git merge ${branch}\``,
    };
  }
}

/**
 * Check if a worktree exists for the given shortId.
 */
export function worktreeExists(shortId: string): boolean {
  return existsSync(worktreePath(shortId));
}
