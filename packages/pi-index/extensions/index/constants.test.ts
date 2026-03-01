import { describe, it, expect } from "vitest";
import { LANGUAGE_MAP, SUPPORTED_EXTENSIONS } from "./constants.js";

describe("LANGUAGE_MAP v3 extensions", () => {
  it("maps Ruby extensions correctly", () => {
    expect(LANGUAGE_MAP[".rb"]).toBe("ruby");
    expect(LANGUAGE_MAP[".erb"]).toBe("erb");
    expect(LANGUAGE_MAP[".rake"]).toBe("ruby");
    expect(LANGUAGE_MAP[".gemspec"]).toBe("ruby");
    expect(LANGUAGE_MAP[".ru"]).toBe("ruby");
  });

  it("maps Python type stubs", () => {
    expect(LANGUAGE_MAP[".pyi"]).toBe("python");
  });

  it("maps CSS preprocessors", () => {
    expect(LANGUAGE_MAP[".scss"]).toBe("scss");
    expect(LANGUAGE_MAP[".sass"]).toBe("scss");
    expect(LANGUAGE_MAP[".less"]).toBe("less");
  });

  it("maps config files", () => {
    expect(LANGUAGE_MAP[".json"]).toBe("json");
    expect(LANGUAGE_MAP[".yaml"]).toBe("yaml");
    expect(LANGUAGE_MAP[".yml"]).toBe("yaml");
    expect(LANGUAGE_MAP[".toml"]).toBe("toml");
  });

  it("does NOT include .env (security)", () => {
    expect(LANGUAGE_MAP[".env"]).toBeUndefined();
  });

  it("SUPPORTED_EXTENSIONS includes all new extensions", () => {
    const expected = [".rb", ".erb", ".rake", ".gemspec", ".ru", ".pyi", ".scss", ".sass", ".less", ".json", ".yaml", ".yml", ".toml"];
    for (const ext of expected) {
      expect(SUPPORTED_EXTENSIONS).toContain(ext);
    }
  });

  it("SUPPORTED_EXTENSIONS still includes existing extensions", () => {
    const existing = [".ts", ".tsx", ".d.ts", ".js", ".jsx", ".py", ".sql", ".md", ".css", ".html", ".txt"];
    for (const ext of existing) {
      expect(SUPPORTED_EXTENSIONS).toContain(ext);
    }
  });
});
