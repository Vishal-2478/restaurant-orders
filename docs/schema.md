# Schema

The database is PostgreSQL, accessed through Prisma. Money is stored as an integer
number of cents everywhere. Nothing in this schema is ever deleted: rows are archived
or voided using a nullable timestamp, which also records when it happened.

Table names are snake_case. Column names are left as Prisma generates them, in
camelCase, so that a column has the same name in the SQL as it does in the TypeScript.
The cost is that raw SQL has to double-quote them, because Postgres lowercases
unquoted identifiers. That cost is real and I have paid it — every one of the dashboard
queries and every ad-hoc query I have run against Neon writes `"servedAt"` rather than
`servedAt`, and forgetting the quotes produces a "column does not exist" error rather
than anything that hints at the cause.

Every primary key is a UUID version 7 rather than an auto-incrementing integer or a
version 4 UUID. Sequential integers leak information — a reviewer who signs up and is
given id 4 has learned how many accounts exist, and an order numbered 1,203 tells a
competitor roughly how much business the restaurant has done. Version 4 UUIDs solve
that but are entirely random, so consecutive inserts scatter across the index. Version 7
puts a millisecond timestamp in the leading bits, so the values still cannot be guessed
but they sort chronologically, rows created together sit together in the index, and
ordering by id is approximately ordering by creation time.

## Tables

### users

| Column | Type | Notes |
|---|---|---|
| id | UUID | primary key, UUIDv7 |
| email | TEXT | unique |
| passwordHash | TEXT | Argon2 |
| name | TEXT | |
| role | Role | enum: `MANAGER`, `WAITER` |
| isActive | BOOLEAN | default true |
| createdAt / updatedAt | TIMESTAMP(3) | |

Staff who leave are deactivated rather than deleted, because their name still has to
appear on the orders and timeline entries they created.

### refresh_tokens

| Column | Type | Notes |
|---|---|---|
| id | UUID | primary key |
| userId | UUID | → users |
| tokenHash | TEXT | unique; the hash, never the token itself |
| expiresAt | TIMESTAMP(3) | |
| revokedAt | TIMESTAMP(3) | null until logout |
| createdAt | TIMESTAMP(3) | |

Storing refresh tokens is what makes logging out mean something. Only a hash is kept,
for the same reason passwords are hashed: a leaked database should not hand out
working sessions.

### menu_items

| Column | Type | Notes |
|---|---|---|
| id | UUID | primary key |
| name | TEXT | |
| description | TEXT | nullable |
| category | TEXT | nullable |
| priceCents | INTEGER | `CHECK >= 0` |
| isAvailable | BOOLEAN | default true |
| archivedAt | TIMESTAMP(3) | null means active |
| createdAt / updatedAt | TIMESTAMP(3) | |

### orders

| Column | Type | Notes |
|---|---|---|
| id | UUID | primary key |
| tableNumber | INTEGER | `CHECK > 0` |
| status | OrderStatus | enum: `PLACED`, `ACCEPTED`, `PREPARING`, `READY`, `SERVED`, `CANCELLED` |
| primaryWaiterId | UUID | → users |
| placedAt | TIMESTAMP(3) | default now |
| readyAt | TIMESTAMP(3) | nullable |
| servedAt | TIMESTAMP(3) | nullable |
| archivedAt | TIMESTAMP(3) | null means the order is in the active queue |
| createdAt / updatedAt | TIMESTAMP(3) | |

Indexes: `(archivedAt, placedAt)` for the default queue, plus `status`,
`primaryWaiterId`, `tableNumber` and `servedAt` for the filters and the dashboard.

### order_collaborators

| Column | Type | Notes |
|---|---|---|
| orderId | UUID | → orders |
| userId | UUID | → users |
| addedById | UUID | → users, who added them |
| addedAt | TIMESTAMP(3) | |

Primary key is the composite `(orderId, userId)`. That is what stops the same waiter
being added to an order twice, and the database enforces it rather than the
application remembering to check.

### order_lines

| Column | Type | Notes |
|---|---|---|
| id | UUID | primary key |
| orderId | UUID | → orders |
| menuItemId | UUID | → menu_items |
| menuItemName | TEXT | copied at insert |
| unitPriceCents | INTEGER | copied at insert, `CHECK >= 0` |
| quantity | INTEGER | `CHECK > 0` |
| specialInstructions | TEXT | nullable |
| createdById | UUID | → users |
| createdAt | TIMESTAMP(3) | |
| voidedAt | TIMESTAMP(3) | nullable |
| voidReason | TEXT | nullable |
| voidedById | UUID | nullable, → users |

The three void columns are constrained as a group — see the constraints section.

### order_events

| Column | Type | Notes |
|---|---|---|
| id | UUID | primary key |
| orderId | UUID | → orders |
| type | OrderEventType | enum: created, status changed, line added, line voided, collaborator added/removed, note added, archived, restored |
| actorId | UUID | → users |
| fromStatus / toStatus | OrderStatus | nullable, set on status changes |
| orderLineId | UUID | nullable, → order_lines |
| message | TEXT | nullable — the note text, or the void reason |
| metadata | JSONB | nullable |
| createdAt | TIMESTAMP(3) | |

