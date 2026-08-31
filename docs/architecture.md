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

The backend is organized into routes, services, and database access.

```text
routes/
   |
   v
services/
   |
   v
prisma/
   |
   v
PostgreSQL
```

Routes handle HTTP-specific work such as parsing requests, validating input with Zod,
calling the appropriate service, and returning the response.

Services contain the main application logic. This includes checking whether a user can
act on an order, validating order status transitions, calculating totals, handling
price snapshots, and creating timeline events.

Prisma is used for ordinary database access, where the generated types catch mistakes
at compile time. The dashboard queries are the exception and are written as SQL by
hand, because the fourteen-day chart has to include days on which no orders were
served, which means generating the date series in the database and left joining the
order counts onto it.

The API and the migration tooling reach the database over two different connections.
The running API uses Neon's pooled connection through Prisma's Postgres driver
adapter, because a web service makes many short queries and a pooler is the right
shape for that. Schema migrations use the direct connection instead, because they run
DDL and expect a persistent session, which a transaction pooler does not provide. The
pooled string is supplied where the client is constructed; the direct string lives in
Prisma's config file, which only the CLI reads.

Authentication and error handling are handled through middleware, while shared
utilities such as JWT handling, CSV generation, and date-related functions are kept
separately.

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

## Where work happens

Searching, filtering, sorting and pagination of orders all run in the database. The
order list endpoint takes the search term, status, waiter, date range, sort field and
page as query parameters, and returns one page of results together with the total
number of matches. The browser never receives more orders than it displays, and it
never filters a list itself. The same applies to the dashboard figures and to the CSV
export, both of which are aggregated in SQL rather than assembled in the client.

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

The order status update and its status-change event are written together in a
transaction so that the order and its history cannot become inconsistent.

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
actually charged.

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
