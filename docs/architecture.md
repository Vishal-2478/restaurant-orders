# Architecture

## System overview

The application is split into a React frontend, an Express API, and a PostgreSQL database.

The React application is hosted on Vercel and handles the UI, forms, navigation, and
client-side state. The Express API is hosted on Render and handles authentication,
authorization, order rules, menu operations, calculations, and audit events.
PostgreSQL is hosted on Neon and stores the application data.

Vercel serves the frontend as static files. Once those files have loaded, the React
application runs in the browser and makes its own requests directly to the API on
Render. Vercel is not involved in those requests. This is why the API needs CORS
configured for the frontend's origin, and it is also the reason the access token is
sent in an `Authorization` header rather than a cookie: the two halves are on
different origins, so a cookie set by the API would be a third-party cookie and
several browsers block those.

```text
  Browser
    |
    |-- (1) first load: HTML, CSS, JS ---------> Vercel (static React build)
    |
    |-- (2) every data request: HTTPS / JSON --> Express API (Render)
             with a JWT in the                        |
             Authorization header                     | Prisma
                                                      v
                                              PostgreSQL (Neon)
```

Business rules are kept on the server. The frontend can hide or disable actions that
a user cannot perform, but the API checks the permissions again for every protected
operation.

## Backend structure

The backend is organized into routes, services, pure library functions, and database
access.

```text
routes/          lib/
   |         (pure functions,
   v          no I/O at all)
services/  <-------'
   |
   v
prisma/
   |
   v
PostgreSQL
```

Routes handle HTTP-specific work such as parsing requests, validating input with Zod,
calling the appropriate service, and returning the response. They contain no business
rules of their own.

Services contain the main application logic. This includes checking whether a user can
act on an order, validating order status transitions, calculating totals, handling
price snapshots, and creating timeline events.

`lib/` holds the parts of the logic that need nothing from the outside world: the
status transition table, the slow-order alert rule, the order total calculation, the
CSV writer, the duration parser, and the password and token helpers. Keeping these
separate is not just tidiness. A function's dependencies are inherited by everyone who
imports it, and I found that out the hard way — the total calculation was originally
written inside the order service, and its first unit test failed immediately, because
importing that file pulls in the Prisma client, which pulls in environment validation,
which refuses to start without a database URL. A piece of arithmetic had acquired a
dependency on a connection string. Moving it into its own import-free file fixed it,
and that is now the rule I use to decide where a function belongs.

Prisma is used for ordinary database access, where the generated types catch mistakes
at compile time. The dashboard queries are the exception and are written as SQL by
hand, because the fourteen-day chart has to include days on which no orders were
served, which means generating the date series in the database and left joining the
order counts onto it. An ORM has no way to express "rows that do not exist", and a
plain `GROUP BY` would return only the days that had activity — so a quiet Tuesday
would vanish from the chart rather than showing as a zero, and the trend line would be
misleading rather than merely incomplete.

The API and the migration tooling reach the database over two different connections.
The running API uses Neon's pooled connection through Prisma's Postgres driver
adapter, because a web service makes many short queries and a pooler is the right
shape for that. Schema migrations use the direct connection instead, because they run
DDL and expect a persistent session, which a transaction pooler does not provide. The
pooled string is supplied where the client is constructed; the direct string lives in
Prisma's config file, which only the CLI reads. Both use `sslmode=verify-full`, so the
server's certificate is actually checked rather than the connection merely being
encrypted.

Authentication and error handling are handled through middleware. The error handler is
registered last, after every route, because Express only forwards a thrown error to
handlers registered after the code that threw it. It recognises three cases: an
application error carrying its own status code and message, a Zod validation failure
which becomes a `400` with per-field details, and anything else, which is logged
server-side and returned to the client as a generic `500` so that internal details do
not leak.

Keeping the order lifecycle rules in a service also makes them easier to test
independently. For example, the valid and invalid status transitions can be checked
without making an HTTP request or connecting to the database.

## Request flow

One example is a waiter changing an order from `ACCEPTED` to `PREPARING`.

1. The waiter selects Start preparing in the order details page. The frontend sends a
   request to `POST /api/orders/:id/status` with the body:

   ```json
   { "to": "PREPARING" }
   ```

   The request also contains the JWT access token in the `Authorization` header.

