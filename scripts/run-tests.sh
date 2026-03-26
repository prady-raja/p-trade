#!/bin/bash
# scripts/run-tests.sh
# Run the full test suite manually at any time.
# Usage: bash scripts/run-tests.sh
#        bash scripts/run-tests.sh backend
#        bash scripts/run-tests.sh frontend

REPO_ROOT="$(git rev-parse --show-toplevel)"
MODE=${1:-"all"}

if [ "$MODE" = "backend" ] || [ "$MODE" = "all" ]; then
  echo "Running backend tests..."
  cd "$REPO_ROOT"
  python3 -m pytest tests/backend/test_pts_backend.py -v --tb=short
fi

if [ "$MODE" = "frontend" ] || [ "$MODE" = "all" ]; then
  echo "Running frontend tests..."
  cd "$REPO_ROOT/frontend"
  npx jest --testPathPattern="pts.test.ts" --verbose
fi
