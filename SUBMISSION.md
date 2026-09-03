# Submission

## Links

- **GitHub repository:** https://github.com/Vishal-2478/restaurant-orders
- **Live application:** https://vishal-restaurant-orders.vercel.app
- **API:** https://restaurant-orders-api-up1d.onrender.com

## Notes for the reviewer

**The first request can take up to a minute.** The API is on Render's free tier, which
suspends the container after a period of inactivity, and the Neon database suspends too.
Both wake on the first request, so the login button will appear to hang for up to a
minute the first time. Everything after that responds normally. This is a hosting-tier
characteristic rather than a defect, and I have left it visible rather than paying to
hide it.

**The database is seeded with 31 orders** spread across every status, both waiters and
the past fourteen days, so the order list, the dashboard and the alerts page all have
something real in them on first login rather than being an empty shell. Two days in that
history are deliberately empty so the fourteen-day chart shows genuine zeroes.

**The alerts page is populated immediately**, including one order that has already
*returned* after being acknowledged — the hardest part of Goal 10 — so you do not have to
wait ten minutes to see it.

**The test I would most like you to run**, because it is the one Goal 1 is most specific
about:

1. Sign in as **Beatrice Kim** (`waiter.b@restaurant.test`), open **Orders**, untick
   *Only my orders*, and open an order whose primary waiter is **Arjun Rao**. It opens —
   a waiter may view any order.
2. Click any status button. You get **`403 — You do not have access to this order.`**
3. Sign in as **Arjun Rao**, open that same order, and add Beatrice as a collaborator.
4. Sign back in as **Beatrice** and click the same button. **It works.**

Nothing about Beatrice changed — same role, same session. The *order* changed. The
refusal came from the server, not from a hidden button.

**One deliberate narrowing to flag up front.** Goal 6 asks for text search on the table
number *and* sorting by table. Those pull in opposite directions: stored as text, table 10
sorts before table 9. I chose an integer column so sorting is numerically correct, which
makes the search an exact match — typing `1` finds table 1, not tables 1, 10 and 12. I
think that is better behaviour for a number, but it is a real narrowing of what was asked,
so I would rather point at it than have you find it. It is recorded in
`docs/decisions.md` as decision 6.

## Demo credentials

| Role | Email | Password |
|------|-------|----------|
| Manager | `manager@restaurant.test` | `Password123!` |
| Waiter | `waiter.a@restaurant.test` | `Password123!` |
| Waiter | `waiter.b@restaurant.test` | `Password123!` |

There are two waiter accounts rather than one on purpose: the permission model can only
be demonstrated with two *different* waiters, which is what the four-step test above uses.

## Stack

| Layer | What you used | Why |
|-------|---------------|-----|
| Frontend | React 19, TypeScript, Vite, TanStack Query, React Router, Tailwind v4 | Vite builds to static files, which is what makes the frontend free to host and independent of the API's uptime. TanStack Query because the orders live in Postgres, not in the browser — treating them as a cache rather than component state gives one model for loading, errors, deduplication and invalidation instead of hand-writing all four in every screen. |
| Backend | Node 22, Express 5, TypeScript, Zod | Express 5 forwards rejected promises to the error middleware, so route handlers stay free of try/catch and can simply throw. Zod validates request bodies *and* environment variables, so one schema produces both the runtime check and the TypeScript type, and misconfiguration fails at boot by name rather than at 3am on one code path. |
| Database | PostgreSQL (Neon), Prisma 7 | The data is relational, and several requirements are really *constraint* requirements — history that cannot be edited, a void that must carry a reason, a waiter who cannot be on an order twice. Postgres enforces those itself, so no application bug can produce an invalid row. Prisma's generated types mean renaming a column breaks compilation rather than production; the four dashboard aggregates are hand-written SQL because the fourteen-day chart must include days with no orders, and an ORM cannot express rows that do not exist. |
| Auth | JWT (15-minute access token) + rotating refresh token, Argon2id | The frontend and API are on different origins, so a cookie set by the API would be third-party and blocked by Safari — a reviewer on an iPhone could not sign in. A bearer header has no such problem. Argon2id is memory-hard, which is why login is deliberately not instant. |
| Testing | Vitest — 36 unit tests | Over the pure business rules: the transition table, the access policy, order totals, the alert rule, the CSV writer. See "least happy with" for the honest gap. |
| Hosting | Vercel (web) + Render (API) + Neon (database) | Three free tiers, and the split matches how the pieces actually differ: static files on a CDN, compute on a service, state in a managed database. |

