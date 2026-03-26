# P Trade — Test Suite

## Structure

```
tests/
├── backend/
│   └── test_pts_backend.py   # pytest — 7 test classes, ~65 assertions
└── frontend/
    └── pts.test.ts            # Jest — 8 describe blocks, 45 assertions
```

## Running Tests

```bash
# From repo root — all tests
bash scripts/run-tests.sh

# Backend only
bash scripts/run-tests.sh backend

# Frontend only
bash scripts/run-tests.sh frontend

# Direct pytest (from repo root)
pytest tests/backend/test_pts_backend.py -v

# Direct Jest (from repo root)
npx jest tests/frontend/pts.test.ts
```

## Backend Tests (pytest)

Requires the backend virtualenv active or pytest installed globally.

| Class | What it covers |
|---|---|
| `TestPositionSizing` | Never risk >2% (green) or >1% (yellow) of capital |
| `TestRiskRewardValidation` | R:R gate — minimum 3:1 required |
| `TestTrailingStopLossZones` | SL zone 1-4 based on T1/T2 progress |
| `TestMarketRegimeLogic` | green/yellow/red from Nifty EMA alignment |
| `TestScreenerPreFilter` | CSV parsing, ticker extraction, score pre-filter |
| `TestClaudeResponseParsing` | AI response parsing and bucket assignment |
| `TestPnLCalculation` | PnL, win rate, open/closed counts |
| `TestRegressionGuard` | No mock/hardcoded data leaking into responses |

## Frontend Tests (Jest + ts-jest)

| Describe block | Bug covered |
|---|---|
| Score Display | Bug 2 — score out of 100, not 20 |
| Import vs Scoring Phase | Bug 3 — import and scoring are separate phases |
| Winner Detail | Bug 4 — detail panel shows correct fields |
| Market Regime | Bug 5 — never renders "UNSET" |
| No Mock / Hardcoded Data | Bug 1 — no placeholder data rendered |
| Trailing Stop Loss Zones | SL advances through zones correctly |
| Position Sizing | Size calculation matches regime rules |
| R:R Calculation | calcRR returns 0 for invalid inputs |
