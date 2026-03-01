/**
 * Abstract interface for embedding providers.
 *
 * All embedding providers (OpenAI, Ollama, Voyage) implement this interface.
 * The indexer and searcher depend only on this interface, not concrete implementations.
 */
export interface EmbeddingProvider {
  /** Embed a single text string. Returns a vector of floats. */
  embed(text: string): Promise<number[]>;

  /** Embed a batch of text strings in a single API call. Returns one vector per input. */
  embedBatch(texts: string[]): Promise<number[][]>;

  /** Get the vector dimension. Async because some providers (Ollama) need a probe call. */
  getDimension(): Promise<number>;

  /** Human-readable provider name for logging (e.g. "openai", "ollama", "voyage"). */
  getProvider(): string;
}
