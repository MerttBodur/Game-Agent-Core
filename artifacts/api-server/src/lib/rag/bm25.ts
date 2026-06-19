// Hand-rolled Okapi BM25 over a tiny in-memory corpus (~60 tool docs).
// No external dependency — corpus is small enough that a naive implementation
// is sub-millisecond, and this avoids the package release-age policy.

const K1 = 1.5;
const B = 0.75;
const RRF_K = 60;

export interface Bm25Doc {
  id: string;
  text: string;
}

export interface Bm25Index {
  search(query: string, k: number): Array<{ id: string; score: number }>;
}

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

export function buildBm25(docs: Bm25Doc[]): Bm25Index {
  const tokenized = docs.map((d) => ({ id: d.id, terms: tokenize(d.text) }));
  const docLen = tokenized.map((d) => d.terms.length);
  const avgLen = docLen.reduce((a, b) => a + b, 0) / (docLen.length || 1);
  const df = new Map<string, number>();
  for (const d of tokenized) {
    for (const term of new Set(d.terms)) df.set(term, (df.get(term) ?? 0) + 1);
  }
  const N = tokenized.length;
  const tf = tokenized.map((d) => {
    const counts = new Map<string, number>();
    for (const term of d.terms) counts.set(term, (counts.get(term) ?? 0) + 1);
    return counts;
  });

  function idf(term: string): number {
    const n = df.get(term) ?? 0;
    // BM25+ style smoothing keeps idf non-negative.
    return Math.log(1 + (N - n + 0.5) / (n + 0.5));
  }

  return {
    search(query, k) {
      const qTerms = [...new Set(tokenize(query))];
      const scored = tokenized.map((d, i) => {
        let score = 0;
        for (const term of qTerms) {
          const f = tf[i].get(term) ?? 0;
          if (f === 0) continue;
          const denom = f + K1 * (1 - B + (B * docLen[i]) / (avgLen || 1));
          score += idf(term) * ((f * (K1 + 1)) / denom);
        }
        return { id: d.id, score };
      });
      return scored
        .filter((s) => s.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, k);
    },
  };
}

export function rrfFuse(rankings: string[][], k = RRF_K): string[] {
  const scores = new Map<string, number>();
  for (const list of rankings) {
    list.forEach((id, rank) => {
      scores.set(id, (scores.get(id) ?? 0) + 1 / (k + rank));
    });
  }
  return [...scores.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
}
