import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.app.routes import forecasting, reconciliation, upload

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