## Goal checklist

| # | Goal | Status | Notes |
|---|------|--------|-------|
| 1 | Roles and permissions, enforced server-side | **Done** | Two layers, because the brief asks two different questions. `requireRole` gates endpoints where the answer depends only on the person — a waiter's valid token on `POST /api/users` returns `403` in about 10 ms *without touching the database*. `canActOnOrder` handles the relationship question and is a pure function, unit tested. The four-step test in the notes above demonstrates it. Hiding manager controls in the UI is a courtesy, not the enforcement. |
| 2 | Orders, archive and restore | **Done** | The creator becomes primary waiter, taken from the access token and never from the request body — otherwise any waiter could file an order under a colleague's name and every audit trail built on it would be fiction. Archive sets a nullable timestamp; *Include archived* brings it back with lines, totals and history intact. |
| 3 | Order lines, total from the price at the time | **Done** | The name and price are **copied onto the line** at insert; nothing afterwards joins back to the menu for money. To see it: add an item, change that item's price on the Menu screen, refresh the order — **the total does not move.** |
| 4 | Lifecycle, cancel window, void with a required reason, illegal moves refused with an explanation | **Done** | The transition table is a lookup table, not a chain of `if`s, so the whole lifecycle is eight readable lines and TypeScript refuses to compile if a status is added without saying what may follow it. Only legal buttons render. To see the server refuse: open one order in two tabs, advance it in one, act in the stale one — you get the server's own sentence, *"An order cannot go from Accepted to Served. From Accepted the only valid next step is Preparing."* Voiding cannot be submitted without a reason (UI, API and a database CHECK constraint), and the voided line stays on the order, struck through, with its reason. |
| 5 | Collaborators, one combined list | **Done** | The waiter/order relationship is one-to-many and many-to-many *at the same time* — primary waiter is a column, collaborators are rows in a join table with a composite primary key. *Only my orders* is one query with an `OR` across both. |
| 6 | Search, filters, sorting, pagination with total count — server-side | **Done**, with one narrowing | Every control writes a query parameter and the query string is part of the cache key, so changing a filter *is* a new server request — filtering in the browser is not something the code is capable of. The footer reads "Showing 1–20 of 47" where the 47 came from the server's `COUNT`. Filters live in the URL, so back works and a filtered view is a shareable link. **Narrowing:** table-number search is exact match, not substring — see the note above and decision 6. |
| 7 | Bulk update with per-item results; CSV export | **Done** | Deliberately **not** wrapped in a transaction: all-or-nothing is the exact opposite of what the brief asks for. Include an archived item alongside good ones and you get ✓ ✓ ✗ with the server's reason, and the good edits are not undone. The CSV escapes to RFC 4180 and neutralises strings a spreadsheet would otherwise execute as a formula. |
| 8 | Dashboard | **Done** | Four figures, breakdown by status and by waiter, and a fourteen-day chart. "Today" means today in the restaurant's timezone, not UTC — checked against a real database, where the naive query returned **1** and the correct one **2**, because Kolkata's day starts 5½ hours before UTC's. The chart always has fourteen bars including empty days; a plain `GROUP BY` would delete quiet days and draw Monday next to Wednesday. |
| 9 | Immutable history | **Done** | Every change and the event recording it are written in the **same transaction**, so the order and its history cannot disagree. Enforced twice: no API route updates or deletes an event, *and* a database trigger raises on `UPDATE`/`DELETE`. Tested by attempting a delete in Neon **as the database owner** — a higher privilege than any account the app can create — which is refused with `order_events is append-only`. A manager is not the hardest case; the owner is. |
| 10 | Slow-order alerts that return after the snooze | **Done** | **No alert state is stored anywhere and no background job exists.** Acknowledgements are timestamped rows; whether an order is alerting is computed at query time from its status, `placedAt`, and the latest acknowledgement. A boolean cannot satisfy this — it records *that* an alert was acknowledged, not *when*, so there is nothing to count forward from, and it only fires once. The alerts page is populated on first login and one entry shows a red **Returned** badge. |

