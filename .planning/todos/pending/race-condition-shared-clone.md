# Race condition on shared git clone with per-app tokens

**Area:** backend
**Priority:** medium
**Created:** 2026-02-16

## Problem

When multiple apps watch the same private repository, each snapshot job calls `cloneOrPull` on the same local path (`/data/repos/{owner}/{repo}`) with a different GitHub token. With `concurrency=5`, two jobs can run in parallel on the same repo, causing one to overwrite the git remote URL (`git remote set-url`) while the other is mid-pull.

## Impact

- Potential auth failures if token A is set while job B is pulling
- Non-deterministic behavior depending on job timing
- Currently masked because most repos are public or apps share the same token

## Possible Solutions

1. **Repo-level lock** — acquire a mutex per repo path so only one git operation runs at a time; other jobs for the same repo wait
2. **Decouple git sync from notification** — single git-sync job per repo, then fan out per-app notification jobs using the shared scan result
3. **Clone per app-repo pair** — use `/data/repos/{app_id}/{owner}/{repo}` to isolate clones (trades disk space for safety)

Option 2 is the cleanest: it avoids redundant pulls entirely and makes the architecture match the intent (one clone, many consumers).

## Related Files

- `src/workers/snapshot.worker.ts` — processSnapshotJob (lines 130-364)
- `src/services/git.ts` — cloneOrPull, getLocalRepoPath
- `src/workers/snapshot.scheduler.ts` — scanAndQueuePending creates one job per app-repo pair
