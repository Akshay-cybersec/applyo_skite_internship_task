# applyo_skite_internship_task

## Run Locally

1. Start backend:

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

2. Start frontend (new terminal):

```bash
cd frontend
npm install
npm run dev
```

3. Open `http://localhost:3000`

## Fairness / Anti-abuse Mechanisms

1. One vote per poll per browser identity (cookie + backend uniqueness)
- Backend assigns a `voter_id` cookie and enforces a unique `(poll_id, voter_id)` vote record.
- Prevents repeated voting from the same browser session/profile for a poll.

2. Per-IP vote-attempt rate limiting
- Backend logs vote attempts and blocks excessive attempts within a configurable time window.
- Prevents rapid automated abuse/spam attempts from a single IP.

## Edge Cases Handled

- Poll creation blocks empty question and requires at least 2 non-empty options.
- Option list supports add/remove in UI and still preserves minimum option count.
- Voting with an option not belonging to the poll is rejected.
- Poll not found (invalid share link) returns a clear 404-style response.
- Duplicate vote attempts return conflict (`409`) instead of double counting.
- Rate-limited requests return `429` without changing vote totals.
- Real-time updates are pushed to all connected viewers using SSE and the UI refetches current results.
- Polls and votes persist in MongoDB, so refresh/reopen does not lose data.

## Known Limitations

- Cookie-based single-vote control can be bypassed by clearing cookies/incognito/new browser.
- IP-based limiting may impact multiple users behind the same NAT/proxy.
- No authentication/account system; votes are anonymous.
- No CAPTCHA/bot-detection or device fingerprinting.
- SSE works well for this scope, but very high scale may need Redis/pub-sub or WebSocket infra.
- No admin controls (edit poll, close poll, delete poll, moderation).

## What To Improve Next

1. Add authenticated users and stronger anti-abuse controls (captcha + signed tokens + optional fingerprinting).
2. Add poll lifecycle controls (close poll, expiry time, edit/delete options with safeguards).
3. Add observability (structured logs, metrics, alerting) and automated tests (API + e2e).
4. Use a shared event broker (Redis) for real-time fanout across multiple backend instances.
