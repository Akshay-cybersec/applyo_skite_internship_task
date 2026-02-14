import asyncio
import hashlib
import os
import secrets
import uuid
from datetime import datetime, timedelta, timezone

from dotenv import load_dotenv
from fastapi import Cookie, FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field, field_validator
from pymongo import ASCENDING, MongoClient
from pymongo.errors import DuplicateKeyError

load_dotenv()

MONGODB_URI = os.getenv("MONGODB")
MONGODB_DB = os.getenv("MONGODB_DB", "applyo_poll_db")
IP_HASH_SALT = os.getenv("IP_HASH_SALT", "change-me-in-production")
RATE_LIMIT_WINDOW_SECONDS = int(os.getenv("RATE_LIMIT_WINDOW_SECONDS", "60"))
RATE_LIMIT_MAX_ATTEMPTS = int(os.getenv("RATE_LIMIT_MAX_ATTEMPTS", "15"))

origins = os.getenv("CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000,https://applyo-skite-internship-task.vercel.app")
allow_origins = [item.strip() for item in origins.split(",") if item.strip()]

app = FastAPI(title="Simple Poll API", version="1.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

poll_events: dict[str, asyncio.Event] = {}
mongo_client: MongoClient | None = None
db = None


class CreatePollRequest(BaseModel):
    question: str = Field(min_length=1, max_length=500)
    options: list[str]

    @field_validator("question")
    @classmethod
    def validate_question(cls, value: str) -> str:
        text = value.strip()
        if not text:
            raise ValueError("question cannot be empty")
        return text

    @field_validator("options")
    @classmethod
    def validate_options(cls, value: list[str]) -> list[str]:
        cleaned = [item.strip() for item in value if item.strip()]
        if len(cleaned) < 2:
            raise ValueError("at least 2 non-empty options are required")
        if len(cleaned) > 20:
            raise ValueError("maximum 20 options allowed")
        return cleaned


class VoteRequest(BaseModel):
    option_id: str = Field(min_length=1)


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def now_iso() -> str:
    return now_utc().isoformat()


def get_client_ip(request: Request) -> str:
    forwarded_for = request.headers.get("x-forwarded-for", "")
    if forwarded_for:
        first = forwarded_for.split(",")[0].strip()
        if first:
            return first
    if request.client and request.client.host:
        return request.client.host
    return "unknown"


def hash_ip(ip: str) -> str:
    return hashlib.sha256(f"{IP_HASH_SALT}:{ip}".encode("utf-8")).hexdigest()


def serialize_poll(poll_doc: dict | None) -> dict:
    if not poll_doc:
        raise HTTPException(status_code=404, detail="Poll not found")
    return {
        "id": poll_doc["_id"],
        "question": poll_doc["question"],
        "version": poll_doc["version"],
        "created_at": poll_doc["created_at"].isoformat(),
        "updated_at": poll_doc["updated_at"].isoformat(),
        "total_votes": poll_doc.get("total_votes", 0),
        "options": poll_doc.get("options", []),
    }


def upsert_poll_event(poll_id: str) -> asyncio.Event:
    if poll_id not in poll_events:
        poll_events[poll_id] = asyncio.Event()
    return poll_events[poll_id]


def notify_poll_change(poll_id: str) -> None:
    upsert_poll_event(poll_id).set()


def get_poll_or_404(poll_id: str) -> dict:
    assert db is not None
    poll_doc = db.polls.find_one({"_id": poll_id}, {"_id": 1, "question": 1, "version": 1, "created_at": 1, "updated_at": 1, "total_votes": 1, "options": 1})
    if not poll_doc:
        raise HTTPException(status_code=404, detail="Poll not found")
    return poll_doc


@app.on_event("startup")
async def startup() -> None:
    global mongo_client, db
    if not MONGODB_URI:
        raise RuntimeError("MONGODB is not set in environment.")
    mongo_client = MongoClient(MONGODB_URI)
    db = mongo_client[MONGODB_DB]
    db.command("ping")

    db.polls.create_index([("updated_at", ASCENDING)])
    db.votes.create_index([("poll_id", ASCENDING), ("voter_id", ASCENDING)], unique=True)
    db.votes.create_index([("poll_id", ASCENDING)])
    db.vote_attempts.create_index([("poll_id", ASCENDING), ("ip_hash", ASCENDING), ("attempted_at", ASCENDING)])


@app.on_event("shutdown")
async def shutdown() -> None:
    global mongo_client
    if mongo_client is not None:
        mongo_client.close()


@app.get("/")
async def root() -> dict:
    return {"status": "ok", "service": "simple-poll-api", "storage": "mongodb"}


@app.post("/polls")
async def create_poll(payload: CreatePollRequest) -> dict:
    assert db is not None
    poll_id = secrets.token_urlsafe(6)
    created_at = now_utc()
    options = [{"id": secrets.token_urlsafe(8), "text": text, "votes": 0} for text in payload.options]

    poll_doc = {
        "_id": poll_id,
        "question": payload.question,
        "created_at": created_at,
        "updated_at": created_at,
        "version": 1,
        "total_votes": 0,
        "options": options,
    }
    db.polls.insert_one(poll_doc)

    data = serialize_poll(poll_doc)
    data["share_path"] = f"/?poll={poll_id}"
    notify_poll_change(poll_id)
    return data


@app.get("/polls/{poll_id}")
async def get_poll(poll_id: str) -> dict:
    return serialize_poll(get_poll_or_404(poll_id))


@app.post("/polls/{poll_id}/vote")
async def vote_poll(
    poll_id: str,
    payload: VoteRequest,
    request: Request,
    response: Response,
    voter_id: str | None = Cookie(default=None),
) -> dict:
    assert db is not None
    current_voter_id = voter_id or str(uuid.uuid4())
    ip_digest = hash_ip(get_client_ip(request))
    created_at = now_utc()
    window_start = created_at - timedelta(seconds=RATE_LIMIT_WINDOW_SECONDS)

    poll_match = db.polls.find_one({"_id": poll_id, "options.id": payload.option_id}, {"_id": 1})
    if not poll_match:
        existing = db.polls.find_one({"_id": poll_id}, {"_id": 1})
        if not existing:
            raise HTTPException(status_code=404, detail="Poll not found")
        raise HTTPException(status_code=400, detail="Option not found for this poll")

    db.vote_attempts.insert_one(
        {"poll_id": poll_id, "ip_hash": ip_digest, "attempted_at": created_at}
    )
    attempts = db.vote_attempts.count_documents(
        {"poll_id": poll_id, "ip_hash": ip_digest, "attempted_at": {"$gte": window_start}}
    )
    if attempts > RATE_LIMIT_MAX_ATTEMPTS:
        raise HTTPException(status_code=429, detail="Too many vote attempts. Try again later.")

    try:
        db.votes.insert_one(
            {
                "poll_id": poll_id,
                "option_id": payload.option_id,
                "voter_id": current_voter_id,
                "ip_hash": ip_digest,
                "created_at": created_at,
            }
        )
    except DuplicateKeyError as exc:
        raise HTTPException(status_code=409, detail="You already voted on this poll") from exc

    update_result = db.polls.update_one(
        {"_id": poll_id, "options.id": payload.option_id},
        {
            "$inc": {"options.$.votes": 1, "version": 1, "total_votes": 1},
            "$set": {"updated_at": created_at},
        },
    )
    if update_result.matched_count == 0:
        raise HTTPException(status_code=400, detail="Option not found for this poll")

    updated_poll = get_poll_or_404(poll_id)
    notify_poll_change(poll_id)
    response.set_cookie(
        key="voter_id",
        value=current_voter_id,
        max_age=60 * 60 * 24 * 365,
        httponly=True,
        samesite="lax",
    )
    return serialize_poll(updated_poll)


@app.get("/polls/{poll_id}/events")
async def poll_events_stream(poll_id: str) -> StreamingResponse:
    event = upsert_poll_event(poll_id)

    async def event_generator():
        while True:
            await event.wait()
            event.clear()
            yield f"data: {now_iso()}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")
