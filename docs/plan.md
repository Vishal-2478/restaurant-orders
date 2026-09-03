# Plan

## Session log

I split the work into a few sessions so that I could finish the backend rules before
building the frontend around them.

| Session | Planned work | Goals | Estimated | Actual |
|---|---|---|---:|---:|
| 1 | Project setup, database schema, Prisma setup, two migrations, environment validation | — | 2.5h | 3.5h |
| 2 | Argon2 password hashing, login / refresh / logout, `requireAuth`, `requireRole`, the `canActOnOrder` policy | 1 | 2.5h | 2h |
| 3 | Menu CRUD with archive and restore, orders, order lines with price snapshot, the status state machine, voiding with a required reason, collaborators, timeline events | 2, 3, 4, 5, 9 | 2.5h | 2h |
| 4 | Server-side search / filter / sort / pagination, slow-order alerts, dashboard aggregates, bulk menu update, CSV export | 6, 7, 8, 10 | 2.5h | 2.5h |
| 5 | Frontend: shell, auth, menu, order create and detail, lifecycle actions, timeline | — | 2.5h | 3h |
| 6 | Frontend: order list and filters, dashboard, alerts, bulk UI, CSV. Deployment and seed data | — | 2.5h | 3.5h |
| 7 | Documentation, `SUBMISSION.md`, final verification against the live URL | — | 2h | 1.5h |

The estimates were a starting point, and the shape of the plan changed once I started.
The original split had authentication sharing a session with the schema, and the
dashboard sharing one with deployment. In practice authentication was large enough to
be its own session, and it was better to group the four reporting features together
because they are all queries over the same tables. Actual hours are taken from the
commit timestamps rather than remembered.

## How I split the work

I wanted to work from the database and backend towards the UI.

The first sessions focus on the data model and the rules because several requirements
depend on them. For example, order lines need to keep the price from when they were
added, orders have specific allowed status transitions, and waiters can only modify
orders they are allowed to access.

Once these rules are working on the backend, the frontend can use the API without
having to duplicate the same business logic. This matters more than it sounds. Almost
everything the brief is specific about is a rule that has to hold on the server: prices
frozen at the moment a line is added, only certain status changes permitted, waiters
restricted to their own orders, history that cannot be rewritten. A rule implemented in
the browser is not enforcement, it is decoration — and the brief says so explicitly for
Goal 1.

Building screens first would have meant either duplicating those rules in the browser
where they do not count, or building screens twice when the API changed underneath
them.

After the core order flow was working I added the search, dashboard, bulk operations
and alerts, followed by the UI work and deployment.

## Order of work

The general order is:

```text
Database and schema
        ↓
Authentication and permissions
        ↓
Core order functionality
        ↓
Other backend features
        ↓
Frontend
        ↓
Testing and deployment
        ↓
Documentation
```

The main reason for this order is that the backend contains most of the important rules
in the assignment. I would rather have those rules working first and build the UI around
them than finish several screens and later change the API or database structure
underneath them.

The one thing I would change about this order in hindsight is deployment. I left it
until after the backend was finished, which was late enough to be uncomfortable — a
deployment problem discovered with two hours left is a much worse problem than the same
one discovered on day one. Deploying an empty health-check endpoint on the first day
and redeploying continuously afterwards would have cost twenty minutes and removed a
risk that sat over the whole project.

## What I estimated versus what it took

I recorded the actual time after each session, and noted what caused any significant
difference.

### Session 1 — estimated 2.5 hours, took 5

Almost all of the overrun was setup rather than design. Three things cost more time
than I had allowed for:

- **Prisma 7 is configured differently from the version most examples use.** The
  datasource URL has moved out of `schema.prisma` into a separate config file,
  `directUrl` no longer exists, and the client now requires a driver adapter. I set it
  up the old way first and had to go back and read the upgrade guide.
- **A `.env` in the wrong folder.** I had it at the repository root while the server
  runs from `server/`, and `dotenv` only looks in the working directory. The
  environment validation caught it immediately and told me exactly which four
  variables were missing, which is the one time this session that a piece of
  scaffolding paid for itself straight away.
- **The TypeScript build configuration.** Getting Prisma's config file and the seed
  script type-checked without moving the compiled output out of `dist/index.js` took
  two attempts, and ended as two tsconfig files rather than one.

The schema design itself was closer to the estimate than I expected, mostly because I
worked through the requirements on paper before writing any of it.

### Session 2 — authentication

This went closer to plan than session 1, largely because the environment validation and
error handling written in session 1 were already there to build on.

The time went into things that are easy to underestimate because they are not visible
in the finished product: hashing with argon2id rather than bcrypt, storing only a hash
of each refresh token, rotating the refresh token on every use, and returning the same
error message for a wrong password as for an unknown email so that the endpoint cannot
be used to discover which addresses have accounts.

The most useful hour was the testing at the end. Eleven requests through an HTTP client,
including logging in as one waiter and attempting a manager-only action, which returns
`403` and is the single clearest demonstration that Goal 1 is enforced on the server.

### Session 3 — the order lifecycle

The largest session, covering five of the ten goals.

What made it manageable was that the two hardest rules were written as pure functions
before anything used them — the status transition table and the permission check — so
by the time the routes existed the difficult decisions were already made and tested.

