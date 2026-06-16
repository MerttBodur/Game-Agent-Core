import "dotenv/config";
import { buildIndex } from "../lib/rag/indexer.js";

buildIndex()
  .then(({ toolDocs, guidanceDocs }) => {
    console.log(`Indexed ${toolDocs} tool docs + ${guidanceDocs} guidance docs into Chroma.`);
  })
  .catch((err) => {
    console.error("RAG indexing failed:", err);
    process.exitCode = 1;
  });