2. The request goes from the browser straight to the Express API running on Render.
   Because the frontend and the API are on different origins, the browser first sends
   a preflight `OPTIONS` request, which the API's CORS configuration answers by
   allowing the frontend origin and the `Authorization` header.

3. Authentication middleware verifies the JWT and obtains the user's ID and role. A
   missing, invalid, or expired token results in `401 Unauthorized`.

4. The request body is validated with Zod. Invalid input, such as an unsupported
   status value, results in `400 Bad Request`.

5. The service loads the requested order and its collaborators. If the order does not
   exist, the API returns `404 Not Found`.

6. The server checks whether the current user is allowed to modify the order. A
   manager, the primary waiter, or an assigned collaborator can act on it. If the user
   is not allowed to act on the order, the API returns `403 Forbidden`.

7. The current order status is checked against the allowed transition rules. For
   example, `ACCEPTED → PREPARING` is valid, while moving an already `SERVED` order
   back to `PREPARING` is not. An invalid transition returns `409 Conflict` with an
   explanation of the problem.

8. The status update and the corresponding timeline entry are written in the same
   database transaction. The timeline entry records the previous status, new status,
   user who made the change, and timestamp. If either database operation fails, the
   transaction is rolled back, so the order and its history cannot disagree.

9. The API returns the updated order with `200 OK`. The frontend refreshes the
   relevant order data so the order list and details page show the new status.

This same server-side approach is used for the other protected operations in the
application. The UI is not treated as the security boundary.

Steps 3 and 6 are worth separating explicitly, because they answer different questions
and I tested them separately. Step 3 asks "who are you", and its failure is a `401`.
Step 6 asks "may you do this to this particular thing", and its failure is a `403`.
Logging in again fixes the first and cannot fix the second. A waiter holding a
perfectly valid token gets a `403` on another waiter's order, and the same request with
the same token succeeds once that waiter has been added as a collaborator — nothing
about the person changed, the order did.

## Permissions

Authorization happens in two layers, because the brief asks two different kinds of
question.

The coarse layer is middleware. `requireAuth` establishes who the caller is, and
`requireRole('MANAGER')` gates the endpoints where the answer depends only on the
person: creating staff accounts, creating and editing menu items, bulk price changes.
It never needs to look at the thing being acted on.

The fine layer is a service function, `canActOnOrder(user, order)`. A manager may act
on any order; a waiter may act on an order only if they are its primary waiter or have
been added as a collaborator. It takes only the fields it actually needs — who owns the
order and who is on it — rather than a full Prisma model, which keeps it a pure
function and makes it testable with plain object literals.

There are two exported forms. `canActOnOrder` returns a boolean, for anywhere that
wants to decide rather than fail. `assertCanActOnOrder` throws the `403` instead, and
that is what the services call, so a missing permission check is a missing line of code
rather than a return value someone forgot to look at.

Waiters can *view* any order but only *act* on their own. That was an ambiguity in the
brief that I resolved deliberately rather than by accident: a restaurant is a shared
workspace and staff need to see what is happening at other tables, but changing someone
else's order is a different matter.

## Where work happens

Searching, filtering, sorting and pagination of orders all run in the database. The
order list endpoint takes the search term, status, waiter, date range, sort field and
page as query parameters, and returns one page of results together with the total
number of matches. The browser never receives more orders than it displays, and it
never filters a list itself. The same applies to the dashboard figures and to the CSV
export, both of which are aggregated in SQL rather than assembled in the client.

The slow-order alerts follow the same principle but with an important difference: there
is no alert state stored anywhere to fetch. The endpoint queries for orders that are
open, not yet Ready, and older than the threshold, brings back each one's most recent
acknowledgement, and applies a pure function to decide whether it is currently
alerting. Nothing is written, nothing is scheduled, and an acknowledged alert reappears
by itself once the snooze window passes.

That query is bounded by the number of orders currently open rather than by the number
of orders ever placed, which is why it does not get slower as the history grows — the
opposite of the dashboard aggregates, which are bounded by history and are the first
thing that would need rolling up at scale.

The bulk menu update deliberately does *not* run in a transaction. The brief requires
per-item results and says one bad item must never fail the whole batch, which is the
exact opposite of all-or-nothing semantics.

## Database and data integrity

PostgreSQL is used because the data has several relationships that fit naturally into
a relational database. An order has multiple order lines, and waiters can collaborate
on multiple orders while an order can have multiple collaborators. Foreign keys and
uniqueness constraints are used for relationships where the database can enforce the
rule directly.

