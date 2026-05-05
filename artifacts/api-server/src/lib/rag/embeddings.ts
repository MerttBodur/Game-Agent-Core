import OpenAI from "openai";

export const RAG_EMBEDDING_MODEL = "text-embedding-3-small";
export const RAG_EMBEDDING_DIMENSIONS = 1536;

export async function getEmbedding(text: string): Promise<number[]> {
  const client = new OpenAI({
    apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
    baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  });
  const response = await client.embeddings.create({ model: RAG_EMBEDDING_MODEL, input: text });
  return response.data[0]!.embedding;
}