Indexed on `(orderId, createdAt)` so one order's timeline reads in order without a
sort.

The columns that get queried or displayed in a fixed place are typed. `metadata` is
there so a future event type can carry a payload without a migration; it is only ever
displayed, never filtered on.

### order_alert_acks

| Column | Type | Notes |
|---|---|---|
| id | UUID | primary key |
| orderId | UUID | → orders |
| acknowledgedById | UUID | → users |
| acknowledgedAt | TIMESTAMP(3) | |

Indexed on `(orderId, acknowledgedAt)`.

There is no "is alerting" or "acknowledged" column anywhere in the schema. This is
explained under denormalisation below, because it is the design decision I spent the
most time on.

Note that this table has no unique constraint on `orderId`. That is deliberate: one
order accumulates as many acknowledgement rows as it is acknowledged times over an
evening, and the query only ever reads the most recent one.

## One-to-many versus many-to-many

**One-to-many**

- users → orders, as the primary waiter
- orders → order_lines
- orders → order_events
- orders → order_alert_acks
- menu_items → order_lines
- users → refresh_tokens
- users → order_events, as the actor
- users → order_lines, as the creator and separately as the voider

**Many-to-many**

- users ↔ orders, through `order_collaborators`

The interesting part is that the relationship between a waiter and an order is *both*
of these at once, and it has to be.

The brief says an order has one primary waiter, and that any number of other waiters
can be added as collaborators, and that one waiter can collaborate on any number of
orders. If I modelled the whole thing as a single many-to-many table I would lose
which waiter is primary. If I modelled it as a column on the order I could only ever
have one waiter. So the primary waiter is a foreign key column on `orders`, and every
additional waiter is a row in the join table.

That also gives a clean answer to "every waiter can see one list of every order where
they are the primary waiter or a collaborator": it is one query with an `OR` across
those two relationships.

## Constraints in the database versus the application

**Enforced by the database**

- Foreign keys on every relationship, with no cascading deletes except refresh tokens
- `UNIQUE` on `users.email` and `refresh_tokens.tokenHash`
- The composite primary key on `order_collaborators`
- `CHECK` constraints: `menu_items.priceCents >= 0`, `order_lines.unitPriceCents >= 0`,
  `order_lines.quantity > 0`, `orders.tableNumber > 0`
- A grouped `CHECK` on the void columns: either all three are null, or all three are
  set and the reason is not blank after trimming
- A trigger on `order_events` that raises on any `UPDATE` or `DELETE`
- `NOT NULL` throughout

I tested the trigger rather than assuming it worked. Connected to Neon through its SQL
editor as the database owner — a higher privilege than any account the application is
capable of creating — `DELETE FROM order_events WHERE "orderId" = '...'` is refused
with `ERROR: order_events is append-only; DELETE is not permitted on this table
(SQLSTATE 23001)`, and an `UPDATE` on the same rows is refused the same way. Goal 9 says
the history cannot be edited or deleted "including by managers"; a manager is not
actually the hardest case, the database owner is, and the constraint holds there.

**Enforced by the application**

- Whether the current user may act on a given order — manager, primary waiter, or
  collaborator
- Which role may create menu items or change prices
- The order status transition rules
- The per-item success and failure reporting in the bulk menu update

**Where I drew the line, and why**

Rules that must hold no matter what code runs go in the database. Rules that depend on
who is asking go in the application, because the database has no idea who is logged
in — it only sees a connection.

The two that took the most thought:

*The void reason.* "Required, but only when the line is voided" cannot be expressed by
making a column `NOT NULL`. The route handler validates it, but I also constrained the
three void columns as a group, so a line that is voided without a reason is not
something the table can hold. The application check produces a good error message; the
constraint makes the bad state impossible.

*The status transitions.* I could have written these as a trigger too, and the
database would then reject an illegal move outright. I deliberately did not. Goal 4
asks for the server to reject an invalid move "with a message explaining why", and a
Postgres exception makes a poor API error — I would end up parsing its text to build
the response. So the transition table lives in a service as a pure function, which
also means the legal and illegal moves can be unit tested without a database at all.
The cost is that a future code path could theoretically write a bad status directly;
I accepted that because every status change goes through the one service.

The timeline was the opposite call. Goal 9 says nothing in it can be edited or deleted
"including by managers", and I did not want that to rest on "the API happens not to
expose a route for it". The trigger makes it true of the table rather than true of the
current code.

## What I deliberately denormalised

**The price and name on each order line.** `unitPriceCents` and `menuItemName` are
copied onto the line when it is added, even though `menuItemId` already points at the
row they came from. Goal 3 requires totals to use "the menu items' current prices at
the time each line was added", so joining to the live menu item would mean a price
change tomorrow silently rewrites what a customer was charged today. The name follows
the same reasoning: renaming a dish should not rewrite last week's receipts.

