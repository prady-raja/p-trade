# P Trade

A personal trading assistant backed by Kite Connect and Claude AI.

## Setup

### Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

## Running Tests

```bash
# Run all tests manually
bash scripts/run-tests.sh

# Run backend only
bash scripts/run-tests.sh backend

# Run frontend only
bash scripts/run-tests.sh frontend
```

## After Cloning

Run this once to install the pre-commit hook:

```bash
bash scripts/install-hooks.sh
```

The hook automatically runs the full PTS test suite before every commit.
If any test fails, the commit is blocked until you fix it.
To skip in an emergency: `git commit --no-verify`
# test
