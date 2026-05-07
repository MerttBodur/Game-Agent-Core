import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import * as schema from "./schema";

if (!process.env.MYSQL_URL) {
  throw new Error("MYSQL_URL must be set. Did you forget to start docker compose?");
}

export const pool = mysql.createPool(process.env.MYSQL_URL);
export const db = drizzle(pool, { schema, mode: "default" });

export * from "./schema";
