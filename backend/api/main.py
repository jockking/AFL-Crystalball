"""
FastAPI backend — proxies Squiggle API data with aggregation.
Run with: uvicorn api.main:app --reload --port 8000
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.routers import games, tips, standings, form, sources

app = FastAPI(title="AFL Squiggle Predictor API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_methods=["GET"],
    allow_headers=["*"],
)

app.include_router(games.router,     prefix="/api/games",     tags=["games"])
app.include_router(tips.router,      prefix="/api/tips",      tags=["tips"])
app.include_router(standings.router, prefix="/api/standings", tags=["standings"])
app.include_router(form.router,      prefix="/api/form",      tags=["form"])
app.include_router(sources.router,   prefix="/api/sources",   tags=["sources"])


@app.get("/api/health")
def health():
    return {"status": "ok"}
