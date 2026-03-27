"""
snapshot_service.py — immutable decision snapshot capture.

Write-only. Snapshots are never updated except to link a trade_id after logging.
All write functions are silent — they never surface errors to callers.

Public API:
  write_review_snapshot(result, analysis_date, ai_available, ai_bucket,
                        ai_explanation, ai_cautions) -> str
  write_scan_snapshot(result, scan_run_id, analysis_date, ai_available,
                      ai_bucket, ai_explanation, ai_cautions) -> Optional[str]
  write_trade_logged_snapshot(payload, trade_id) -> Optional[str]
  link_trade_to_snapshot(snapshot_id, trade_id) -> None
"""

import json
import uuid
from datetime import datetime, timezone
from typing import List, Optional


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _today_str() -> str:
    return datetime.now(timezone.utc).strftime('%Y-%m-%d')


def _safe_json(v) -> Optional[str]:
    if v is None:
        return None
    try:
        return json.dumps(v)
    except Exception:
        return None


def write_review_snapshot(
    result: 'TradeReviewResult',
    analysis_date: Optional[str] = None,
    ai_available: bool = False,
    ai_bucket: Optional[str] = None,
    ai_explanation: Optional[str] = None,
    ai_cautions: Optional[List[str]] = None,
) -> str:
    """Build and persist a snapshot from a TradeReviewResult. Returns UUID."""
    snapshot_id = str(uuid.uuid4())
    try:
        from .database import db_insert_snapshot
        from .market_service import store
        from .version import METHODOLOGY_VERSION, SCORING_ENGINE_VERSION

        regime = store.market.regime if store.market.regime != 'unset' else None

        sb = result.score_breakdown
        hvs_bd = result.hvs_breakdown
        opt_bd = result.opt_breakdown

        snapshot = {
            'id':                     snapshot_id,
            'ticker':                 result.symbol,
            'event_type':             'review',
            'analysis_timestamp':     _now_iso(),
            'analysis_date':          analysis_date or _today_str(),
            'market_regime':          regime,
            'price':                  result.price,
            'raw_metrics':            _safe_json(result.metrics),
            'score_breakdown':        _safe_json(sb.model_dump() if sb else None),
            'hvs_score':              result.hvs_score,
            'hvs_breakdown':          _safe_json(hvs_bd.model_dump() if hvs_bd else None),
            'opt_score':              result.opt_score,
            'opt_breakdown':          _safe_json(opt_bd.model_dump() if opt_bd else None),
            'gates':                  _safe_json([g.model_dump() for g in result.gates]),
            'hard_blockers':          _safe_json(result.hard_blockers),
            'verdict':                result.verdict,
            'tradeable':              1 if result.tradeable else 0,
            'reasons':                _safe_json(result.reasons),
            'blockers':               _safe_json(result.blockers),
            'trigger_price':          result.trigger_price,
            'stop_loss':              result.stop_loss,
            'target_1':               result.target_1,
            'target_2':               result.target_2,
            'risk_reward':            result.risk_reward,
            'weekly_note':            result.weekly_note,
            'invalidation_rule':      result.invalidation_rule,
            'ai_available':           1 if ai_available else 0,
            'ai_bucket':              ai_bucket,
            'ai_explanation':         ai_explanation,
            'ai_cautions':            _safe_json(ai_cautions),
            'methodology_version':    METHODOLOGY_VERSION,
            'scoring_engine_version': SCORING_ENGINE_VERSION,
            'trade_id':               None,
            'scan_run_id':            None,
            'created_at':             _now_iso(),
        }
        db_insert_snapshot(snapshot)
    except Exception:
        pass  # never surfaces to caller
    return snapshot_id


