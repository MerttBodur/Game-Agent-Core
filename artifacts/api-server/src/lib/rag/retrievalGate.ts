// Layer 2 (softblock): a graceful-degradation gate over retrieval strength.
// The reference doc gates on a Cohere rerank score; we have no reranker, so we
// gate on signals we own — a non-empty fused pool AND a top BM25 score above a
// floor. A failed gate is logged as low-confidence; the category still produces
// a recommendation (it is not skipped or errored). MIN_BM25_SCORE is a starting
// point: calibrate it with the gold-set
// harness (`pnpm --filter @workspace/api-server run rag:eval`) when the catalog,
// embeddings, or BM25 weighting change. Do NOT guess it higher without data.

export const MIN_BM25_SCORE = 0.5;
export const MIN_CHUNKS_REQUIRED = 1;

export interface GateResult {
  passed: boolean;
  reason?: string;
}

export function confidenceGate(
  toolDocCount: number,
  topBm25Score: number,
  opts: { minScore?: number; minChunks?: number } = {},
): GateResult {
  const minScore = opts.minScore ?? MIN_BM25_SCORE;
  const minChunks = opts.minChunks ?? MIN_CHUNKS_REQUIRED;

  if (toolDocCount === 0) return { passed: false, reason: "no_chunks" };
  if (toolDocCount < minChunks) return { passed: false, reason: "too_few_chunks" };
  if (topBm25Score < minScore) {
    return { passed: false, reason: `low_confidence:${topBm25Score.toFixed(3)}<${minScore}` };
  }
  return { passed: true };
}