Order history is kept separately from the current order state. Status changes, line
additions and voids, and notes are recorded as timeline events rather than by
modifying existing history. This is enforced in two places rather than one. There is
no route in the API that updates or deletes a timeline event, and the database itself
has a trigger that rejects `UPDATE` and `DELETE` on that table, so the history cannot
be rewritten even by a manager, and not by a stray query either.

I verified this rather than assuming it. Connected to Neon as the database owner — a
higher privilege than any account the application can create — a `DELETE` against
`order_events` is refused with `ERROR: order_events is append-only; DELETE is not
permitted on this table`, and an `UPDATE` is refused the same way.

The order status update and its status-change event are written together in a
transaction so that the order and its history cannot become inconsistent. The same is
true of every other mutation: adding a line, voiding a line, adding or removing a
collaborator, archiving and restoring. In each case the change and the record of the
change succeed together or not at all, because a history with silent gaps in it is
worse than no history — you would trust it.

A small number of other rules are also enforced by the database rather than only by
the API: prices and quantities cannot be negative, table numbers must be positive, and
a voided line must carry a reason. That last one is a grouped constraint rather than a
`NOT NULL`, because the reason is only required when the line is actually voided.
These duplicate checks the application already performs. The point of having them in
both places is that the application check produces a readable error message, while the
constraint makes the invalid state impossible to store at all.

The price used for an order line is stored on the line when the line is added. This
means changing the menu item's price later does not change the price of an order line
that already exists, and a total calculated today still reflects what the customer was
actually charged. This is easy to demonstrate: change a menu item's price through the
API and re-fetch an order that already contains it, and the order's total does not
move.

## Testing

There are thirty-six unit tests, and they cover the parts of the system where the rules
live rather than the plumbing that carries them.

- **The status transition table** — every legal move, every illegal one, the terminal
  states, and the exact wording of the rejection reasons.
- **The access policy** — manager, primary waiter, collaborator, and an unrelated
  waiter, with and without collaborators present.
- **Order totals** — multiplication by quantity, summing, excluding voided lines, and
  a case that would drift if the arithmetic were done in floating point.
- **The alert rule** — the threshold boundary, the snooze window, the re-arm, repeated
  acknowledgement, and a stale acknowledgement failing to suppress a fresh alert.
- **The CSV writer** — quoting, embedded quotes and newlines, empty values, and
  neutralising strings that a spreadsheet would otherwise execute as a formula.

These are all pure functions, which is what makes them worth testing at this level:
they can be called directly with plain values, and the alert tests in particular can
simulate "twenty-six minutes later" without waiting for it.

The endpoints themselves were verified by hand against the real database — including
the cross-account `403`, the same request succeeding after a collaborator was added,
the `409` with a readable reason, refresh-token rotation and reuse, logout revocation,
per-item bulk results, and the append-only trigger.

Two bugs found this way could not have been caught by unit tests at all: the transaction
timeout on a cold-started database, and a timezone error in the dashboard aggregates
that returned a plausible but wrong number. Both are recorded in `decisions.md`.

## Things I did not build

I kept the implementation focused on the required functionality.

* **WebSockets or server-sent events.** Slow-order alerts use polling instead. The
  alert count can be slightly delayed without affecting the main order workflow, so a
  persistent connection was not necessary.
* **Background job scheduler for alerts.** Slow orders are calculated when the alert
  data is requested, using the order timestamps and acknowledgement information. This
  avoids maintaining a separate worker just for alerts, and removes any possibility of
  a stored alert drifting out of step with the order it describes.
* **Real-time kitchen display.** This was an optional stretch feature, so it was left
  out in favour of completing the required order workflow.
* **Table management, payments, and split checks.** These were also optional features
  and were outside the required scope.
* **Menu item image uploads.** The assignment does not require images, so adding file
  storage and image processing would add complexity without helping with the required
  goals.
* **Password reset and email flows.** The application uses manager-created and seeded
  demo accounts, so a complete email-based account recovery flow was not included.
* **Integration tests over HTTP.** Supertest is installed and the app is exported
  without calling `listen()` specifically so that it could be imported into tests. With
  the time available I chose to unit test the rules thoroughly and verify the endpoints
  by hand, rather than the other way round. If I had another few hours this is the
  first thing I would add.
