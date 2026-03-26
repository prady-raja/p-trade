from fastapi import APIRouter, File, HTTPException, UploadFile

from app.import_service import import_screener_csv, import_screener_screenshot

router = APIRouter(prefix='/watchlist', tags=['watchlist'])


@router.post('/import-screener')
async def import_screener(file: UploadFile = File(...)) -> dict:
    if not file.filename.lower().endswith('.csv'):
        raise HTTPException(status_code=400, detail='Please upload a CSV file.')
    content = await file.read()
    try:
        items = import_screener_csv(content)
        return {'items': [item.model_dump() for item in items]}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f'CSV import failed: {exc}')


@router.post('/import-screenshot')
async def import_screenshot(file: UploadFile = File(...)) -> dict:
    # FIX: Bug 1 — Add explicit error handling so AI failures return proper errors, never silent fallbacks
    valid_extensions = ('.png', '.jpg', '.jpeg', '.webp')
    if not file.filename.lower().endswith(valid_extensions):
        raise HTTPException(status_code=400, detail='Please upload a PNG, JPG, JPEG, or WEBP image.')
    content = await file.read()
    if len(content) == 0:
        raise HTTPException(status_code=400, detail='Uploaded file is empty.')
    try:
        items = import_screener_screenshot(content)
        return {'items': [item.model_dump() for item in items]}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f'Screenshot import failed: {exc}')
