import { MAX_CHUNK_LINES } from "./constants.js";
import { RecursiveCharacterTextSplitter, type SupportedTextSplitterLanguage } from "@langchain/textsplitters";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const Parser = require("tree-sitter") as new () => TreeSitterParser;

/** A line range within a source file produced by AST or LangChain splitting. */
export type ASTRange = { startLine: number; endLine: number; symbol: string };

// ─── Tree-sitter types (minimal) ──────────────────────────────────────────────

interface TSNode {
  type: string;
  text: string;
  startPosition: { row: number; column: number };
  endPosition: { row: number; column: number };
  children: TSNode[];
}

interface TSTree {
  rootNode: TSNode;
}

interface TreeSitterParser {
  setLanguage(grammar: unknown): void;
  parse(code: string): TSTree;
}

// ─── Supported node types per language ─────────────────────────────────────

const SPLITTABLE_NODES: Record<string, string[]> = {
  typescript: [
    "function_declaration",
    "class_declaration",
    "abstract_class_declaration",
    "interface_declaration",
    "type_alias_declaration",
    "export_statement",
    "lexical_declaration",
  ],
  javascript: [
    "function_declaration",
    "class_declaration",
    "export_statement",
    "lexical_declaration",
  ],
  python: ["function_definition", "class_definition", "decorated_definition"],
  ruby: ["class", "module", "method", "singleton_method"],
  css: ["rule_set", "media_statement", "keyframes_statement"],
  scss: ["rule_set", "mixin_statement", "media_statement"],
};

// ─── Grammar loader (lazy, cached) ─────────────────────────────────────────

type Grammar = unknown;

const grammarCache = new Map<string, Grammar | null>();

function loadGrammar(language: string): Grammar | null {
  if (grammarCache.has(language)) return grammarCache.get(language)!;
  let grammar: Grammar | null = null;
  try {
    if (language === "typescript") {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      grammar = require("tree-sitter-typescript").typescript;
    } else if (language === "javascript") {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      grammar = require("tree-sitter-javascript");
    } else if (language === "python") {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      grammar = require("tree-sitter-python");
    } else if (language === "ruby") {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      grammar = require("tree-sitter-ruby");
    } else if (language === "css") {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      grammar = require("tree-sitter-css");
    } else if (language === "scss") {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      grammar = require("tree-sitter-scss");
    }
  } catch {
    grammar = null;
  }
  grammarCache.set(language, grammar);
  return grammar;
}

// ─── Symbol extraction ─────────────────────────────────────────────────────

function extractSymbol(node: TSNode, language: string): string {
  const lang = language === "tsx" ? "typescript" : language;

  if (lang === "typescript" || lang === "javascript") {
    return extractTSJSSymbol(node);
  }
  if (lang === "python") {
    return extractPythonSymbol(node);
  }
  if (lang === "ruby") {
    return extractRubySymbol(node);
  }
  if (lang === "css" || lang === "scss") {
    return extractCSSSymbol(node);
  }
  return "";
}

function extractTSJSSymbol(node: TSNode): string {
  switch (node.type) {
    case "function_declaration": {
      const id = node.children.find((c) => c.type === "identifier");
      return id?.text ?? "";
    }
    case "class_declaration":
    case "abstract_class_declaration": {
      // class_declaration uses 'type_identifier', abstract_class_declaration also uses 'type_identifier'
      const id =
        node.children.find((c) => c.type === "type_identifier") ??
        node.children.find((c) => c.type === "identifier");
      return id?.text ?? "";
    }
    case "interface_declaration": {
      const id = node.children.find((c) => c.type === "type_identifier");
      return id?.text ?? "";
    }
    case "type_alias_declaration": {
      const id = node.children.find((c) => c.type === "type_identifier");
      return id?.text ?? "";
    }
    case "export_statement": {
      // Find the inner declaration and recurse
      const inner = node.children.find(
        (c) =>
          c.type === "function_declaration" ||
          c.type === "class_declaration" ||
          c.type === "abstract_class_declaration" ||
          c.type === "interface_declaration" ||
          c.type === "type_alias_declaration" ||
          c.type === "lexical_declaration",
      );
      return inner ? extractTSJSSymbol(inner) : "";
    }
    case "lexical_declaration": {
      const decl = node.children.find((c) => c.type === "variable_declarator");
      const id = decl?.children.find((c) => c.type === "identifier");
      return id?.text ?? "";
    }
    default:
      return "";
  }
}

