# Simple Live Poll Backend

FastAPI backend for poll creation, voting, real-time updates, and persistence.

## Run

```bash
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

API docs: `http://localhost:8000/docs`

## Environment Variables

- `MONGODB` (required)
- `MONGODB_DB` (default: `applyo_poll_db`)
- `IP_HASH_SALT` (default: `change-me-in-production`)
- `RATE_LIMIT_WINDOW_SECONDS` (default: `60`)
- `RATE_LIMIT_MAX_ATTEMPTS` (default: `15`)
- `CORS_ORIGINS` (default: `http://localhost:3000,http://127.0.0.1:3000`)

## Endpoints

- `POST /polls` create a poll
- `GET /polls/{poll_id}` get poll + results
- `POST /polls/{poll_id}/vote` cast one vote
- `GET /polls/{poll_id}/events` SSE stream for live updates

## Fairness / Anti-abuse Controls

- One vote per poll per browser via `voter_id` cookie with backend uniqueness check.
- Per-IP vote-attempt rate limiting per poll within a time window.

## Persistence

- MongoDB stores polls, votes, and vote-attempt logs.
