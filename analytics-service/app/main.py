import os
from datetime import datetime, timezone
from functools import lru_cache

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException
from pydantic import BaseModel
from pymongo import MongoClient
from pymongo.database import Database
from pymongo.errors import PyMongoError

load_dotenv()

app = FastAPI(title="EventFlow Analytics", version="1.0.0")


class HealthResponse(BaseModel):
    status: str


class EventStats(BaseModel):
    totalEvents: int
    totalRegistrations: int
    upcomingEvents: int


@lru_cache
def _client() -> MongoClient:
    uri = os.getenv("MONGODB_URI")
    if not uri:
        raise RuntimeError("MONGODB_URI is not set. Copy .env.example to .env.")
    return MongoClient(uri, serverSelectionTimeoutMS=3000)


def get_db() -> Database:
    """Dependency returning the EventFlow database (overridden in tests)."""
    # The database name comes from the connection string (e.g. .../eventflow)
    try:
        return _client().get_default_database()
    except (RuntimeError, PyMongoError) as exc:
        # Missing MONGODB_URI, or a URI without a database name
        raise HTTPException(status_code=503, detail="Database not configured") from exc


@app.get("/health", response_model=HealthResponse)
def health(db: Database = Depends(get_db)) -> HealthResponse:
    try:
        db.command("ping")
    except PyMongoError as exc:
        raise HTTPException(status_code=503, detail="Database unavailable") from exc
    return HealthResponse(status="ok")


@app.get("/analytics/events", response_model=EventStats)
def event_stats(db: Database = Depends(get_db)) -> EventStats:
    """Read-only statistics computed straight from the MongoDB collections
    the Express backend writes to (`events` and `registrations`)."""
    today = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    try:
        return EventStats(
            totalEvents=db["events"].count_documents({}),
            totalRegistrations=db["registrations"].count_documents({}),
            upcomingEvents=db["events"].count_documents({"date": {"$gte": today}}),
        )
    except PyMongoError as exc:
        raise HTTPException(status_code=503, detail="Database unavailable") from exc
