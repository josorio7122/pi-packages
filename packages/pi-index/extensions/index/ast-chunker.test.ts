import { describe, it, expect } from "vitest";
import { astSplit, langchainSplit } from "./ast-chunker.js";

describe("astSplit", () => {
  // TypeScript
  it("splits TypeScript into function boundaries", () => {
    const code = `import { foo } from "bar";

export function hello(): void {
  console.log("hello");
}

export class World {
  greet(): string {
    return "world";
  }
}
`;
    const ranges = astSplit(code, "typescript");
    expect(ranges).not.toBeNull();
    expect(ranges!.length).toBeGreaterThanOrEqual(2);
    // Should find hello function and World class
    const symbols = ranges!.map((r) => r.symbol);
    expect(symbols).toContain("hello");
    expect(symbols).toContain("World");
  });

  it("extracts interface and type alias symbols from TypeScript", () => {
    const code = `export interface IConfig {
  name: string;
  value: number;
}

export type Result = { ok: boolean };
`;
    const ranges = astSplit(code, "typescript");
    expect(ranges).not.toBeNull();
    const symbols = ranges!.map((r) => r.symbol);
    expect(symbols).toContain("IConfig");
    expect(symbols).toContain("Result");
  });

  it("extracts const arrow function symbols from TypeScript", () => {
    const code = `export const greet = (name: string): string => {
  return \`Hello, \${name}\`;
};
`;
    const ranges = astSplit(code, "typescript");
    expect(ranges).not.toBeNull();
    const symbols = ranges!.map((r) => r.symbol).filter((s) => s);
    expect(symbols).toContain("greet");
  });

  // JavaScript
  it("splits JavaScript classes and functions", () => {
    const code = `function add(a, b) {
  return a + b;
}

class Calculator {
  multiply(a, b) {
    return a * b;
  }
}
`;
    const ranges = astSplit(code, "javascript");
    expect(ranges).not.toBeNull();
    const symbols = ranges!.map((r) => r.symbol);
    expect(symbols).toContain("add");
    expect(symbols).toContain("Calculator");
  });

  // Python
  it("splits Python into class and function boundaries", () => {
    const code = `import os

def greet(name):
    print(f"Hello, {name}")

class User:
    def __init__(self, name):
        self.name = name

    def display(self):
        print(self.name)
`;
    const ranges = astSplit(code, "python");
    expect(ranges).not.toBeNull();
    const symbols = ranges!.map((r) => r.symbol);
    expect(symbols).toContain("greet");
    expect(symbols).toContain("User");
  });

  it("handles Python decorated functions", () => {
    const code = `@app.route("/")
def index():
    return "hello"

@staticmethod
def helper():
    pass
`;
    const ranges = astSplit(code, "python");
    expect(ranges).not.toBeNull();
    const symbols = ranges!.map((r) => r.symbol);
    expect(symbols).toContain("index");
    expect(symbols).toContain("helper");
  });

  // Ruby
  it("splits Ruby into class/module/method boundaries", () => {
    const code = `module MyApp
  class User
    def initialize(name)
      @name = name
    end

    def greet
      "Hello, #{@name}"
    end
  end
end
`;
    const ranges = astSplit(code, "ruby");
    expect(ranges).not.toBeNull();
    const symbols = ranges!.map((r) => r.symbol);
    expect(symbols).toContain("MyApp");
  });

  it("splits Ruby singleton methods", () => {
    const code = `class Config
  def self.load(path)
    File.read(path)
  end
end
`;
    const ranges = astSplit(code, "ruby");
    expect(ranges).not.toBeNull();
    expect(ranges!.length).toBeGreaterThanOrEqual(1);
    const symbols = ranges!.map((r) => r.symbol);
    expect(symbols).toContain("Config");
  });

  // CSS
  it("splits CSS into rule sets", () => {
    const code = `.header {
  display: flex;
  color: red;
}

.footer {
  margin-top: 20px;
}

@media (max-width: 768px) {
  .header {
    flex-direction: column;
  }
}
`;
    const ranges = astSplit(code, "css");
    expect(ranges).not.toBeNull();
    expect(ranges!.length).toBeGreaterThanOrEqual(3);
  });

  // SCSS
  it("splits SCSS including mixins", () => {
    const code = `$primary: #333;

@mixin flex-center {
  display: flex;
  align-items: center;
}

.header {
  @include flex-center;
  color: $primary;
}
`;
    const ranges = astSplit(code, "scss");
    expect(ranges).not.toBeNull();
    expect(ranges!.length).toBeGreaterThanOrEqual(2);
  });

  // Unsupported language
  it("returns null for unsupported languages", () => {
    const result = astSplit("some content", "json");
    expect(result).toBeNull();
  });

  it("returns null for empty code", () => {
    const result = astSplit("", "typescript");
    expect(result).toBeNull();
  });

  // Line numbers
  it("returns correct 0-based line numbers", () => {
    const code = `// preamble

export function foo() {
  return 1;
}
`;
    const ranges = astSplit(code, "typescript");
    expect(ranges).not.toBeNull();
    const fooRange = ranges!.find((r) => r.symbol === "foo");
    expect(fooRange).toBeDefined();
    expect(fooRange!.startLine).toBeGreaterThanOrEqual(2);
    expect(fooRange!.endLine).toBe(4);
  });

  // Abstract class (TypeScript)
  it("extracts abstract class symbol from TypeScript", () => {
    const code = `abstract class Repository {
  abstract find(id: string): unknown;
}
`;
    const ranges = astSplit(code, "typescript");
    expect(ranges).not.toBeNull();
    const symbols = ranges!.map((r) => r.symbol);
    expect(symbols).toContain("Repository");
  });

  // No duplicate ranges for export_statement wrapping a declaration
  it("does NOT produce duplicate ranges for export_statement wrapping a declaration", () => {
    const code = `export function hello(): void {
  console.log("hello");
}
`;
    const ranges = astSplit(code, "typescript");
    expect(ranges).not.toBeNull();
    // Should be exactly one range (export_statement), not two (export + function_declaration)
    expect(ranges!.length).toBe(1);
    expect(ranges![0].symbol).toBe("hello");
  });
});

describe("langchainSplit", () => {
  it("splits code for known languages", async () => {
    // 200 lines × ~50 chars ≈ 10000 chars > chunkSize (80 lines × 80 chars = 6400)
    const code = Array(200)
      .fill("const longVariableName = 'some longer value here';")
      .join("\n");
    const ranges = await langchainSplit(code, "javascript");
    expect(ranges.length).toBeGreaterThan(1);
    expect(ranges[0].startLine).toBe(0);
    expect(ranges[0].symbol).toBe("");
  });

  it("splits code for unknown languages (generic fallback)", async () => {
    const code = Array(100).fill("key = value").join("\n");
    const ranges = await langchainSplit(code, "toml");
    expect(ranges.length).toBeGreaterThanOrEqual(1);
  });

  it("handles small code that fits in one chunk", async () => {
    const code = "x = 1\ny = 2\n";
    const ranges = await langchainSplit(code, "python");
    expect(ranges.length).toBe(1);
    expect(ranges[0].startLine).toBe(0);
  });
});
