import "dotenv/config";
import { defineConfig } from "prisma/config";

// Prisma's CLI (migrate, db pull, studio) connects through this file.
// It must use the DIRECT Neon connection, not the pooled one: schema
// migrations run DDL in a persistent session, and a transaction pooler
// hands out a different backend connection per statement.
//
// Prisma 7 removed the separate `directUrl` option, so the direct URL goes
// in `url` here, and the pooled URL is given to the driver adapter at
// runtime instead.
const directUrl = process.env["DIRECT_URL"];

if (!directUrl) {
  throw new Error(
    "DIRECT_URL is not set. Prisma's CLI needs the direct (non-pooled) Neon connection string."
  );
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: directUrl,
  },
});