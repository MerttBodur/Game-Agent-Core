const { defineConfig } = require("drizzle-kit");
const { config } = require("dotenv");
const { resolve } = require("node:path");

config({ path: resolve(__dirname, "../../artifacts/api-server/.env") });

if (!process.env.MYSQL_URL) {
  throw new Error("MYSQL_URL must be set");
}

module.exports = defineConfig({
  schema: "./src/schema/index.ts",
  dialect: "mysql",
  dbCredentials: { url: process.env.MYSQL_URL },
});
