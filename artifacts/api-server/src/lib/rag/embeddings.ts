import { OpenAIEmbeddings } from "@langchain/openai";

const apiKey =
  process.env.AI_INTEGRATIONS_OPENAI_API_KEY ?? process.env.OPENAI_API_KEY;
if (!apiKey) throw new Error("OpenAI API key missing for embeddings.");

export const embeddings = new OpenAIEmbeddings({
  apiKey,
  model: "text-embedding-3-small",
  configuration: { baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL },
});
