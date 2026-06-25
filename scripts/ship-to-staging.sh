#!/usr/bin/env bash
#
# Ship the CURRENT branch to the `staging` environment: merge it into the
# `staging` git branch and push (Vercel branch-tracking redeploys staging.reglo.it).
#
#   pnpm ship:staging
#
# Guards: refuses if the working tree has uncommitted changes, if you're already
# on `staging`, or if the merge conflicts (leaving you on `staging` to resolve).
set -uo pipefail

CURRENT=$(git rev-parse --abbrev-ref HEAD)

if [ -n "$(git status --porcelain)" ]; then
  echo "❌ Ci sono modifiche non committate — committale o stashale prima di shippare su staging:"
  git status --short
  exit 1
fi

if [ "$CURRENT" = "staging" ]; then
  echo "❌ Sei già su 'staging'. Esegui questo comando dal branch feature da shippare."
  exit 1
fi

echo "→ Shippo '$CURRENT' su staging…"
git fetch origin --quiet || true

if ! git checkout staging 2>/dev/null; then
  git checkout -b staging origin/staging || { echo "❌ Branch 'staging' non trovato."; exit 1; }
fi
git pull --ff-only origin staging || true

if ! git merge --no-edit "$CURRENT"; then
  echo ""
  echo "❌ Conflitti nel merge di '$CURRENT' in 'staging'. Risolvili a mano (sei su 'staging'),"
  echo "   poi:  git add -A && git commit && git push origin staging && git checkout $CURRENT"
  exit 1
fi

git push origin staging
git checkout "$CURRENT"

echo ""
echo "✅ '$CURRENT' → staging pushato. Vercel sta deployando su https://staging.reglo.it"
echo "ℹ️  Se ci sono migrazioni DB nuove, ricordati:  pnpm migrate:staging"
