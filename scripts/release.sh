#!/usr/bin/env bash
#
# Cut a release.
#
#   npm run release 1.0.2-beta
#
# Tagging is the whole release procedure (see .github/workflows/release.yml),
# which makes the tag a promise: it says the code at that commit declares this
# version and the changelog explains it. Hand-tagging breaks that promise
# quietly — the tag lands, the gate fails, and the version is burned. This
# script makes the promise true before the tag exists: it checks everything the
# workflow will check, bumps the manifests, and only then tags.

set -euo pipefail

die() {
  echo "error: $*" >&2
  exit 1
}

VERSION="${1:-}"
[ -n "$VERSION" ] || die "usage: npm run release <version>   (e.g. 1.0.2-beta, without the v)"

case "$VERSION" in
  v*) die "pass the version without the leading v — the tag gets one, the manifests do not." ;;
esac

# Matches what the workflow triggers on (v*.*.*) plus an optional pre-release
# suffix, so a version accepted here always produces a tag that starts a release.
if ! printf '%s' "$VERSION" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.]+)?$'; then
  die "'$VERSION' is not a version this repository can release: expected X.Y.Z or X.Y.Z-suffix."
fi

TAG="v$VERSION"
ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

# ─── Preconditions ──────────────────────────────────────────────────────────
# Each of these is cheaper to fail here than after a tag is pushed, because a
# pushed tag cannot be reused: fixing it means deleting a tag other people may
# already have fetched.

BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [ "$BRANCH" != "master" ] && [ "${RELEASE_ALLOW_BRANCH:-0}" != "1" ]; then
  die "releases are cut from master, not $BRANCH. Set RELEASE_ALLOW_BRANCH=1 to override."
fi

[ -z "$(git status --porcelain)" ] ||
  die "working tree is dirty. Commit or stash first — the release commit must contain only the version bump."

git fetch --quiet origin "$BRANCH" --tags

if git rev-parse -q --verify "refs/tags/$TAG" >/dev/null ||
   git ls-remote --exit-code --tags origin "refs/tags/$TAG" >/dev/null 2>&1; then
  die "$TAG already exists. Releasing over it would publish images that contradict the tag; pick the next version."
fi

if [ -n "$(git rev-list "HEAD..origin/$BRANCH" 2>/dev/null)" ]; then
  die "$BRANCH is behind origin/$BRANCH. Pull first, so the tag names a commit others have."
fi

# The workflow reads release notes out of the changelog in its *last* job —
# after both images are published. A missing entry there leaves published
# images with no Release, so the same check runs first here.
NOTES=$(awk -v want="## [$VERSION]" '
  index($0, want) == 1 { flag = 1; next }
  /^## \[/            { flag = 0 }
  flag                { print }
' CHANGELOG.md)

if [ -z "$(printf '%s' "$NOTES" | tr -d '[:space:]')" ]; then
  die "CHANGELOG.md has no '## [$VERSION]' section with content. Write the release notes first — they are the Release body."
fi

# ─── Bump ───────────────────────────────────────────────────────────────────
# The published images report the root version, and the gate compares it to the
# tag. client and server are bumped alongside it so a checkout of the tag has no
# manifest disagreeing about what it is. shared carries its own version and is
# deliberately left alone.
#
# From here the working tree is modified, so anything that goes wrong has to put
# it back: a half-bumped checkout is worse than no bump at all. The trap is
# cleared once the commit exists.
trap 'git checkout -- .' EXIT

npm version "$VERSION" \
  --workspace client \
  --workspace server \
  --include-workspace-root \
  --no-git-tag-version \
  --allow-same-version >/dev/null

# npm version rewrites the manifests; the lockfile records those versions too.
npm install --package-lock-only --silent

echo
echo "About to release $TAG:"
git --no-pager diff --stat
echo
printf 'Commit, tag and push to origin/%s? [y/N] ' "$BRANCH"
# Read the answer from the terminal so the prompt survives being run through a
# pipeline, falling back to stdin where there is no terminal to open. A prompt
# nobody can answer counts as "no".
{ exec 3</dev/tty; } 2>/dev/null || exec 3<&0
read -r REPLY <&3 || REPLY=n
case "$REPLY" in
  [yY]*) ;;
  *) die "aborted; version bump reverted." ;;
esac

# ─── Publish ────────────────────────────────────────────────────────────────

git add -A
git commit --quiet -m "chore(release): $VERSION"
trap - EXIT
git tag -a "$TAG" -m "$TAG"

# The commit goes first: a tag whose commit is not on the branch is a release
# nobody can find by reading history.
git push origin "$BRANCH"
git push origin "$TAG"

echo
echo "Pushed $TAG. The release workflow is now running:"
echo "  https://github.com/t-dhruv/Kuber/actions/workflows/release.yml"
