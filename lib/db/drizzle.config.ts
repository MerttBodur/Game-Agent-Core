import { defineConfig } from "drizzle-kit";
import { config } from "dotenv";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../../artifacts/api-server/.env") });

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

export default defineConfig({
  schema: resolve(__dirname, "./src/schema/index.ts"),
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL },
});
