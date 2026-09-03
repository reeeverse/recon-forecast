"""AI Agent routes: image analysis + chat (Groq)."""

from __future__ import annotations

import base64
import csv
import io
import json
import logging

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from groq import Groq
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from backend.app.auth import get_current_user
from backend.app.db import get_db
from backend.app.settings import settings

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/ai", tags=["ai"])

VISION_MODEL = "qwen/qwen3.8-27b"
CHAT_MODEL   = "groq/compound"

ANALYZE_PROMPT = """You are a bank statement parser. Extract all transactions from the image.
Return ONLY a JSON array (no markdown, no explanation) with this exact shape:
[{"date":"YYYY-MM-DD","description":"...","amount_paise":12345,"direction":"credit|debit","reference":"..."}]
- amount_paise is the amount in Indian paise (₹1 = 100 paise), always positive integer
- direction is "credit" for money in, "debit" for money out
- reference can be empty string if not visible"""

CHAT_SYSTEM = """You are a financial analyst AI assistant for a bank reconciliation and liquidity forecasting platform.
You help finance ops teams understand their reconciliation results, spot anomalies, and interpret cash forecasts.
Be concise, factual, and specific. When asked about numbers, use the context provided.
Format currency as ₹X,XX,XXX (Indian numbering). Amounts are stored as paise (divide by 100 for rupees)."""


def _client() -> Groq:
    if not settings.groq_api_key:
        raise HTTPException(status_code=503, detail="AI agent not configured — set GROQ_API_KEY")
    return Groq(api_key=settings.groq_api_key)


# ── POST /ai/analyze ──────────────────────────────────────────────────────────

@router.post("/analyze")
async def analyze_image(
    file: UploadFile = File(...),
    user: dict = Depends(get_current_user),
):
    """Upload a bank statement image → extract transactions as JSON + CSV."""
    allowed = {"image/jpeg", "image/png", "image/webp", "image/gif"}
    if file.content_type not in allowed:
        raise HTTPException(status_code=422, detail=f"Unsupported file type: {file.content_type}")

    content = await file.read()
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Image too large (max 10MB)")

    b64 = base64.standard_b64encode(content).decode()
    client = _client()

    try:
        response = client.chat.completions.create(
            model=VISION_MODEL,
            messages=[{
                "role": "user",
                "content": [
                    {"type": "image_url", "image_url": {"url": f"data:{file.content_type};base64,{b64}"}},
                    {"type": "text", "text": ANALYZE_PROMPT},
                ],
            }],
            max_tokens=4096,
        )
        raw = response.choices[0].message.content.strip()

        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]

        transactions = json.loads(raw)
    except json.JSONDecodeError:
        raise HTTPException(status_code=422, detail="Could not parse transactions from image")
    except Exception as e:
        logger.error("Groq API error: %s", e)
        raise HTTPException(status_code=502, detail=f"AI service error: {e}")

    out = io.StringIO()
    writer = csv.DictWriter(
        out,
        fieldnames=["date", "description", "amount_paise", "direction", "reference"],
    )
    writer.writeheader()
    for t in transactions:
        writer.writerow({
            "date": t.get("date", ""),
            "description": t.get("description", ""),
            "amount_paise": t.get("amount_paise", 0),
            "direction": t.get("direction", ""),
            "reference": t.get("reference", ""),
        })

    return {"transactions": transactions, "count": len(transactions), "csv": out.getvalue()}


# ── POST /ai/chat ─────────────────────────────────────────────────────────────

class ChatRequest(BaseModel):
    message: str
    account_id: str | None = None


@router.post("/chat")
def chat(
    body: ChatRequest,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Chat with AI about reconciliation data. Returns streaming SSE response."""
    client = _client()

    context_parts = []
    if body.account_id:
        try:
            acct = db.execute(
                text("SELECT name, min_threshold_paise FROM accounts WHERE id = :id"),
                {"id": body.account_id},
            ).fetchone()
            if acct:
                context_parts.append(f"Account: {acct.name} (ID: {body.account_id})")
                context_parts.append(f"Min threshold: ₹{acct.min_threshold_paise // 100:,}")

            batch = db.execute(
                text("""
                    SELECT id, status FROM import_batches
                    WHERE account_id = :aid ORDER BY created_at DESC LIMIT 1
                """),
                {"aid": body.account_id},
            ).fetchone()
            if batch:
                counts = db.execute(
                    text("""
                        SELECT
                            COUNT(*) FILTER (WHERE match_type='auto_matched') AS auto,
                            COUNT(*) FILTER (WHERE match_type='review') AS review,
                            COUNT(*) FILTER (WHERE match_type='unmatched_bank') AS unmatched_bank,
                            COUNT(*) FILTER (WHERE match_type='unmatched_ledger') AS unmatched_ledger,
                            AVG(confidence) FILTER (WHERE match_type IN ('auto_matched','review')) AS avg_conf
                        FROM reconciliation_results WHERE batch_id = :bid
                    """),
                    {"bid": batch.id},
                ).fetchone()
                context_parts.append(
                    f"Latest batch (ID {batch.id}, status: {batch.status}): "
                    f"auto_matched={counts.auto}, review={counts.review}, "
                    f"unmatched_bank={counts.unmatched_bank}, "
                    f"unmatched_ledger={counts.unmatched_ledger}, "
                    f"avg_confidence={float(counts.avg_conf or 0):.1f}%"
                )

            alerts = db.execute(
                text("""
                    SELECT severity, breach_date, shortfall_paise
                    FROM alerts WHERE account_id = :aid AND status = 'active'
                    ORDER BY created_at DESC LIMIT 3
                """),
                {"aid": body.account_id},
            ).fetchall()
            if alerts:
                for a in alerts:
                    context_parts.append(
                        f"ACTIVE ALERT: {a.severity} severity, breach {a.breach_date}, "
                        f"shortfall ₹{(a.shortfall_paise or 0) // 100:,}"
                    )
            else:
                context_parts.append("No active liquidity alerts.")
        except Exception as e:
            logger.warning("Context fetch failed: %s", e)

    context = "\n".join(context_parts)
    system = CHAT_SYSTEM + (f"\n\nCurrent context:\n{context}" if context else "")

    def _stream():
        try:
            stream = client.chat.completions.create(
                model=CHAT_MODEL,
                messages=[
                    {"role": "system", "content": system},
                    {"role": "user", "content": body.message},
                ],
                max_tokens=1024,
                stream=True,
            )
            for chunk in stream:
                text_chunk = chunk.choices[0].delta.content or ""
                if text_chunk:
                    yield f"data: {json.dumps({'text': text_chunk})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'text': f'Error: {e}'})}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(_stream(), media_type="text/event-stream")