## How much time did you actually spend?

**About 18 hours across three days**, against my own estimate of 17 and the brief's guide
of 12.

The figures come from commit timestamps rather than memory, with the time before each
session's first commit included where it obviously happened — reading the brief and
working the schema out on paper, for instance.

| Session | Work | Estimated | Actual |
|---|---|---:|---:|
| 1 | Repo, Prisma, schema, two migrations, environment validation, first docs | 2.5h | **3.5h** |
| 2 | Argon2 hashing, login/refresh/logout, `requireAuth`, `requireRole`, access policy | 2.5h | **2h** |
| 3 | Menu CRUD, orders, lines with price snapshot, status machine, voiding, collaborators, timeline | 2.5h | **2h** |
| 4 | Search/filter/sort/paginate, alerts, dashboard aggregates, bulk update, CSV | 2.5h | **2.5h** |
| 5 | Frontend foundation, auth layer, order list and detail | 2.5h | **3h** |
| 6 | Menu, dashboard and alerts screens, demo seed data, deployment | 2.5h | **3.5h** |
| 7 | Documentation, this file, verification against the live URL | 2h | **1.5h** |
| | | **17h** | **≈18h** |

**Against my own estimate the total was 9% over, but the distribution was wrong by much
more than that**, and that is the more useful observation.

Session 1 ran 40% over and **none of it was design.** It was Prisma 7 being configured
unlike every example online, a `.env` in the wrong folder, and two attempts at the
TypeScript build configuration. Session 6 ran over because I had mentally filed demo data
as a chore rather than as a deliverable; extending the seed script took longer than two of
the screens and mattered more than either, because an empty alerts page is
indistinguishable from a broken one.

Sessions 2 and 3 came in *under*, for a reason worth naming: the environment validation
and error handling from session 1 were already there, and the two hardest rules — the
transition table and the permission check — had been written as pure functions before
anything used them, so by the time the routes existed the difficult decisions were made
and tested.

**Against the brief's 12-hour guide I am about six hours over**, and I would rather report
that honestly than round it down. Roughly where the extra went: two to three hours of
Prisma 7 and toolchain friction that had nothing to do with the problem; about two hours
on documentation, which the brief asks to be written as the work happens rather than
backfilled; and about an hour on demo data and deployment verification. If I were doing it
again inside twelve hours, the first thing I would cut is not a goal — it is the time lost
to setup, by deploying a health-check endpoint on day one and getting the toolchain
arguments over with before any real work depended on them.

The conclusion I take from it is that my estimates for **unfamiliar tooling** should be
roughly doubled, while my estimates for work in a shape I have done before were accurate.

## What would you do next, with another 12 hours?

In priority order, with reasoning rather than a wish list.

**1. Integration tests over HTTP — about 4 hours.**
This is the gap that bothers me most, and it is the same one I name below. The 36 unit
tests cover pure functions; nothing exercises an actual request. The seam already exists —
`createApp()` is exported without calling `listen()` specifically so it can be imported
into a test — and Supertest is installed and unused. The first four tests would cover the
behaviour I verified by hand and which nothing will re-verify when something changes: a
waiter receiving `403` on another waiter's order, that same request succeeding once the
collaborator is added, an illegal transition returning `409` with the reason present in
the body, and a void with an empty reason returning `400`.

**2. Frontend tests for two behaviours — about 2 hours.**
React Testing Library with a mocked API, covering the two things most likely to regress
silently: that a `403` renders the *server's* message rather than something generic, and
that the void form cannot be submitted with an empty reason. Both are one careless change
away from breaking without anyone noticing.

**3. Ship `allowedTransitions` on the order response — about 1 hour.**
The client keeps its own copy of the transition table to decide which buttons to render.
That duplication is deliberate and documented, but it can drift. Having the server compute
the legal next steps and include them in the order it was already returning removes the
duplication without adding a round trip.

**4. Optimistic updates on the status buttons — about 1.5 hours.**
Every mutation waits for the server, so on a slow connection a status change feels
sluggish. TanStack Query supports optimistic updates with rollback. I would apply it only
to the status buttons — the action taken most often, and where latency is most noticeable.