function extractPythonSymbol(node: TSNode): string {
  switch (node.type) {
    case "function_definition":
    case "class_definition": {
      const id = node.children.find((c) => c.type === "identifier");
      return id?.text ?? "";
    }
    case "decorated_definition": {
      const inner =
        node.children.find((c) => c.type === "function_definition") ??
        node.children.find((c) => c.type === "class_definition");
      return inner ? extractPythonSymbol(inner) : "";
    }
    default:
      return "";
  }
}

function extractRubySymbol(node: TSNode): string {
  switch (node.type) {
    case "class":
    case "module": {
      const id = node.children.find((c) => c.type === "constant");
      return id?.text ?? "";
    }
    case "method": {
      const id = node.children.find((c) => c.type === "identifier");
      return id?.text ?? "";
    }
    case "singleton_method": {
      const id = node.children.find((c) => c.type === "identifier");
      return id?.text ?? "";
    }
    default:
      return "";
  }
}

function extractCSSSymbol(node: TSNode): string {
  switch (node.type) {
    case "rule_set": {
      const selectors = node.children.find((c) => c.type === "selectors");
      return selectors?.text ?? "";
    }
    case "media_statement":
      return "@media";
    case "keyframes_statement": {
      const name = node.children.find((c) => c.type === "keyframes_name");
      if (name) return name.text;
      // fallback: second child
      return node.children[1]?.text ?? "";
    }
    case "mixin_statement": {
      const id = node.children.find((c) => c.type === "identifier");
      return id?.text ?? "";
    }
    default:
      return "";
  }
}

// ─── Public: AST splitting ─────────────────────────────────────────────────

/**
 * Split `code` into ranges aligned to AST node boundaries.
 *
 * Returns `null` if no grammar is registered for `language` or if parsing fails.
 * Returns an empty array if the grammar exists but the file has no splittable nodes.
 */
export function astSplit(code: string, language: string): ASTRange[] | null {
  if (!code.trim()) return null;

  const splittableTypes = SPLITTABLE_NODES[language];
  if (!splittableTypes) return null;

  const grammar = loadGrammar(language);
  if (!grammar) return null;

  let tree: TSTree;
  try {
    const parser = new Parser();
    parser.setLanguage(grammar);
    tree = parser.parse(code);
  } catch {
    return null;
  }

  const root = tree.rootNode;
  const typeSet = new Set(splittableTypes);

  // Walk top-level children only.
  // If a child is an export_statement, don't also emit its inner declaration.
  const ranges: ASTRange[] = [];
  const seenRanges = new Set<string>(); // deduplicate by "start:end"

  for (const child of root.children) {
    if (!typeSet.has(child.type)) continue;

    const key = `${child.startPosition.row}:${child.endPosition.row}`;
    if (seenRanges.has(key)) continue;
    seenRanges.add(key);

    ranges.push({
      startLine: child.startPosition.row,
      endLine: child.endPosition.row,
      symbol: extractSymbol(child, language),
    });
  }

  return ranges;
}

// ─── LangChain mapping ─────────────────────────────────────────────────────

const LANGCHAIN_MAP: Record<string, SupportedTextSplitterLanguage> = {
  javascript: "js",
  typescript: "js",
  python: "python",
  ruby: "ruby",
  markdown: "markdown",
  html: "html",
};

/**
 * Split `code` using LangChain's RecursiveCharacterTextSplitter.
 *
 * Always succeeds — falls back to generic splitting if `language` is unknown.
 */
export async function langchainSplit(
  code: string,
  language: string,
): Promise<ASTRange[]> {
  const mapped = LANGCHAIN_MAP[language];
  const chunkSize = MAX_CHUNK_LINES * 80; // ~80 chars per line

  let splitter: RecursiveCharacterTextSplitter;
  if (mapped) {
    splitter = RecursiveCharacterTextSplitter.fromLanguage(mapped, {
      chunkSize,
      chunkOverlap: 0,
    });
  } else {
    splitter = new RecursiveCharacterTextSplitter({ chunkSize, chunkOverlap: 0 });
  }

  const docs = await splitter.createDocuments([code]);

  return docs.map((doc) => {
    const startIdx = code.indexOf(doc.pageContent);
    const startLine = startIdx >= 0 ? code.substring(0, startIdx).split("\n").length - 1 : 0;
    const endLine = startLine + doc.pageContent.split("\n").length - 1;
    return { startLine, endLine, symbol: "" };
  });
}
