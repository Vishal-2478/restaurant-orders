# Decisions

## Decision 1 — PostgreSQL instead of MongoDB

- **Chose:** PostgreSQL with Prisma. I plan to use raw SQL only where it makes sense for dashboard/aggregate queries.

- **Rejected:** MongoDB, and using Prisma for absolutely every query.

- **Why:** The data in this project is mostly relational. An order has multiple order lines, and waiters can collaborate on multiple orders. The order history also needs to stay consistent and should not be editable later.

  PostgreSQL gives me useful database-level constraints for this, such as foreign keys and unique constraints. It also makes the relationships easier to model and query.

  I still prefer Prisma for the normal CRUD operations because it gives me typed database access and keeps most of the application code simpler. For some dashboard queries, especially the fourteen-day order data, raw SQL is easier to write and understand than trying to express everything through the ORM.

## Decision 2 — JWT authentication

- **Chose:** JWT-based authentication with a short-lived access token and a refresh token.

- **Rejected:** Using httpOnly cookies as the main authentication mechanism.

- **Why:** I am planning to host the frontend and backend separately, with the frontend on Vercel and the API on Render. This makes cookie-based authentication more complicated because of cross-origin requests.

  JWTs make the frontend/API setup more straightforward. The access token can be sent with API requests using the `Authorization` header, while the backend can verify the token and identify the current user and their role.

  The main trade-off is that token storage has security considerations, especially around XSS. I will keep the access token short-lived and avoid unsafe HTML rendering in the frontend.

  If the frontend and backend were hosted under the same origin, I would be more inclined to use httpOnly cookies.

## Decision 3 — Slow-order alerts are worked out when they are asked for

- **Chose:** Store acknowledgements as rows with timestamps, and derive whether an order is currently alerting at query time.

- **Rejected:** An `acknowledged` boolean on the order, and a background job that writes alert rows on a timer.

- **Why:** This is the requirement I spent the most time on, because the obvious design does not work.

  Goal 10 says an acknowledged alert comes back if the order still is not ready a set number of minutes later. A boolean records that an alert was acknowledged but not when, so there is nothing to calculate the return time from. It also only works once — something would have to set it back to false, and the only thing that could is a scheduled job.

  Instead there is no alert state stored anywhere. Each acknowledgement is its own row with a timestamp, and the alerts endpoint works out the answer from three things it already knows: the order has not reached Ready, it was placed more than the threshold ago, and its most recent acknowledgement is either absent or older than the snooze window.

  The alert then returns by itself when the window passes. The same order can be acknowledged as many times as needed. There is no worker to keep running on a free hosting tier, and there is no stored alert that can disagree with the order it describes.

  The trade-off is that the alerts endpoint does slightly more work per request than reading a flag would. That is fine here, because the query only ever looks at orders that are currently open, and a restaurant does not have a large number of those at any one time.

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