**`readyAt` and `servedAt` on the order.** Both are derivable by scanning
`order_events` for the relevant status change. I copied them onto the order because
the dashboard asks for orders served today, revenue today, and a fourteen-day chart,
and none of those should require walking the event log. The cost is that two places
now hold the same fact, so they are written in the same transaction as the event.

**The alert state, which I deliberately did *not* store.** This one is the inverse and
it is the decision I am happiest with. The obvious design is an `acknowledged` boolean
on the order. It does not work. Goal 10 says that if the order is still not ready a
further set number of minutes later, the alert returns — and a boolean records *that*
an alert was acknowledged, not *when*, so there is nothing to compute the return time
from. It also only works once, and something would have to reset it, which means a
background job.

So acknowledgements are stored as rows with timestamps, many per order, and whether an
order is alerting is worked out when the alerts are requested: the order is not
archived, has not reached Ready, was placed more than the threshold ago, and its most
recent acknowledgement is either absent or older than the snooze window. The alert
comes back on its own when the window expires, the same order can be acknowledged any
number of times, and there is no scheduler to keep alive and nothing that can drift
out of step with the order.

**What I chose not to denormalise:** the order total. It is summed from the non-voided
lines every time it is needed rather than cached on the order. Lines can be added and
voided while an order is open, so a stored total would be one more thing to keep
correct, and summing a handful of rows is cheap.


## What the frontend actually sees

The tables above are not the shapes the browser receives, and the difference is
deliberate in three places.

**A user never arrives with a password hash.** Every response that includes a person —
the login response, `/me`, the primary waiter on an order, the actor on a timeline entry
— goes through one function that returns `id`, `email`, `name` and `role` and nothing
else. The hash exists in the table and does not leave the service layer.

**An order arrives with a total that no table contains.** `totalCents` is summed from
the non-voided lines each time an order is read. The browser does not add prices up, and
there is no column to fall out of date. This is the denormalisation I chose *not* to do,
and it is why the CSV export and the screen can never disagree: both call the same
function.

**Nothing about alerts is fetched, because nothing about alerts is stored.** The alerts
endpoint returns a computed list — table number, minutes open, whether it has re-armed —
assembled from the order timestamps and the most recent acknowledgement row. There is no
alert record to read, and the frontend has no way to ask for one.

The general shape is that the API returns what a screen needs to render, computed from
the tables, rather than the tables themselves. That is what keeps the browser free of
business logic: it cannot recalculate a total incorrectly if it never receives the
ingredients, and it cannot show a stale alert flag if no such flag exists.

One consequence worth noting for anyone reading the frontend code: `web/src/lib/types.ts`
describes these *response* shapes, not the tables. `OrderDetail` has `totalCents` and a
`collaborators` array with the user object attached; the `orders` table has neither.

## What would break first at 100x the data

Assume a busy restaurant at roughly three hundred orders a day. A hundred times that
is thirty thousand orders a day, around ten million orders and forty million order
lines a year.

**First to break: the total match count on the order list.** Goal 6 requires
pagination that shows the total number of matches, which means an exact
`COUNT(*)` over the filtered set on every request. Against millions of rows Postgres
has to scan every matching row to count them, and it has to do it again for every page
the user clicks. The page of twenty rows stays fast; the count next to it does not.
The fix is to stop insisting on an exact number — cap it at "1000+", use an estimate
from the query planner, or cache the count per filter combination and refresh it in
the background.

**Second: deep `OFFSET` pagination.** `LIMIT 20 OFFSET 40000` makes the database
produce forty thousand rows and throw them away. Page one is instant, page two
thousand is not. The fix is keyset pagination — remember the `(placedAt, id)` of the
last row and ask for rows after it — but that gives next and previous rather than
jump-to-page, so it changes what the interface can offer.

**Third: the dashboard's fourteen-day chart.** At thirty thousand orders a day that
aggregate scans roughly four hundred thousand rows on every dashboard load. The answer
is a daily rollup table written once per day, with the dashboard reading fourteen rows
instead of four hundred thousand.

**Fourth: the size of `order_events`.** It grows fastest of any table — six to ten
rows per order, so tens of millions a year. Reading one order's timeline stays fast
because of the `(orderId, createdAt)` index, but the table itself becomes the largest
thing to back up and vacuum. Monthly partitioning, or moving events older than a year
to cold storage, would be the move.

**What is already mitigated:** the total match count on the order list originally ran
inside the same transaction as the page query, so the two could never disagree. That had
to be removed for a different reason — Neon suspends idle databases, and an interactive
transaction on a cold start failed outright — but the effect at scale is the same
direction of travel: the exact count is the expensive part of that endpoint and is the
first thing that should stop being exact.

**What does not break, and why that matters:** the slow-order alert query. It looks
expensive because it joins to the acknowledgement history, but it only ever considers
orders that are open and not yet ready — and no restaurant has fifty thousand of those
at once, however many orders it has served over its lifetime. It is bounded by the
size of the current service, not by the size of the table. The dashboard aggregates
are the opposite: they are bounded by history, which is exactly why they are the ones
that need rolling up.
