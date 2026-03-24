from fastapi import APIRouter, File, HTTPException, UploadFile

from app.services import import_screener_csv, import_screener_screenshot

router = APIRouter(prefix='/watchlist', tags=['watchlist'])


@router.post('/import-screener')
async def import_screener(file: UploadFile = File(...)) -> dict:
    if not file.filename.lower().endswith('.csv'):
        raise HTTPException(status_code=400, detail='Please upload a CSV file.')
    content = await file.read()
    items = import_screener_csv(content)
    return {'items': [item.model_dump() for item in items]}


@router.post('/import-screenshot')
async def import_screenshot(file: UploadFile = File(...)) -> dict:
    valid_extensions = ('.png', '.jpg', '.jpeg', '.webp')
    if not file.filename.lower().endswith(valid_extensions):
        raise HTTPException(status_code=400, detail='Please upload a PNG, JPG, JPEG, or WEBP image.')
    content = await file.read()
    items = import_screener_screenshot(content)
    return {'items': [item.model_dump() for item in items]}