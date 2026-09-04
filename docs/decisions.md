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

## Decision 13 — Where the browser keeps each token

- **Chose:** the access token in a JavaScript variable, in memory only; the refresh token in `localStorage`.

- **Rejected:** both in `localStorage`, and both in memory.

- **Why:** These two tokens have opposite properties, so storing them the same way would be wrong for one of them.

  The access token is a bearer credential: anything that can read it can act as the user for the next fifteen minutes, and there is nothing the server can do about it, because a JWT is verified by arithmetic and is not on any list to be removed from. Kept in `localStorage` it is readable by any script on the page at any time in the future — so a cross-site scripting bug found next month can read a token stored today. Kept in a module variable, an attacker's code has to be running in the same JavaScript context at the same moment. That is a meaningfully smaller window.

  The refresh token is the opposite. It carries no information, it can only be exchanged for a new pair, and it is revocable: a hashed copy is a row in the database. It also rotates on every use, so a stolen one works exactly once and its use logs the real owner out. Keeping it in `localStorage` is an accepted risk because it is the traceable, cancellable one — and the alternative is signing the user out on every page refresh, which is unusable.

  So the rule is: the credential that cannot be revoked is kept where it is hardest to reach, and the one that can be revoked is the one that persists.

  The cost is that a page reload destroys the access token. The application handles that by exchanging the stored refresh token for a new pair on boot, before rendering anything — which is why there are three session states rather than two, and why the route guard has to distinguish "still loading" from "signed out".

## Decision 14 — Concurrent token refreshes share one request

- **Chose:** a single in-flight refresh promise that every caller awaits.

- **Rejected:** letting each failed request refresh independently.

- **Why:** This one exists entirely because refresh tokens rotate, and it is the subtlest bug in the frontend.

  A screen like the order detail fires three requests at once. If the access token has just expired, all three come back `401`, and the obvious implementation has all three call `/api/auth/refresh`. The first succeeds — and in succeeding, revokes the token. The other two then present a token that died a millisecond earlier and are rejected, which clears the session and throws the user out to the login screen for no reason at all.

  It only happens under concurrency, only sometimes, and looks exactly like a broken backend. The fix is that the first caller starts the refresh and stores the promise; everyone else awaits the same promise; the slot is cleared when it settles.

  What I take from it is that rotation is not free. It buys something real — a stolen refresh token becomes visible instead of silent — and the price is paid in the client, in a place that has nothing obviously to do with security.

## Decision 15 — Server data is a cache, not component state

- **Chose:** TanStack Query for everything that comes from the API; `useState` only for things the browser owns.

- **Rejected:** `useEffect` plus `useState` in each component.

- **Why:** The distinction it forced is the useful part. Which dialog is open, what is typed in a field, which chart bar is hovered — the browser owns those, and `useState` is right. The orders are not mine: they are in Postgres, another user may be changing them, and my copy can be stale. That is a cache, and treating a cache like state is where the pain comes from.

  Doing it by hand means writing loading flags, error flags, refetch-after-mutation, deduplication of simultaneous identical requests, and cache invalidation, in every component, slightly differently each time. Query keys replace all of it with one idea: `['order', id]` names a cache entry, and anything that changes that order can say "this is stale" without knowing which components are showing it.

  Two concrete payoffs. Every order mutation invalidates the order, the order lists and the alerts in three lines. And the alerts badge in the navigation and the alerts page use the same key, so they are deduplicated into a single poll and cannot disagree with each other.

  Mutations refetch rather than patching the cache, because the server computes things the client cannot — the recalculated total, the new timeline event with its server timestamp. Patching by hand would mean reimplementing server logic in the browser, which is the same mistake as filtering in the browser.

  The trade-off is a dependency and a mental model to learn. For an application this size that is worth it; for a single screen with one fetch it would not be.

## Decision 16 — Order filters live in the URL

- **Chose:** every filter, sort and page is a query-string parameter, read with `useSearchParams`.

- **Rejected:** keeping them in component state.

- **Why:** State would have been slightly less code. The URL gives three things it cannot.

  The back button works, because each filter change is a history entry. A filtered view is a link — `?status=PLACED&mineOnly=false` can be pasted to a colleague and they see the same thing. And a page refresh keeps your place instead of silently resetting to the default view, which matters on a screen someone leaves open during a service.

  There is a fourth benefit I did not plan and now consider the most important. The query string is part of the TanStack Query cache key, so changing a filter changes the key, which means a different cache entry, which means a new request to the server. Goal 6 says not to load every order into the browser and filter there — with this design that is not a rule someone has to remember, it is the only thing the code is capable of doing.

  The cost is that every value arrives as a string and has to be parsed and defaulted on the way in.

