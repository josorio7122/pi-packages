import type { CodeChunk } from "./chunker.js";

export type ScoredChunk = CodeChunk & { score: number };

/**
 * Cosine similarity between two vectors.
 * Returns 0 if either vector is all-zeros.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    console.warn(`[pi-index] cosineSimilarity: vector dimension mismatch (${a.length} vs ${b.length})`);
    return 0;
  }
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

/**
 * Maximal Marginal Relevance reranking.
 * Greedily selects results balancing relevance and diversity.
 *
 * score(candidate) = λ * relevance - (1 - λ) * max_cosine_sim_to_selected
 *
 * λ = 1.0 → pure relevance ranking
 * λ = 0.0 → pure diversity (maximum marginal relevance)
 * λ = 0.5 → equal weight (default)
 */
export function mmrRerank(items: ScoredChunk[], limit: number, lambda = 0.5): ScoredChunk[] {
  if (items.length === 0 || limit <= 0) return [];

  const candidates = [...items]; // shallow copy — do not mutate input
  const selected: ScoredChunk[] = [];

  while (selected.length < limit && candidates.length > 0) {
    let bestIdx = 0;
    let bestScore = -Infinity;

    for (let i = 0; i < candidates.length; i++) {
      const relevance = candidates[i].score;
      const maxSim =
        selected.length === 0
          ? 0
          : Math.max(
              ...selected.map((s) => cosineSimilarity(candidates[i].vector, s.vector)),
            );
      const mmrScore = lambda * relevance - (1 - lambda) * maxSim;
      if (mmrScore > bestScore) {
        bestScore = mmrScore;
        bestIdx = i;
      }
    }

    selected.push(candidates[bestIdx]);
    candidates.splice(bestIdx, 1);
  }

  return selected;
}
