"""
routes/study.py — Study session + methodology review endpoints.

Routes:
  POST /study/run                           — run a new study session
  POST /study/fetch-outcomes                — fetch forward returns for pending snapshots
  GET  /study/sessions                      — list distinct session summaries
  GET  /study/snapshots                     — list all study snapshots (optional ?session_id=)
  GET  /study/analytics                     — aggregate accuracy + correlation analytics
  POST /study/methodology-review            — trigger a Claude methodology review
  GET  /study/methodology-reviews           — list all methodology reviews
  PATCH /study/methodology-reviews/{id}/changes/{cid} — update a change's status
"""

import json
from typing import List, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

router = APIRouter(prefix='/study', tags=['study'])


# ---------------------------------------------------------------------------
# Request / response models
# ---------------------------------------------------------------------------

class StudyRunRequest(BaseModel):
    tickers: List[str]
    session_id: Optional[str] = None
    study_date: Optional[str] = None


class ChangeStatusPatch(BaseModel):
    status: str  # 'accepted' | 'rejected' | 'proposed'


# ---------------------------------------------------------------------------
# Helpers — deserialise JSON columns in snapshot rows
# ---------------------------------------------------------------------------

def _deserialise_snapshot(row: dict) -> dict:
    for field in ('gates', 'hvs_breakdown', 'score_breakdown', 'metrics', 'reasons', 'blockers'):
        val = row.get(field)
        if isinstance(val, str):
            try:
                row[field] = json.loads(val)
            except Exception:
                pass
    return row


def _deserialise_review(row: dict) -> dict:
    for field in ('proposed_changes', 'analytics_snapshot'):
        val = row.get(field)
        if isinstance(val, str):
            try:
                row[field] = json.loads(val)
            except Exception:
                pass
    return row


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.post('/run')
def run_study_session(body: StudyRunRequest):
    """Score a list of tickers and persist as a study session."""
    from app.study_service import run_study_session as _run
    if not body.tickers:
        raise HTTPException(status_code=400, detail='tickers list is required and must not be empty')
    return _run(
        tickers=body.tickers,
        session_id=body.session_id,
        study_date=body.study_date,
    )


@router.post('/fetch-outcomes')
def fetch_outcomes():
    """Fetch forward-return prices for all eligible pending snapshots."""
    from app.study_service import fetch_pending_outcomes
    return fetch_pending_outcomes()


@router.get('/sessions')
def get_sessions():
    """Return distinct study session summaries."""
    from app.study_service import get_study_sessions_summary
    return {'sessions': get_study_sessions_summary()}


@router.get('/snapshots')
def get_snapshots(session_id: Optional[str] = Query(default=None)):
    """Return study snapshots, optionally filtered by session_id."""
    from app.database import db_load_study_snapshots
    rows = db_load_study_snapshots(session_id=session_id)
    return {'snapshots': [_deserialise_snapshot(r) for r in rows]}


@router.get('/analytics')
def get_analytics():
    """Return aggregate analytics over all study snapshots with outcomes."""
    from app.study_service import compute_study_analytics
    return compute_study_analytics()


@router.post('/methodology-review')
def run_methodology_review(min_outcomes: int = Query(default=30)):
    """Trigger a Claude-powered methodology review."""
    from app.methodology_agent import review_methodology
    result = review_methodology(min_outcomes=min_outcomes)
    if not result.get('ok') and result.get('total_outcomes', 0) < min_outcomes:
        raise HTTPException(status_code=422, detail=result['reason'])
    return result


@router.get('/methodology-reviews')
def list_methodology_reviews():
    """Return all methodology reviews newest-first."""
    from app.database import db_load_methodology_reviews
    rows = db_load_methodology_reviews()
    return {'reviews': [_deserialise_review(r) for r in rows]}


@router.patch('/methodology-reviews/{review_id}/changes/{change_id}')
def update_change_status(review_id: str, change_id: str, body: ChangeStatusPatch):
    """Update a proposed change's status (accepted / rejected / proposed)."""
    allowed = {'accepted', 'rejected', 'proposed'}
    if body.status not in allowed:
        raise HTTPException(status_code=400, detail=f'status must be one of {allowed}')
    from app.database import db_update_change_status
    db_update_change_status(review_id, change_id, body.status)
    return {'ok': True, 'review_id': review_id, 'change_id': change_id, 'status': body.status}
