# Simple Live Poll Frontend

This is a basic frontend prototype for poll creation, sharing, voting, and live result updates.

## Run

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## What It Supports

- Create a poll with a question and 2+ options
- Get a shareable link like `/?poll=<id>`
- Open poll by link and vote once
- See results update live across browser tabs
- Persist polls/votes in browser storage

## Fairness Controls in This Frontend Prototype

- One vote per poll per browser (stored in localStorage)
- One vote per poll per browser session (stored in sessionStorage)

## Limitations

- Data is stored in browser localStorage (not server/database)
- Live updates work across tabs on the same browser/device
- Not secure against advanced abuse (e.g., clearing storage or changing browser/device)
