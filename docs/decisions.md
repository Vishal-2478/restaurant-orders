# Decisions

## Decision 1 — PostgreSQL instead of MongoDB

- **Chose:** PostgreSQL with Prisma. I plan to use raw SQL only where it makes sense for dashboard/aggregate queries.

- **Rejected:** MongoDB, and using Prisma for absolutely every query.

- **Why:** The data in this project is mostly relational. An order has multiple order lines, and waiters can collaborate on multiple orders. The order history also needs to stay consistent and should not be editable later.

  PostgreSQL gives me useful database-level constraints for this, such as foreign keys and unique constraints. It also makes the relationships easier to model and query.

  I still prefer Prisma for the normal CRUD operations because it gives me typed database access and keeps most of the application code simpler. For some dashboard queries, especially the fourteen-day order data, raw SQL is easier to write and understand than trying to express everything through the ORM.

  That last point turned out to be more than a preference. The fourteen-day chart has to include days on which nothing was served, and an ORM has no way to express "rows that do not exist" — the query has to generate the date series in the database and left join the counts onto it. So the split between Prisma and raw SQL ended up falling exactly where I guessed it would, for a more concrete reason than I had at the time.

## Decision 2 — JWT authentication

- **Chose:** JWT-based authentication with a short-lived access token and a refresh token.

- **Rejected:** Using httpOnly cookies as the main authentication mechanism.

- **Why:** I am hosting the frontend and backend separately, with the frontend on Vercel and the API on Render. This makes cookie-based authentication more complicated because of cross-origin requests. An authentication cookie set by the API would be a third-party cookie from the frontend's point of view, and Safari blocks those by default — a reviewer opening the demo on an iPhone would not be able to log in at all.

  JWTs make the frontend/API setup more straightforward. The access token is sent with API requests in the `Authorization` header, and the backend verifies the token and identifies the current user and their role without needing any shared session storage.

  The access token lives for fifteen minutes and is held in memory. The refresh token lives for seven days, is stored in `localStorage`, and is **rotated on every use** — each refresh revokes the token that was presented and issues a new one. That means a stolen refresh token works exactly once, and using it logs the legitimate owner out, which turns a silent theft into something the real user notices.

  The main trade-off is that token storage has security considerations, especially around XSS. I keep the access token short-lived, avoid rendering unsafe HTML in the frontend, and store only a hash of each refresh token in the database, so a leaked database does not hand out working sessions.

  If the frontend and backend were hosted under the same origin, I would be more inclined to use httpOnly cookies.

## Decision 3 — Slow-order alerts are worked out when they are asked for

- **Chose:** Store acknowledgements as rows with timestamps, and derive whether an order is currently alerting at query time.

- **Rejected:** An `acknowledged` boolean on the order, and a background job that writes alert rows on a timer.

- **Why:** This is the requirement I spent the most time on, because the obvious design does not work.

  Goal 10 says an acknowledged alert comes back if the order still is not ready a set number of minutes later. A boolean records that an alert was acknowledged but not when, so there is nothing to calculate the return time from. It also only works once — something would have to set it back to false, and the only thing that could is a scheduled job.

  Instead there is no alert state stored anywhere. Each acknowledgement is its own row with a timestamp, and the alerts endpoint works out the answer from three things it already knows: the order has not reached Ready, it was placed more than the threshold ago, and its most recent acknowledgement is either absent or older than the snooze window.

  The alert then returns by itself when the window passes. The same order can be acknowledged as many times as needed. There is no worker to keep running on a free hosting tier, and there is no stored alert that can disagree with the order it describes.

  The trade-off is that the alerts endpoint does slightly more work per request than reading a flag would. That is fine here, because the query only ever looks at orders that are currently open, and a restaurant does not have a large number of those at any one time.

  One consequence I did not anticipate until I wrote the tests: because the rule is a pure function of `placedAt`, the last acknowledgement, and "now", I can test the entire re-arm behaviour without waiting for real minutes to pass. The tests say "pretend it is now 10:26" and assert that an order acknowledged at 10:16 is alerting again. A design built on a boolean and a scheduler could not be tested that way at all.

## Decision 4 — Money stored as integer cents

- **Chose:** Store all money as an integer number of cents, and divide by 100 only when displaying it.

- **Rejected:** A floating point number, and Postgres `NUMERIC(10,2)`.

- **Why:** Floating point cannot represent most decimal fractions exactly. In JavaScript `0.1 + 0.2` is `0.30000000000000004`, and an order total that does not add up correctly is not something I want to explain to anyone.

  `NUMERIC` is exact and would have been a reasonable choice. I did not use it because Prisma maps it to a `Decimal` object rather than a plain number, which needs a library to do arithmetic and serialises awkwardly to JSON. Integers are exact, sort and sum normally, and go over the wire as numbers.

  The cost is that every display point has to remember to divide by 100, so the conversion is kept in one formatting helper rather than spread through the components.

## Decision 5 — Some rules are enforced in the database as well as the application

- **Chose:** Put `CHECK` constraints and a trigger in the database for the rules that must always hold, in addition to validating them in the API.