The part that took longest to get right was making sure every mutation writes its
timeline event inside the same transaction as the change itself. It is easy to write
that correctly once and then forget it in the fifth or sixth handler, and a history
with silent gaps is worse than no history because you would trust it.

### Session 4 — queries, reporting and alerts

Four goals, and the session where two bugs appeared that no amount of unit testing
would have found.

The first was a timezone error. Timestamps are stored in UTC, the restaurant is in
Asia/Kolkata, and comparing a stored timestamp directly against `current_date` silently
drops the first five and a half hours of every day from every dashboard figure. It
produces no error, just a plausible number that is wrong. I found it by building the
same schema on a local PostgreSQL instance and seeding orders that crossed the boundary
on purpose.

The second was `P2028 Unable to start a transaction in the given time` from the order
list endpoint, caused by Neon suspending an idle database and Prisma giving up after two
seconds. Both are written up in `decisions.md`.

The lesson from this session is that the bugs which survive a type checker and a test
suite are the ones that involve real time, a real timezone, or a real database that has
been asleep.

### Session 5 — the frontend foundation

The first thing built was not a screen. It was the API client, the token handling and the
route guard, and finishing that properly before anything sat on top of it was the single
best decision of the frontend work.

The reason is that everything else is a screen rendering JSON, and that layer is the only
part with a genuine trap in it. Because refresh tokens rotate, several requests failing
with `401` at the same moment will each try to refresh, the first will succeed and revoke
the token, and the rest will present a token that died a millisecond ago and fail —
throwing the user out for no reason. It appears only under concurrency and looks exactly
like a broken backend. Getting that right first meant that when a screen later
misbehaved, I could be confident the cause was in the screen.

The order list and the order detail followed, in that order, because they carry the most
graded weight: server-side filtering with a total count, and the lifecycle with its
history.

### Session 6 — the remaining screens, seed data and deployment

Menu with bulk editing, the dashboard, alerts and the CSV download.

The part I underestimated was **demo data**. The application worked and looked empty: one
order, a flat chart, and an alerts page showing nothing. An empty alerts page is
indistinguishable from a broken alerts page, and a reviewer with fifteen minutes judges
what is on the screen. Extending the seed script to create thirty-one orders — spread
across statuses and waiters, over fourteen days, with two days deliberately left empty so
the chart shows real zeroes, and three orders backdated far enough to be alerting on
first login including one whose acknowledgement has already expired — took longer than
two of the screens and was worth more than either.

Deployment was two services and one circular dependency: the frontend needs the API's
URL, and the API needs the frontend's URL for CORS. The way through is to deploy the API
first, deploy the frontend pointing at it, then go back and set `CORS_ORIGIN`. Until that
last step the deployed site loads and every request is blocked by the browser, with
nothing in the server log — the failure that looks least like what it is.

The other deployment detail worth recording is that a single-page application needs its
host to serve `index.html` for every path. React Router invents `/orders/:id` in the
browser and no such file exists, so without a rewrite rule the first person to refresh an
order page gets a 404.

### Session 7 — documentation and verification

Finishing the five documents, writing `SUBMISSION.md`, and running through all ten goals
against the deployed URL rather than against localhost.

That last part is not a formality. Deployed and working are different claims, and the
things that differ are exactly the ones that had already bitten me: cold starts, CORS,
and environment variables that are baked in at build time rather than read at runtime.

## What I cut when I ran short

I prioritised the ten required goals over the optional stretch features, and I have
recorded anything incomplete rather than marking it as finished.

The order I cut in:

1. **Integration tests over HTTP.** Supertest is installed, and `createApp()` is
   exported without calling `listen()` specifically so that it can be imported into a
   test. With the time available I chose to unit test the rules thoroughly — the
   transition table, the permission policy, the totals, the alert rule and the CSV
   writer, thirty-six tests in all — and verify the endpoints by hand instead. If I had
   another few hours this is the first thing I would add, because the hand testing is
   the part that will not be repeated automatically when something changes.
2. **Menu item categories and descriptions in the interface.** They are useful for
   making the demo data look like a real menu, but nothing in the ten goals needs them.
3. **Visual polish on the dashboard charts**, in favour of the numbers being correct. The
   fourteen-day chart is hand-built rather than pulled from a charting library — for one
   series of fourteen values a library would have been comparable in size to the markup,
   and the two things that needed thought (a visible stub for zero days, labelling every
   third date so they do not collide) are not free in a library either.
4. **Optimistic updates in the interface.** Every mutation waits for the server round
   trip, so on a slow connection a status change feels sluggish. Showing the change
   immediately and rolling back on failure is supported by the query library I am already
   using; I chose correctness and simplicity, which is the right default but is worth
   revisiting for the status buttons.
5. **A frontend test suite.** The backend has thirty-six unit tests; the frontend has
   none. What I did instead was verify every screen by hand against the running API, and
   the two tests I would write first are the ones for behaviour most likely to regress
   without anyone noticing: that a `403` renders the server's own message, and that a
   void cannot be submitted without a reason.

What I would not cut, even under time pressure, is anything that would leave a rule
enforced in the interface but not on the server. A missing screen is a smaller problem
than a rule that only looks like it is enforced — the first is visibly incomplete, and
the second looks finished and is not.
