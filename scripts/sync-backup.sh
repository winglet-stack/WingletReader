#!/usr/bin/env bash
#
# sync-backup.sh — mirror the `origin` repo onto the `backup` remote.
#
# Makes the `backup` GitHub repo a faithful copy of `origin`:
#   * force-pushes every origin branch to backup (so nothing drifts)
#   * points backup's `main` at origin/master's tip, because GitHub refuses
#     to delete a repo's default branch over plain git (see README note)
#   * prunes any branch on backup that no longer exists on origin
#     (e.g. archive/* junk pushed by local tooling) — except `main`
#
# Remote URLs are read from `git remote`, so no credentials live in this file.
# Usage:
#   bash scripts/sync-backup.sh            # do it
#   bash scripts/sync-backup.sh --dry-run  # show what would change, push nothing
#
set -euo pipefail

ORIGIN_REMOTE="origin"
BACKUP_REMOTE="backup"
DEFAULT_BRANCH="main"   # backup's default branch; kept = origin/master
MIRROR_OF="master"      # origin branch that DEFAULT_BRANCH mirrors

DRY_RUN=0
[[ "${1:-}" == "--dry-run" ]] && DRY_RUN=1

run() {
  if [[ "$DRY_RUN" == "1" ]]; then
    echo "  DRY-RUN> git $*"
  else
    git "$@"
  fi
}

# --- preflight ---------------------------------------------------------------
git rev-parse --git-dir >/dev/null 2>&1 || { echo "Not in a git repo." >&2; exit 1; }
for r in "$ORIGIN_REMOTE" "$BACKUP_REMOTE"; do
  git remote get-url "$r" >/dev/null 2>&1 || { echo "Missing remote '$r'." >&2; exit 1; }
done

echo "Fetching $ORIGIN_REMOTE ..."
git fetch --quiet --prune "$ORIGIN_REMOTE"

# Origin branch short-names (skip the symbolic HEAD ref).
mapfile -t ORIGIN_BRANCHES < <(
  git for-each-ref --format='%(refname:strip=3)' "refs/remotes/$ORIGIN_REMOTE" \
    | grep -v '^HEAD$'
)
[[ ${#ORIGIN_BRANCHES[@]} -gt 0 ]] || { echo "No origin branches found." >&2; exit 1; }

# --- 1. force-sync every origin branch onto backup ---------------------------
echo "Syncing ${#ORIGIN_BRANCHES[@]} branch(es) -> $BACKUP_REMOTE ..."
SPECS=()
for b in "${ORIGIN_BRANCHES[@]}"; do
  SPECS+=("refs/remotes/$ORIGIN_REMOTE/$b:refs/heads/$b")
done
run push --force "$BACKUP_REMOTE" "${SPECS[@]}"

# --- 2. keep backup's default branch mirroring origin/master -----------------
if git show-ref --verify --quiet "refs/remotes/$ORIGIN_REMOTE/$MIRROR_OF"; then
  echo "Pointing $BACKUP_REMOTE/$DEFAULT_BRANCH -> $ORIGIN_REMOTE/$MIRROR_OF ..."
  run push --force "$BACKUP_REMOTE" \
    "refs/remotes/$ORIGIN_REMOTE/$MIRROR_OF:refs/heads/$DEFAULT_BRANCH"
fi

# --- 3. prune backup branches that no longer exist on origin -----------------
# Keep set = origin branches + the default branch.
declare -A KEEP=()
for b in "${ORIGIN_BRANCHES[@]}"; do KEEP["$b"]=1; done
KEEP["$DEFAULT_BRANCH"]=1

mapfile -t BACKUP_BRANCHES < <(
  git ls-remote --heads "$BACKUP_REMOTE" | sed 's#.*refs/heads/##'
)
STALE=()
for b in "${BACKUP_BRANCHES[@]}"; do
  [[ -n "${KEEP[$b]:-}" ]] || STALE+=("$b")
done

if [[ ${#STALE[@]} -gt 0 ]]; then
  echo "Pruning ${#STALE[@]} stale branch(es) from $BACKUP_REMOTE ..."
  run push "$BACKUP_REMOTE" --delete "${STALE[@]}"
else
  echo "No stale branches to prune."
fi

echo "Backup sync complete."
