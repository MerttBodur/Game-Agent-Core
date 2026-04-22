import { OpenAIEmbeddings } from "@langchain/openai";

export const RAG_EMBEDDING_MODEL = "text-embedding-3-small";
export const RAG_EMBEDDING_DIMENSIONS = 1536;

export function getOpenAIEmbeddings(): OpenAIEmbeddings {
  const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;

  if (!apiKey) {
    throw new Error(
      "AI_INTEGRATIONS_OPENAI_API_KEY must be set. Did you forget to provision the OpenAI AI integration?",
    );
  }

  if (!baseURL) {
    throw new Error(
      "AI_INTEGRATIONS_OPENAI_BASE_URL must be set. Did you forget to provision the OpenAI AI integration?",
    );
  }

  return new OpenAIEmbeddings({
    model: RAG_EMBEDDING_MODEL,
    apiKey,
    configuration: {
      baseURL,
    },
  });
}
