import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema";

if (!process.env.POSTGRES_URL) {
  throw new Error("Missing POSTGRES_URL");
}

// Module-scope Pool is reused across warm Lambda invocations; keep `max` small
// since Lambda scales horizontally (one container handles one request at a time).
const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  max: 2,
});

export const db = drizzle({
  client: pool,
  schema,
  casing: "snake_case",
});
