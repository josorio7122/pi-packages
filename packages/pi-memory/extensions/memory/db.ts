import { randomUUID } from "node:crypto";
import type { MemoryCategory } from "./utils.js";

let lancedbImportPromise: Promise<typeof import("@lancedb/lancedb")> | null = null;
const loadLanceDB = async (): Promise<typeof import("@lancedb/lancedb")> => {
  if (!lancedbImportPromise) {
    lancedbImportPromise = import("@lancedb/lancedb");
  }
  try {
    return await lancedbImportPromise;
  } catch (err) {
    throw new Error(`memory-lancedb: failed to load LanceDB. ${String(err)}`, { cause: err });
  }
};

export type MemoryEntry = {
  id: string;
  text: string;
  vector: number[];
  importance: number;
  category: MemoryCategory;
  createdAt: number;
};

export type MemorySearchResult = {
  entry: MemoryEntry;
  score: number;
};

const TABLE_NAME = "memories";

export class MemoryDB {
  private db: any = null;
  private table: any = null;
  private initPromise: Promise<void> | null = null;

  constructor(
    private readonly dbPath: string,
    private readonly vectorDim: number,
  ) {}

  private async ensureInitialized(): Promise<void> {
    if (this.table) { return; }
    if (this.initPromise) { return this.initPromise; }
    this.initPromise = this.doInitialize();
    try {
      return await this.initPromise;
    } catch (err) {
      this.initPromise = null; // allow retry on next operation
      throw err;
    }
  }

  private async doInitialize(): Promise<void> {
    try {
      const lancedb = await loadLanceDB();
      this.db = await lancedb.connect(this.dbPath);
      const tables = await this.db.tableNames();

      if (tables.includes(TABLE_NAME)) {
        this.table = await this.db.openTable(TABLE_NAME);
      } else {
        this.table = await this.db.createTable(TABLE_NAME, [
          {
            id: "__schema__",
            text: "",
            vector: Array.from({ length: this.vectorDim }).fill(0),
            importance: 0,
            category: "other",
            createdAt: 0,
          },
        ]);
        await this.table.delete('id = "__schema__"');
      }
    } catch (err) {
      this.initPromise = null; // allow retry on next operation
      throw err;
    }
  }

  async store(entry: Omit<MemoryEntry, "id" | "createdAt">): Promise<MemoryEntry> {
    await this.ensureInitialized();
    const fullEntry: MemoryEntry = {
      ...entry,
      id: randomUUID(),
      createdAt: Date.now(),
    };
    await this.table!.add([fullEntry]);
    return fullEntry;
  }

  async search(vector: number[], limit = 5, minScore = 0.5): Promise<MemorySearchResult[]> {
    await this.ensureInitialized();
    const results = await this.table!.vectorSearch(vector).limit(limit).toArray();
    const mapped = results.map((row: any) => {
      const distance = row._distance ?? 0;
      const score = 1 / (1 + distance);
      return {
        entry: {
          id: row.id as string,
          text: row.text as string,
          vector: row.vector as number[],
          importance: row.importance as number,
          category: row.category as MemoryEntry["category"],
          createdAt: row.createdAt as number,
        },
        score,
      };
    });
    return mapped.filter((r: MemorySearchResult) => r.score >= minScore);
  }

  async delete(id: string): Promise<boolean> {
    await this.ensureInitialized();
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      throw new Error(`Invalid memory ID format: ${id}`);
    }
    await this.table!.delete(`id = '${id}'`);
    return true;
  }

  async count(): Promise<number> {
    await this.ensureInitialized();
    return this.table!.countRows();
  }
}