## Decision 17 — The client keeps its own copy of the status transition table

- **Chose:** duplicate the transition table in the frontend, and use it only to decide which buttons to render.

- **Rejected:** asking the server which transitions are legal; or rendering every button and letting the server refuse.

- **Why:** Duplicating a rule is normally a mistake, so this one needs saying out loud: the server's copy is the **rule**, and it re-checks every request. The client's copy is a **hint** used to avoid offering an action that will be refused. If they ever drift, the server wins and the user sees the server's own explanation — the behaviour degrades, it does not become wrong.

  The alternative of asking the server is a network round trip to decide whether to draw a button, for an answer that is a pure function of a value the client already has. Rendering every button and letting the server refuse would work, but it means a screen that regularly offers actions that fail, which trains people to ignore error messages.

  The honest improvement — which I would make with more time — is for the order response to include an `allowedTransitions` array computed by the server. That removes the duplication without adding a round trip, because the information rides along with data the client was fetching anyway.

## Decision 18 — Alerts are polled, not pushed

- **Chose:** the alerts query refetches every twenty seconds; the navigation badge shares that query.

- **Rejected:** WebSockets or server-sent events.

- **Why:** A slow-order count that is up to twenty seconds out of date changes nothing about how anyone works — the threshold it is reporting on is fifteen minutes.

  Against that, a persistent connection has to be kept alive, reconnected when it drops, and debugged when it dies silently; it needs the hosting tier to support long-lived connections, which a free tier may restart at any time; and it would be a second mechanism to maintain alongside the request/response path everything else uses.

  There is also a design consistency argument. The alerts feature already avoids a background job by deriving alert state at query time. Adding a push channel would reintroduce exactly the kind of always-running component that decision 3 was written to remove.

  Because the badge and the alerts page share one query key, the polling costs one request every twenty seconds regardless of how many components display it.

  If this were a kitchen display mounted on a wall, where seconds matter and the screen is never touched, I would revisit it.

## Decision 19 — The fourteen-day chart is hand-built

- **Chose:** about forty lines of markup driven by the array the API returns.

- **Rejected:** Recharts, or any charting library.

- **Why:** It is one series of fourteen values on a bar chart. Configuring a library to draw that would have been comparable in size to drawing it, and would have added a dependency and bundle weight to a frontend that otherwise ships very little.

  The two things that actually needed thought are not things a library gives you for free either. Days with no orders get a two-pixel stub rather than nothing, so a zero reads as "nothing happened here" instead of as a missing bar. And only every third date is labelled, because fourteen labels in that width collide.

  The reason those matter at all is upstream: the API always returns fourteen entries, including days with zero, because the query generates the date series and left joins counts onto it. If quiet days were dropped the chart would draw Monday next to Wednesday and a slow Tuesday would look like a Tuesday that never happened.

  Where I would use a library is anything with multiple series, axes that need real scales, or interactive zooming. None of that is here.

## Decision 20 — The default order filter depends on the role (reversed)

- **Originally chose:** *Only my orders* ticked by default for everybody. A waiter's working list is their own orders, and the checkbox is right there if they want to see the rest.

- **Reversed to:** the default is now derived from the role — ticked for a waiter, unticked for a manager.

- **Why the first version was wrong:** it was correct and useless. Goal 1 says a manager "can see and act on every order", so every order *is* the manager's view of the restaurant; a manager typically owns none, because managers do not wait tables. So the first screen a manager saw after signing in was an empty list with a "no orders match these filters" message. Nothing was broken, and the fix was one click, but a blank screen thirty seconds into someone's first look at the system reads as a broken deployment, not as a filter doing its job.

  I found it the way it should be found — by signing out and signing in as each seeded account in turn to check what the first screen actually looks like, rather than by testing the filter I had just written and moving on.

- **What it cost:** the default is now conditional rather than constant, which is a small amount of extra state to hold in your head when reading the component. The comment carries the reason so the next person does not "simplify" it back.

- **What I rejected:** seeding a couple of orders under the manager's name so the original default had something to show. That fixes the screenshot and not the problem — a real restaurant's manager still owns nothing, so the empty page would just move from my seed data to their first day.

- **The general point:** a default is a product decision, not a technical one. Both versions of this line pass every test I could write for it. The difference only shows up when you ask what the person in front of the screen is actually there to do, and the answer turned out to be different for the two roles using the same page.
