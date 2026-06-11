import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema";

// Module-scope Pool is reused across warm Lambda invocations; keep `max` small
// since Lambda scales horizontally (one container handles one request at a time).
// Idle reaping matters under Lambda horizontal scale: RDS t4g.micro allows only
// ~87 connections, so release idle ones quickly instead of holding them.
// No eager env guard — pg fails lazily on first query with a clear error if
// POSTGRES_URL is unset, so `next build`/CI work without a database env.
const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  max: 2,
  idleTimeoutMillis: 10_000,
  connectionTimeoutMillis: 5_000,
});

export const db = drizzle({
  client: pool,
  schema,
  casing: "snake_case",
});
