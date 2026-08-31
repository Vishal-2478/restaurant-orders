# Plan

## Session log

I split the work into a few sessions so that I could finish the backend rules before building the frontend around them.

| Session | Planned work | Estimated | Actual |
|---|---|---:|---:|
| 1 | Project setup, database schema, Prisma setup, authentication and roles | 2.5h | 5h |
| 2 | Menu management, orders, order lines, price snapshots and order status | 2.5h | |
| 3 | Collaborators, order history, search/filtering, pagination and remaining backend features | 2.5h | |
| 4 | Frontend setup, login, menu and order screens | 2.5h | |
| 5 | Dashboard, alerts, bulk actions, CSV export and deployment | 2.5h | |
| 6 | Testing, fixing issues, documentation and final verification | 2h | |

The estimates are only a starting point. I will fill in the actual time after each session and update the plan if the implementation takes a different direction.

## How I split the work

I wanted to work from the database and backend towards the UI.

The first sessions focus on the data model and the rules because several requirements depend on them. For example, order lines need to keep the price from when they were added, orders have specific allowed status transitions, and waiters can only modify orders they are allowed to access.

Once these rules are working on the backend, the frontend can use the API without having to duplicate the same business logic.

After the core order flow is working, I will add the search, dashboard, bulk operations and alerts, followed by the final UI work and deployment.

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

The main reason for this order is that the backend contains most of the important rules in the assignment. I would rather have those rules working first and build the UI around them than finish several screens and later change the API or database structure underneath them.

## What I estimated versus what it took

I will record the actual time after each session. If something takes significantly longer than expected, I will also note what caused the difference.

### Session 1

Estimated 2.5 hours, took _fill in_.

Most of the difference was setup rather than design. Three things cost more time than
I had allowed for:

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

## What I cut when I ran short

If I run short on time, I will prioritize the ten required goals over the optional stretch features. I will record any required functionality that is incomplete rather than marking it as finished.

The order I would cut in, if it comes to it:

1. The unit tests beyond the permission and status-transition ones. Those two are the
   rules the brief is most specific about, so they stay regardless.
2. Menu item categories and descriptions in the interface. They are useful for making
   the demo data look like a real menu, but nothing in the ten goals needs them.
3. Visual polish on the dashboard charts, in favour of the numbers being correct.

What I would not cut, even under time pressure, is anything that would leave a rule
enforced in the interface but not on the server. A missing screen is a smaller problem
than a rule that only looks like it is enforced.