def write_scan_snapshot(
    result: 'ScannerResultItem',
    scan_run_id: str,
    analysis_date: Optional[str] = None,
    ai_available: bool = False,
    ai_bucket: Optional[str] = None,
    ai_explanation: Optional[str] = None,
    ai_cautions: Optional[List[str]] = None,
) -> Optional[str]:
    """Build and persist a snapshot from a ScannerResultItem. Returns UUID or None."""
    snapshot_id = str(uuid.uuid4())
    try:
        from .database import db_insert_snapshot
        from .market_service import store
        from .version import METHODOLOGY_VERSION, SCORING_ENGINE_VERSION

        regime = store.market.regime if store.market.regime != 'unset' else None
        sb = result.score_breakdown

        snapshot = {
            'id':                     snapshot_id,
            'ticker':                 result.ticker,
            'event_type':             'scan',
            'analysis_timestamp':     _now_iso(),
            'analysis_date':          analysis_date or _today_str(),
            'market_regime':          regime,
            'price':                  result.price,
            'raw_metrics':            _safe_json(result.metrics),
            'score_breakdown':        _safe_json(sb.model_dump() if sb else None),
            'hvs_score':              result.hvs_score,
            'hvs_breakdown':          None,
            'opt_score':              None,
            'opt_breakdown':          None,
            'gates':                  _safe_json([g.model_dump() for g in result.gates]),
            'hard_blockers':          _safe_json(result.hard_blockers),
            'verdict':                result.verdict,
            'tradeable':              1 if result.tradeable else 0,
            'reasons':                _safe_json(result.reasons),
            'blockers':               _safe_json(result.blockers),
            'trigger_price':          None,
            'stop_loss':              None,
            'target_1':               None,
            'target_2':               None,
            'risk_reward':            None,
            'weekly_note':            None,
            'invalidation_rule':      None,
            'ai_available':           1 if ai_available else 0,
            'ai_bucket':              ai_bucket,
            'ai_explanation':         ai_explanation,
            'ai_cautions':            _safe_json(ai_cautions),
            'methodology_version':    METHODOLOGY_VERSION,
            'scoring_engine_version': SCORING_ENGINE_VERSION,
            'trade_id':               None,
            'scan_run_id':            scan_run_id,
            'created_at':             _now_iso(),
        }
        db_insert_snapshot(snapshot)
    except Exception:
        return None
    return snapshot_id


def write_trade_logged_snapshot(payload: 'TradeCreateRequest', trade_id: str) -> Optional[str]:
    """Fallback snapshot when a trade is logged without a prior review snapshot."""
    snapshot_id = str(uuid.uuid4())
    try:
        from .database import db_insert_snapshot
        from .market_service import store
        from .version import METHODOLOGY_VERSION, SCORING_ENGINE_VERSION

        regime = store.market.regime if store.market.regime != 'unset' else None

        entry_f: Optional[float] = None
        sl_f: Optional[float] = None
        try:
            if payload.entry:
                entry_f = float(payload.entry)
            if payload.stop_loss:
                sl_f = float(payload.stop_loss)
        except Exception:
            pass

        snapshot = {
            'id':                     snapshot_id,
            'ticker':                 payload.ticker.upper().strip(),
            'event_type':             'trade_logged',
            'analysis_timestamp':     _now_iso(),
            'analysis_date':          _today_str(),
            'market_regime':          regime,
            'price':                  entry_f,
            'raw_metrics':            None,
            'score_breakdown':        None,
            'hvs_score':              payload.hvs_score,
            'hvs_breakdown':          None,
            'opt_score':              payload.opt_score,
            'opt_breakdown':          None,
            'gates':                  _safe_json(None),
            'hard_blockers':          _safe_json(None),
            'verdict':                payload.verdict,
            'tradeable':              1,
            'reasons':                _safe_json(None),
            'blockers':               _safe_json(None),
            'trigger_price':          entry_f,
            'stop_loss':              sl_f,
            'target_1':               None,
            'target_2':               None,
            'risk_reward':            None,
            'weekly_note':            None,
            'invalidation_rule':      None,
            'ai_available':           0,
            'ai_bucket':              None,
            'ai_explanation':         None,
            'ai_cautions':            None,
            'methodology_version':    METHODOLOGY_VERSION,
            'scoring_engine_version': SCORING_ENGINE_VERSION,
            'trade_id':               trade_id,
            'scan_run_id':            None,
            'created_at':             _now_iso(),
        }
        db_insert_snapshot(snapshot)
    except Exception:
        return None
    return snapshot_id


def link_trade_to_snapshot(snapshot_id: str, trade_id: str) -> None:
    """Set trade_id on an existing snapshot row. Never raises."""
    try:
        from .database import db_link_trade_to_snapshot
        db_link_trade_to_snapshot(snapshot_id, trade_id)
    except Exception:
        pass
