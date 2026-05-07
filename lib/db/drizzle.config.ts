import { defineConfig } from "drizzle-kit";
import { config } from "dotenv";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../../artifacts/api-server/.env") });

if (!process.env.MYSQL_URL) {
  throw new Error("MYSQL_URL must be set");
}

export default defineConfig({
  schema: resolve(__dirname, "./src/schema/index.ts"),
  dialect: "mysql",
  dbCredentials: { url: process.env.MYSQL_URL },
});