- **Rejected:** Validating everything only in the route handlers.

- **Why:** Validation in the application produces good error messages, and I kept it. But it is a statement about how the code happens to be written today. A `CHECK` constraint is a statement about what the table can hold.

  The clearest case is Goal 9, which says the order timeline cannot be edited or deleted after the fact, including by managers. I did not want that to rest on the API not exposing a route. There is a trigger on the events table that raises on any `UPDATE` or `DELETE`, so it is true of the table itself.

  I tested this rather than assuming it. Logged into Neon's SQL editor as the database owner — the highest privilege that exists on that database, higher than any manager account the application could ever create — I ran a `DELETE` against `order_events` and got back `ERROR: order_events is append-only; DELETE is not permitted on this table (SQLSTATE 23001)`. An `UPDATE` was refused the same way. "I added a trigger" is a claim; "I tried to delete a row as the database owner and Postgres refused" is evidence.

  The void reason is the other one. "Required, but only when the line is voided" cannot be written as `NOT NULL`, so the three void columns are constrained as a group — either all of them are empty, or all of them are filled and the reason is not blank.

  I did not do this for the status transitions, even though I could have. Goal 4 asks the server to reject an illegal move with a message explaining why, and a Postgres exception makes a poor API error — I would end up parsing its text to build a response. The transition rules live in a service instead, which also means they can be unit tested without a database.

## Decision 6 — Table numbers are integers

- **Chose:** Store `tableNumber` as an integer.

- **Rejected:** Storing it as text.

- **Why:** Goal 6 asks for both text search over the table number and sorting by table. Those pull in opposite directions. Sorting text puts table 10 before table 9, which is wrong in a way a user would notice immediately. Sorting integers is correct.

  The cost is on the search side: searching an integer column is an exact match rather than a partial one, so typing `1` finds table 1 and not tables 1, 10 and 12. I think that is the better behaviour anyway — partial matching on a number is confusing — but it is a real narrowing of what the brief asked for, so I am recording it rather than leaving it to be discovered.

  A restaurant that labels tables `P4` or `Bar 2` would need this to be text, and would then need a separate sort key.

## Decision 7 — How the application connects to the database

- **Chose:** Neon's pooled connection string for the running API, and the direct connection string for schema migrations.

- **Rejected:** Using one connection string for both.

- **Why:** Neon offers a pooled connection that multiplexes many short-lived queries over a small number of real connections, which is the right thing for a web API on a free tier that may be restarted often. But migrations run DDL and expect a persistent session, which a transaction pooler does not give them, so migrations use the direct connection.

- **Later reversed:** I originally set this up the way Prisma 6 does it, with a `directUrl` field alongside `url` inside the `datasource` block in `schema.prisma`. That does not work on Prisma 7, which is the version I am using. Prisma 7 removed `directUrl` and moved the datasource URL out of the schema file entirely into `prisma7.config.ts`, and it also requires the runtime client to be constructed with a driver adapter rather than reading a URL from the schema.

  So the configuration is now split differently from how I first wrote it: the direct URL goes in the Prisma config file, because that file is only read by the CLI, and the pooled URL is passed to the `@prisma/adapter-pg` adapter when the client is created, because that is what the running API uses. I found this out by checking the Prisma 7 upgrade guide after the first setup did not behave the way I expected. The end result is actually clearer than what I started with — each connection string now sits in the place that uses it, instead of both being listed together in a file where the difference was not obvious.

## Decision 8 — TLS certificates are verified, not just assumed

- **Chose:** `sslmode=verify-full` on both connection strings.

- **Rejected:** Leaving `sslmode=require`, which is what Neon's connection strings come with.

- **Why:** I noticed a warning from `pg-connection-string` while running the seed script and followed it up rather than ignoring it, and the answer was more interesting than I expected.

  In PostgreSQL's own terms, `sslmode=require` means "encrypt this connection, but do not check who you are talking to". Someone who can intercept the traffic can present their own certificate and the client will connect happily. `verify-full` means "encrypt it, check the certificate was issued by a trusted authority, and check the hostname matches".

  node-postgres has historically been stricter than the specification and quietly treated `require` as full verification. So my connections were actually being verified — by accident. The warning was telling me that `pg` v9 is changing to match libpq, at which point the exact same connection string would silently stop verifying certificates. No error, no failed request, just a weaker connection after a routine dependency upgrade.

  Neon documents `verify-full` as its recommendation, and its certificates are issued by Let's Encrypt, whose root is already in Node's trust store — so there was no certificate file to manage and no cost to the change.

  The general principle I took from it: a setting that is safe by accident is worth making safe on purpose, because accidents do not survive upgrades.

## Decision 9 — The bulk menu update is deliberately not a transaction

- **Chose:** Update each item in the bulk request independently, collecting a per-item result.

- **Rejected:** Wrapping the whole batch in a transaction.