**5. Split `OrderDetailPage` — about 1 hour.**
Over 400 lines. The lines table, the add-line form and the collaborator panel should each
be their own component.

**6. Keyset pagination and a capped count — about 2 hours.**
The first thing that breaks at scale, and `docs/schema.md` explains why: an exact
`COUNT(*)` over a filtered set scans every matching row, and `LIMIT 20 OFFSET 40000` makes
Postgres produce forty thousand rows and discard them. The fix is to cap the count at
"1000+" and switch to keyset pagination — which changes what the interface can offer, from
jump-to-page to next/previous, so it is a product decision as much as a technical one.

**7. A React error boundary — 30 minutes.**
A render-time exception in one component currently blanks the whole page instead of being
contained to that section.

What I would **not** spend it on is visual polish. The numbers being right matters more
than the chart being pretty, and if I had twelve hours, tests are what would let someone
else change this code safely.

## What are you least happy with in this codebase, and why?

**The testing is lopsided, and I would rather say so than let you find it.**

There are 36 unit tests and every one tests a pure function — the transition table, the
access policy, order totals, the alert rule, the CSV writer. That was a deliberate choice
and I would make it again with the same time available: those are the rules the brief is
most specific about, and being pure meant I could test *every* combination cheaply,
including simulating "twenty-six minutes later" for the alert re-arm without waiting for
it.

But nothing tests an HTTP request. Every endpoint was verified by hand, which proves the
system works today and will tell nobody when a future change breaks it. **The single most
important behaviour in the project — a waiter refused on another waiter's order — is
currently guaranteed by my having tried it, not by anything that runs on every commit.**
That is the wrong place for that guarantee to live.

**Second: I duplicated the status transition table in the frontend.**

The server owns the rule and re-checks every request; the client's copy exists only to
decide which buttons to render without a round trip. If they drift, the server wins and
the user sees a `409` rather than a wrong outcome — so the failure mode is degraded, not
incorrect. It is still duplication, and I know the better answer, which is item 3 above.

**Third: `OrderDetailPage` is over 400 lines.**

It covers four of the ten goals, which is why it grew, but "it does a lot" is not an
excuse for one file. I extracted the timeline and stopped there under time pressure.

**And a process one, which produced the two most interesting bugs in the project.**

I deployed late. Both bugs that survived a type checker and a test suite — a timezone
error that returned a plausible but wrong dashboard figure, and a transaction timeout that
only appears against a database that has been asleep — are things a deployment on day one
would have surfaced in the first hour rather than near the end. Deploying an empty
health-check endpoint on the first day would have cost twenty minutes and removed a risk
that sat over the whole project. **That is the single change I would make to how I worked,
ahead of any change to the code.**

---

## Running it locally

```bash
git clone https://github.com/Vishal-2478/restaurant-orders
cd restaurant-orders/server
npm install
cp .env.example .env          # every variable is documented in the file
npx prisma migrate deploy
npm run seed
npm run dev                   # http://localhost:4000

cd ../web
npm install
cp .env.example .env          # VITE_API_URL=http://localhost:4000
npm run dev                   # http://localhost:5173
```

```bash
cd server && npm test         # 36 tests
```

No secret is committed anywhere. `.env.example` in each folder lists every variable with a
comment, including the command to generate a JWT secret rather than a plausible-looking
placeholder that might get shipped as a real one. `git ls-files | grep -i env` returns only
`.env.example` and `src/env.ts`.

## The documents

| File | What it covers |
|------|----------------|
| `docs/architecture.md` | The three moving pieces and where each runs, both halves of the codebase, one request end to end with every status code it can produce, the two-layer permission model, and what I did not build |
| `docs/schema.md` | Eight tables column by column, one-to-many versus many-to-many, which constraints live in the database and which in the application, what I denormalised on purpose and the one thing I chose not to, and what breaks first at 100× the data |
| `docs/decisions.md` | Nineteen decisions with the rejected alternative and the cost of each — including **two I later reversed** |
| `docs/plan.md` | How I split the work, estimated versus actual per session with the cause of each difference, and what I cut |
| `docs/ai-prompts.md` | How I used an AI assistant, honestly — including the four occasions where its first answer was wrong, how I found out, and what I changed |
