# Simple Live Poll Frontend

Next.js app for creating, sharing, and voting on polls.

## Run

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Backend URL

Set API base URL (optional; defaults to `http://localhost:8000`):

```bash
# PowerShell
$env:NEXT_PUBLIC_API_URL="http://localhost:8000"
```

## Features

- Create poll with question and 2+ options
- Delete mistakenly added options while composing
- Generate share link (`/?poll=<id>`)
- Join poll by link and vote single-choice
- Real-time result refresh via Server-Sent Events (SSE)
