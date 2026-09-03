import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.app.routes import forecasting, reconciliation, upload
from backend.app.routes.ai_agent import router as ai_router
from backend.app.routes.auth import router as auth_router
from backend.app.routes.connections import router as connections_router
from backend.app.routes.settings import router as settings_router

logging.basicConfig(level=logging.INFO)

app = FastAPI(title="recon-forecast", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(reconciliation.router)
app.include_router(forecasting.router)
app.include_router(upload.router)
app.include_router(auth_router)
app.include_router(ai_router)
app.include_router(connections_router)
app.include_router(settings_router)
