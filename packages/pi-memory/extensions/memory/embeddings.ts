import OpenAI from "openai";

export class Embeddings {
  private client: OpenAI;

  constructor(
    apiKey: string,
    private model: string,
  ) {
    this.client = new OpenAI({ apiKey });
  }

  async embed(text: string): Promise<number[]> {
    const response = await this.client.embeddings.create({
      model: this.model,
      input: text,
      encoding_format: "float", // ensure plain number[] (openai 6.x defaults to base64 internally)
    });
    return response.data[0].embedding;
  }
}
