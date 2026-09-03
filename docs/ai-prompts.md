# AI prompts

I used an AI assistant throughout this project. The working arrangement was that it
wrote and verified code and I typed it in myself, so that I would be able to explain
every line afterwards, and so that I was the one running the commands and reading the
errors.

The entries below are the exchanges that actually changed something. Some are prompts
that produced good answers; several are prompts whose first answer was wrong, and those
are the more useful ones to record.

---

## Understanding the brief and choosing a stack

### Prompt

I have been given a restaurant orders assignment with a README and a submission
document. I know the basics of MERN/PERN but I want to understand the project properly
before I start coding.

Read both files and help me understand what the assignment is actually asking for.
Break down the ten requirements and point out the important rules and edge cases hidden
in them. Also help me identify anything that is ambiguous and needs a design decision.

I am comfortable with React, Node/Express and basic databases, but I don't have much
experience designing a system like this. Explain the architecture and database
requirements in a way I can understand.

For the stack, I am considering PostgreSQL vs MongoDB. Based on the requirements,
especially the relationships, order history, collaborators and the things they want
documented in `schema.md`, tell me which would make more sense and why.

### What you got

A breakdown of the ten requirements, including the important rules and edge cases in
each one. We also identified a few areas where I need to make an explicit design
decision instead of assuming what the requirement means.

The recommendation was to use PostgreSQL with Prisma because the application has
several relational parts, such as orders and order lines, as well as waiters
collaborating on multiple orders. The database also needs to enforce things like
relationships, uniqueness and the integrity of the order history.

### What you corrected

Nothing at this stage — the stack reasoning held up and I went with it. The ambiguities
it surfaced I resolved myself and recorded in `decisions.md`, including narrowing the
table number search to an exact match so that sorting by table would be numerically
correct. The corrections that mattered came later, and are recorded below.

---

## Designing the database schema

### Prompt

Before you give me a schema, I want to try designing it myself so I actually
understand it. Give me the storage requirements pulled out of the ten goals, without
naming the tables, and a list of questions to answer — what tables there are, what
columns and types, which relationships are one-to-many and which are many-to-many, how
to store money, and how the slow-order alert requirement should be modelled.

Then review what I come up with and tell me what is wrong, and after that give me the
full schema. It should cover all ten requirements properly, and it should not be so
minimal that adding a feature later means restructuring it.

### What you got

A set of requirements without the answers, and nine questions. I worked through them
first.

I got the main things right: foreign keys rather than storing names, the price being
copied onto the order line at the time it is added rather than read from the menu
later, and the fact that the waiter/order relationship is one-to-many for the primary
waiter and many-to-many for collaborators at the same time.

What I got wrong or missed: I had folded the order lines into the orders table instead
of making them their own table, I did not know what voiding meant, I did not know how
to record an archived order without deleting it, and I could not work out the alert
requirement at all.

The review explained those and then gave me an eight-table schema.

### What you corrected

The alert design is the one worth recording, because my instinct was wrong and the
explanation changed how I think about this kind of problem.

I assumed there would be an `acknowledged` boolean on the order. That cannot satisfy
the requirement. The alert has to come back a set number of minutes after it was
acknowledged, and a boolean stores that it was acknowledged but not when, so there is
nothing to calculate the return time from. It also only works once, because something
would have to set it back.

The schema stores acknowledgements as rows with timestamps instead, and stores no
alert state at all — whether an order is alerting is worked out when the alerts are
requested. Once I understood that, the requirement stopped needing a background job.

I also asked why the schema included things the brief does not literally ask for — the
menu item name copied onto the line, and `readyAt`/`servedAt` on the order — and made
sure I could justify each of them before keeping them. Both are in `schema.md` under
denormalisation.

---

## Setting up the TypeScript build

### Prompt

Prisma's config file is outside `src/`, so TypeScript is not type-checking it and
`process` shows as an error. How do I fix that?

### What you got

A `tsconfig.json` that changed `rootDir` from `"src"` to `"."` and widened `include` to
cover `prisma7.config.ts` and the seed script.

