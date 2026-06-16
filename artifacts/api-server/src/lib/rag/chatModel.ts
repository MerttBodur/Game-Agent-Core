import { ChatOpenAI } from "@langchain/openai";

const apiKey =
  process.env.AI_INTEGRATIONS_OPENAI_API_KEY ?? process.env.OPENAI_API_KEY;
if (!apiKey) throw new Error("OpenAI API key missing for chat model.");

export function chatModel(): ChatOpenAI {
  return new ChatOpenAI({
    apiKey,
    model: "gpt-4o-mini",
    temperature: 0,
    configuration: { baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL },
  });
}
