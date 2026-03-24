# P Trade FastAPI Backend Starter

## Local run

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

## Render start command

```bash
uvicorn app.main:app --host 0.0.0.0 --port $PORT
```
