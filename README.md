# Restaurant Orders

Replaces the paper-ticket-and-corkboard workflow in an independent restaurant.
Managers keep the menu, prices and availability current; waiters place and track
orders from table to kitchen and back, with an auditable history and alerts for
orders that have been sitting too long.

**Live application:** [Link](https://vishal-restaurant-orders.vercel.app)
**Design documents:** see [`docs/`](./docs)

## Stack

| Layer | Choice |
|---|---|
| Frontend | React + TypeScript (Vite), TanStack Query, Tailwind |
| Backend | Node + Express + TypeScript, Prisma |
| Database | PostgreSQL (Neon) |
| Hosting | Vercel (web) · Render (API) · Neon (database) |
