# AI prompts

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
