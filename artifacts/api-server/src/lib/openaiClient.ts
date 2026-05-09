import OpenAI from "openai";

const apiKey =
  process.env.AI_INTEGRATIONS_OPENAI_API_KEY ?? process.env.OPENAI_API_KEY;

if (!apiKey) {
  throw new Error(
    "OpenAI API key missing. Set AI_INTEGRATIONS_OPENAI_API_KEY (or OPENAI_API_KEY) in artifacts/api-server/.env",
  );
}

export const openai = new OpenAI({
  apiKey,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});