### What you corrected

This one I caught. Changing `rootDir` to `"."` also moves the compiled output from
`dist/index.js` to `dist/src/index.js`, which is not the convention and meant changing
the start script that Render will run. I questioned whether it was the right fix.

It was not. The better answer is two config files, because "what should be
type-checked" and "what should be compiled" are different questions: `tsconfig.json`
covers `src`, `prisma` and the config file with `noEmit`, so the editor and CI check
everything; `tsconfig.build.json` extends it and narrows to `src` for the actual build,
so the seed script and Prisma's config never end up in `dist`.

The lesson I took from it is that a fix which makes an error disappear is not
automatically the right fix, and it is worth asking what else it changed.

---

## Configuring Prisma 7 and the first migration

### Prompt

I am on Prisma 7.10. Here is what `prisma init` generated — `schema.prisma` with an
empty datasource block, and a `prisma7.config.ts` file I was not expecting. I have two
Neon connection strings, pooled and direct. Tell me exactly where each one goes, and
check rather than assume, because this looks different from the Prisma setup I have
seen before.

### What you got

Initially the Prisma 6 answer: put `directUrl` next to `url` inside the `datasource`
block in `schema.prisma`. That is wrong on Prisma 7.

After checking the Prisma 7 upgrade guide, the correct answer: `directUrl` no longer
exists, the datasource URL has moved out of the schema file into `prisma7.config.ts`,
and the runtime client now requires a driver adapter rather than reading a connection
string from the schema.

### What you corrected

The instruction I was given first would not have worked, and I would have spent a while
confused about why. What I changed as a result: the direct connection string goes in
`prisma7.config.ts`, because that file is only read by the CLI when running migrations;
the pooled string is passed to the `@prisma/adapter-pg` adapter where the client is
created, because that is what the running API uses.

This is recorded as the reversed decision in `decisions.md`. The version I ended up
with is clearer than the one I started with — each connection string now lives in the
place that actually uses it, rather than both sitting together in one block where the
difference between them was easy to miss.

I also declined the upgrade prompt to Prisma 8.0.0-rc, on the grounds that taking a
major version release candidate a few days before a deadline has no upside.

The part of this prompt that did the work was "check rather than assume". Asking for
verification rather than an answer from memory is now how I phrase anything
version-specific, and it is the reason the second answer was right.

---

## Building the order lifecycle

### Prompt

Now write the order service: creating an order, adding lines with the price snapshot,
voiding a line with a required reason, the status transitions, collaborators, archive
and restore, and the timeline events.

Two rules. Every mutation and the timeline event that records it must be written in the
same transaction, so the order and its history can never disagree. And anything that is
a rule rather than plumbing — the transition table, the permission check, the total
calculation — should be a pure function in its own file, so I can unit test it without
a database.

Compile and run everything before you give it to me.

### What you got

The service, the routes, and a set of unit tests. The transition rules came back as a
lookup table rather than a chain of `if` statements, which I had not thought to ask for
but immediately preferred — the whole lifecycle is visible in eight lines and can be
checked against the brief by reading it, and because the table is typed as a complete
record over the status enum, TypeScript refuses to compile if a status is ever added
without saying what may follow it.

The transition checker returns a result object rather than throwing, so the same
function can serve the route that needs a `409` with a reason, the tests that need a
value to assert on, and eventually the frontend that needs to know which buttons to
disable.

### What you corrected

Two things, both found by the instruction to run the code first rather than by reading
it.

The total calculation was originally written inside the order service. Its unit test
failed on the very first run, because importing that file pulls in the Prisma client,
which pulls in the environment validation, which calls `process.exit` when
`DATABASE_URL` is not set. A piece of arithmetic could not be tested without a database
connection string. It moved into its own file with no imports at all, and I now use
that as the test for where a function belongs: a function's dependencies are inherited
by everyone who imports it.