- **Why:** This is one of the few places where the obviously "safer" database technique is the wrong one, and the brief is unusually explicit about it: the result must report per item what succeeded and what was rejected and why, and one bad item must never fail the whole batch.

  A transaction is all-or-nothing. That is exactly the behaviour being ruled out. A manager updating twenty prices before a dinner service should not lose nineteen good edits because the twentieth item happens to have been archived last week — especially since the failure is not an error in any meaningful sense, it is information the manager needs.

  So the loop runs outside any transaction, each item is its own write, and every failure — item not found, item archived, no change supplied, the same item listed twice, a negative price — is caught and reported alongside the successes.

  The endpoint returns `200`, not a partial-success status. The request itself succeeded; reporting that one item was rejected is the endpoint doing its job, not failing at it. The response body carries `updated`, `failed`, and a row per item so the interface can show exactly which lines went through.

  The trade-off is that a caller who wanted all-or-nothing semantics cannot get them here. That is the correct default for this feature, but it would be the wrong default for, say, applying a percentage increase across a whole category, where a half-applied change would be worse than none.

## Decision 10 — The order list count is not transactional

- **Chose:** Run the page query and the total count as two independent reads.

- **Rejected:** Wrapping both in `prisma.$transaction([...])` so they always describe the same snapshot.

- **Why, and later reversed:** I originally wrapped them. The reasoning was sound on paper: Goal 6 requires a page of results *and* a total match count, and if an order is created between the two queries the response can say "showing 20 of 47" when there are really 48. A transaction makes that impossible.

  It broke in a way I would not have predicted from reading the code. The first request after the API had been idle for a while failed with `P2028 Unable to start a transaction in the given time`. Two causes had stacked up. Prisma waits two seconds by default to acquire a transaction slot, and Neon's free tier suspends a database that has not been used recently and takes several seconds to wake up. So the request asked for a transaction before there was a database awake to give it one, waited two seconds, and gave up. The endpoint returned a 500 rather than a page of orders.

  The first fix offered to me was to raise the timeout, and I did raise it — the transactions that genuinely need to be atomic, every order mutation together with its timeline event, now have limits generous enough to survive a cold start. But raising a timeout treats the symptom. The better question was why a read-only list query needed a transaction at all.

  It did not. The guarantee I was buying is worth very little in this context: the worst case is a count computed a few milliseconds before the page, on a list the user is going to re-fetch as soon as they click anything. What it cost was the endpoint working at all on the first request after a quiet period — which, on a free tier that a reviewer will open once, is close to every request that matters.

  So the transaction came out of the list query and stayed everywhere it earns its place. What I took from it is that a correctness guarantee has a price, and it is worth asking explicitly whether the thing being guaranteed is worth what the guarantee costs. It is also the clearest example in this project of a bug that no amount of unit testing could have found, because it only appears against a real database that has been asleep.

## Decision 11 — Days are bucketed in the restaurant's timezone

- **Chose:** Convert every timestamp through `RESTAURANT_TIMEZONE` before taking a date, in all four dashboard queries and the CSV export.

- **Rejected:** Comparing stored timestamps against `current_date` directly.

- **Why:** Prisma stores timestamps as UTC. Kolkata is UTC+05:30. So an order served at half past midnight local time was served at seven in the evening *the previous day* in UTC.

  The obvious query — `WHERE "servedAt"::date = current_date` — therefore silently drops the first five and a half hours of every restaurant day from every figure on the dashboard. It does not error. It does not warn. It just returns a smaller number than the truth, and the only way anyone would find out is by comparing the dashboard against the till at the end of a shift.

  I did not want to take this on trust, so I installed PostgreSQL locally, built the same schema, and seeded orders that deliberately straddled the boundary — including one served at 00:30 IST, which is 19:00 UTC the day before. Running both versions of the query against the same database at the same moment returned **2** for the timezone-aware version and **1** for the naive one.

  The timezone is an environment variable rather than a constant in the code, because it is a property of the restaurant rather than of the software. A second location in a different timezone would need its own value, not a code change.

  There is a cost: the conversion means these queries cannot use a plain index on `servedAt` for the date comparison. At the data volumes this application will ever see that does not matter, and the alternative — storing a pre-computed local date column — would mean maintaining a denormalised value for the sake of an optimisation nothing needs yet.

## Decision 12 — UUIDv7 primary keys

- **Chose:** UUID version 7 for every primary key.

- **Rejected:** Auto-incrementing integers, and UUID version 4.

- **Why:** Auto-incrementing integers leak information. A reviewer who creates an account and sees `id: 4` learns how many users exist; an order numbered 1,203 tells a competitor roughly how much business the restaurant has done. That is a small thing here and a real one in production, and the fix costs nothing at this scale.

  Version 4 UUIDs solve that but are entirely random, so consecutive inserts land in unrelated places in the index and the database ends up writing to many different pages for what is logically one sequence of rows.

  Version 7 puts a millisecond timestamp in the leading bits. The values are still unique and still unguessable in the part that matters, but they sort chronologically — so rows created near each other in time sit near each other in the index, and ordering by id is approximately ordering by creation. Prisma 7 supports it directly with `@default(uuid(7))`, so it was a one-word choice rather than a piece of engineering.
