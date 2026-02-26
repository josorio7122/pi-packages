import { describe, it, expect } from "vitest";
import { mmrRerank, cosineSimilarity } from "./mmr.js";
import type { CodeChunk } from "./chunker.js";

type ScoredChunk = CodeChunk & { score: number };

function makeChunk(id: string, vector: number[], score: number): ScoredChunk {
  return {
    id,
    filePath: `src/${id}.ts`,
    chunkIndex: 0,
    startLine: 1,
    endLine: 10,
    text: `content of ${id}`,
    vector,
    language: "typescript",
    extension: ".ts",
    symbol: id,
    mtime: 1000,
    createdAt: 1000,
    score,
  };
}

describe("cosineSimilarity", () => {
  it("returns 1.0 for identical vectors", () => {
    expect(cosineSimilarity([1, 0, 0], [1, 0, 0])).toBeCloseTo(1.0);
  });

  it("returns 0.0 for orthogonal vectors", () => {
    expect(cosineSimilarity([1, 0, 0], [0, 1, 0])).toBeCloseTo(0.0);
  });

  it("returns -1.0 for opposite vectors", () => {
    expect(cosineSimilarity([1, 0, 0], [-1, 0, 0])).toBeCloseTo(-1.0);
  });

  it("returns 0 when either vector is all-zeros", () => {
    expect(cosineSimilarity([0, 0, 0], [1, 0, 0])).toBe(0);
    expect(cosineSimilarity([1, 0, 0], [0, 0, 0])).toBe(0);
  });
});

describe("mmrRerank", () => {
  it("returns at most `limit` results", () => {
    const items = [
      makeChunk("a", [1, 0, 0], 0.9),
      makeChunk("b", [0, 1, 0], 0.8),
      makeChunk("c", [0, 0, 1], 0.7),
      makeChunk("d", [1, 0, 0], 0.6),
    ];
    expect(mmrRerank(items, 2).length).toBe(2);
  });

  it("always selects the highest-scoring item first", () => {
    const items = [
      makeChunk("a", [1, 0, 0], 0.9),
      makeChunk("b", [0, 1, 0], 0.8),
    ];
    expect(mmrRerank(items, 2)[0].id).toBe("a");
  });

  it("promotes diverse results over redundant ones", () => {
    // a and b are nearly identical; c is orthogonal to a
    // After selecting a, MMR should prefer c over b
    const items = [
      makeChunk("a", [1, 0, 0], 0.9),
      makeChunk("b", [0.999, 0.045, 0], 0.85),  // almost identical to a
      makeChunk("c", [0, 1, 0], 0.7),            // orthogonal to a
    ];
    const result = mmrRerank(items, 2);
    expect(result[0].id).toBe("a");
    expect(result[1].id).toBe("c");
  });

  it("returns all items when limit >= items.length", () => {
    const items = [
      makeChunk("a", [1, 0, 0], 0.9),
      makeChunk("b", [0, 1, 0], 0.8),
    ];
    expect(mmrRerank(items, 10).length).toBe(2);
  });

  it("returns empty array for empty input", () => {
    expect(mmrRerank([], 5)).toEqual([]);
  });

  it("returns empty array when limit is 0", () => {
    const items = [makeChunk("a", [1, 0, 0], 0.9)];
    expect(mmrRerank(items, 0)).toEqual([]);
  });

  it("does not mutate the input array", () => {
    const items = [
      makeChunk("a", [1, 0, 0], 0.9),
      makeChunk("b", [0, 1, 0], 0.8),
    ];
    const copy = [...items];
    mmrRerank(items, 2);
    expect(items).toEqual(copy);
  });

  it("accepts optional lambda param with default 0.5 (backward compat)", () => {
    const items = [
      makeChunk("a", [1, 0, 0], 0.9),
      makeChunk("b", [0, 1, 0], 0.8),
    ];
    // explicit 0.5 should produce same result as no lambda
    const withDefault = mmrRerank([...items], 2);
    const withExplicit = mmrRerank([...items], 2, 0.5);
    expect(withExplicit.map((c) => c.id)).toEqual(withDefault.map((c) => c.id));
  });

  it("lambda=1.0 selects purely by relevance (ignores diversity)", () => {
    // a and b are nearly identical; c is orthogonal but lower score
    // With lambda=1.0, score = 1.0 * relevance - 0.0 * maxSim → picks top 2 by score
    const items = [
      makeChunk("a", [1, 0, 0], 0.9),
      makeChunk("b", [0.999, 0.045, 0], 0.85),
      makeChunk("c", [0, 1, 0], 0.7),
    ];
    const result = mmrRerank(items, 2, 1.0);
    expect(result[0].id).toBe("a");
    expect(result[1].id).toBe("b"); // pure relevance: b (0.85) > c (0.7)
  });

  it("lambda=0.0 selects purely by diversity (ignores relevance)", () => {
    // After picking the first item, lambda=0 means score = -maxSim, so picks most different
    const items = [
      makeChunk("a", [1, 0, 0], 0.9),
      makeChunk("b", [0.999, 0.045, 0], 0.85), // nearly same direction as a
      makeChunk("c", [0, 1, 0], 0.7),           // orthogonal to a
    ];
    const result = mmrRerank(items, 2, 0.0);
    expect(result[0].id).toBe("a"); // first is still highest-scoring (no prior selection)
    expect(result[1].id).toBe("c"); // max diversity: c is orthogonal to a
  });
});