The second was in the menu query parameters. `z.coerce.boolean()` looks like the
obvious way to read `?includeArchived=false` from a query string, and it is wrong —
coercion is just `Boolean(value)`, and every non-empty string is truthy, so the string
`"false"` becomes `true`. The parameter silently meant the opposite of what it said.
Replaced with an explicit `z.enum(['true','false'])` and a transform.

---

## The dashboard, and a bug that looked like nothing

### Prompt

Write the dashboard aggregates. The fourteen-day chart has to include days where
nothing was served, and "today" has to mean today in the restaurant's timezone, not in
UTC. Do not reason about the timezone arithmetic — set up a real PostgreSQL database,
seed it with orders that cross the boundary, and show me the actual numbers.

### What you got

The four aggregate queries, and a demonstration I would not have thought to ask for if
I had not insisted on the numbers.

Prisma stores timestamps in UTC, and Kolkata is UTC+05:30, so an order served at half
past midnight local time is stored as seven in the evening the day before. Run against
seeded data that deliberately straddled that boundary, the timezone-aware query
returned **2** orders served today and the naive `servedAt::date = current_date`
version returned **1**.

The naive version does not error. It returns a plausible number that is quietly wrong,
and the only way anyone would notice is by comparing the dashboard against the till.

The fourteen-day chart demonstrated the same point differently: a plain `GROUP BY`
returned two rows for the two days that had activity, where the `generate_series`
version returned all fourteen with twelve zeroes. A chart built on the first version
would not have shown a quiet Tuesday as low — it would have removed Tuesday and drawn
Monday next to Wednesday.

### What you corrected

Nothing in the answer, but the prompt itself is the correction. My earlier prompts
asked for code; this one asked for evidence. Both of these bugs would have shipped and
neither would have produced an error message, and no unit test I would have thought to
write would have caught either, because both are about what the database does with real
timestamps rather than about what my functions do with their arguments.

---

## A production bug that the tests could not have found

### Prompt

The order list endpoint threw `P2028 Unable to start a transaction in the given time`
against the deployed database. Explain what actually happened before suggesting a fix —
I do not want to just raise a number until the error goes away.

### What you got

Two causes that had stacked up. Prisma waits two seconds by default to acquire a slot
for an interactive transaction, and Neon's free tier suspends a database that has been
idle and takes several seconds to wake. So the first request after a quiet period was
asking for a transaction before there was a database awake to provide one, waiting two
seconds, and giving up. The endpoint returned a 500 instead of a page of orders.

### What you corrected

The first suggestion was to raise the timeouts, and I did raise them — the transactions
that genuinely have to be atomic, every order mutation together with its timeline
event, now have limits generous enough to survive a cold start.

But that treats the symptom. The question the prompt was really asking was why a
read-only list query needed a transaction at all. It had one because I had wrapped the
page query and its `COUNT(*)` together so that the count could never describe a
different set of rows than the page. That is a real guarantee, and on this endpoint it
is worth very little — the worst case is a total computed a few milliseconds before the
page, on a list the user re-fetches as soon as they click anything. What it cost was the
endpoint working at all on the first request after an idle period, which on a free tier
that a reviewer opens once is close to every request that matters.

So the transaction came out of the list query and stayed everywhere it earns its keep.
This is recorded as the second reversed decision in `decisions.md`, and it is the
clearest example in the project of something thirty-six passing unit tests could never
have found, because it only appears against a real database that has been asleep.

---

## The frontend authentication layer

### Prompt

Now the frontend. Before any screen, build the layer everything sits on: the fetch
wrapper, where the tokens are kept, the refresh-on-401 behaviour, the auth context and
the route guard.

Two things I want reasoned about rather than assumed. Where each token should live and
why they should not both live in the same place. And what happens when several requests
fail with `401` at the same moment, given that my refresh tokens rotate.

Compile it before giving it to me.

### What you got

The access token in a module-level variable and the refresh token in `localStorage`, with
the reasoning I had asked for: the access token cannot be revoked, so it is kept where it
is hardest to reach and given a short life; the refresh token is revocable and rotates,
so the risk of storing it is one that can be detected and undone.

