#!/bin/bash
# Run once after cloning: bash scripts/install-hooks.sh

REPO_ROOT="$(git rev-parse --show-toplevel)"
cp "$REPO_ROOT/scripts/pre-commit" "$REPO_ROOT/.git/hooks/pre-commit"
chmod +x "$REPO_ROOT/.git/hooks/pre-commit"
echo "✓ Pre-commit hook installed"
echo "  Tests will now run before every commit."
echo "  To skip once: git commit --no-verify"