The concurrency question turned out to be the important one, and I would not have thought
to ask it if I had not been told earlier that rotation makes a stolen token usable only
once. Three requests failing together would each call `/api/auth/refresh`; the first
would succeed and revoke the token; the other two would present a token that had died a
millisecond earlier and be rejected — clearing the session and throwing the user out for
no reason. It appears only under concurrency, only sometimes, and looks exactly like a
broken backend.

The fix is that all callers await a single in-flight promise.

### What you corrected

Nothing in the answer. What changed was my sense of where the risk in this project
actually is. I had been thinking of the frontend as the easy half — screens rendering
JSON — and this is the one part of it with a real trap in it. So I built the whole auth
layer and tested it, including refreshing the page to confirm the session survives, before
building a single screen on top of it.

---

## The order list, and a lint rule that improved the code

### Prompt

Build the order list. Every filter, the sort, and the page must be sent to the server —
the brief says explicitly not to load every order into the browser and filter there — and
the response has to show a total match count alongside one page.

I would also like the filters to survive a page refresh and work with the back button.

### What you got

The filters kept in the URL with `useSearchParams` rather than in component state, which
gives the back button and refresh behaviour I asked for, and two things I had not thought
of: a filtered view becomes a link that can be pasted to someone else, and the query
string can be used as part of the cache key.

That last point is the one I would now lead with. Because the query string is part of the
key, changing a filter changes the cache entry, which means a new request to the server.
"Filtering happens on the server" stops being a convention someone has to remember and
becomes the only thing the code is capable of doing.

### What you corrected

My linter rejected the first version. The dependency array of the memo contained
`statuses.join(',')`, and `react-hooks/exhaustive-deps` only accepts plain identifiers,
not function calls.

The obvious fix would have been to compute that string into a variable first. The better
fix, which is what we did, was to read every value *inside* the memo directly from
`searchParams` and depend on `searchParams` alone. One dependency, and the request can no
longer disagree with the URL, because both read from the same source.

I have started treating that lint rule as a design hint rather than an obstacle. It was
asking "what does this actually depend on?", and the honest answer was one thing, not
eleven.

---

## Demo data, and why it is not a formality

### Prompt

The application works but it looks empty — one order, a flat chart, an empty alerts page.
Extend the seed script so the deployed app demonstrates all ten goals on first login.

I specifically want the alerts page to be populated the moment someone signs in, including
the case where an alert has already come back after being acknowledged, because that is
the hardest part of Goal 10 and it is the part nobody will wait around to see.

### What you got

Thirty-one orders: eight covering every status with collaborators, a voided line and
notes, and twenty-three spread across the previous thirteen days so the chart has a shape.

Three details I would not have specified myself, and all three are the difference between
demo data and a demonstration:

Two days in the history are deliberately left empty, so the fourteen-day chart shows real
zeroes. If every day had orders, the fact that the query includes empty days would be
invisible.

Three orders are backdated past the fifteen-minute threshold, so alerts are populated
immediately — and one of them carries an acknowledgement from fourteen minutes ago, which
with a ten-minute snooze means it has already re-armed and displays as "Returned" on first
load.

Every seeded line copies the price and name from the menu item exactly as the running code
does, and every order's timeline is written event by event through the real transition
path. Seeded data has to obey the same rules as real data, or the price-snapshot
demonstration would be a lie and the timeline would not look like something that happened.

### What you corrected

Nothing in the output. The prompt is the entry: I had been treating seed data as a chore
and this reframed it as part of the deliverable. An empty alerts page is indistinguishable
from a broken one, and a reviewer with fifteen minutes judges what is on the screen rather
than what the code is capable of.

It also turned into an unplanned demonstration of the alert design. An order that had been
seeded as too recent to alert appeared in the alerts list an hour later, without anything
running — no job, no timer, nothing written. A subtraction that returned false now returns
true. That is the clearest evidence I have that "derive, don't store" was the right call,
and I found it by leaving the tab open.
