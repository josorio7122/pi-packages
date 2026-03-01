# Tree-Sitter AST Chunking for pi-index

> Full-stack language support: TypeScript, JavaScript, Python, Ruby, HTML, CSS, ERB

**Date**: February 28, 2026  
**Status**: Researched, verified, ready to implement  
**Scope**: Replace regex-based boundary detection with tree-sitter AST parsing for 8 languages

---

## 1. Why Tree-Sitter

pi-index v1 uses regex patterns (`^export function`, `^def`, `^class`) to detect chunk boundaries. This works for top-level declarations but **fails on nested code** — the most common pattern in real applications:

```python
# pi-index v1: ONE chunk (entire class) — regex sees ^class but not indented def
class UserService:
    def authenticate(self, creds):    # ← invisible (indented)
        return True
    async def validate_token(self):   # ← invisible (indented)
        return token
```

```typescript
// pi-index v1: catches export class, misses methods inside
export class AuthController {
  async login(req: Request) { ... }      // ← invisible (not at column 0)
  private validateToken(t: string) { ... } // ← invisible
}
```

```ruby
# pi-index v1: ZERO boundaries detected (no Ruby regex patterns exist)
module Auth
  class TokenValidator
    def validate(token) ... end
    def decode_jwt(raw) ... end
  end
end
```

Tree-sitter parses the actual syntax tree. It sees **every** function, method, class, and module regardless of indentation or nesting depth.

---

## 2. Verified Results

All 8 parsers were installed and tested on Node 24.13.1 (macOS ARM64, Apple clang 17). Every parser correctly identifies the structural units needed for chunking.

### Python — the biggest win

```
Input:
  class UserService:
      def authenticate(self, creds):
          return True
      async def validate_token(self, token):
          return token

Tree-sitter output:
  func: authenticate (lines 2-3) ✅
  func: validate_token (lines 4-5) ✅

pi-index v1 regex output:
  1 chunk: entire class (lines 1-5) ❌
```

### TypeScript — catches class methods

```
Input:
  export class AuthController {
    async login(req: Request): Promise<Response> {
      return new Response();
    }
    private validateToken(t: string): boolean {
      return true;
    }
  }

Tree-sitter output:
  method: login (lines 2-4) ✅
  method: validateToken (lines 5-7) ✅

pi-index v1 regex output:
  1 chunk: export class (lines 1-8)
  methods not individually indexed ❌
```

### Ruby — from zero support to full support

```
Input:
  module Auth
    class TokenValidator
      def validate(token)
        true
      end
      def decode_jwt(raw)
        raw
      end
    end
  end

Tree-sitter output:
  method: validate (lines 3-5) ✅
  method: decode_jwt (lines 6-8) ✅

pi-index v1 regex output:
  line-count split only (no Ruby boundaries defined) ❌
```

### JavaScript — both declarations and arrows

```
Input:
  const handler = (req, res) => {
    res.send('ok');
  };
  function middleware(req, res, next) {
    next();
  }

Tree-sitter output:
  func: middleware (lines 4-6) ✅
  arrow: (lines 1-3) ✅
```

### HTML — sees DOM structure

```
Input:
  <!DOCTYPE html>
  <html>
  <head><title>App</title></head>
  <body>
    <div id="app">
      <h1>Title</h1>
      <p>Content</p>
    </div>
  </body>
  </html>

Tree-sitter output:
  7 elements identified ✅
  Can split at top-level elements (head, body, div)
```

### CSS — rule sets and at-rules

```
Input:
  .btn { color: red; }
  @media (max-width: 768px) {
    .btn { color: blue; }
  }
  #header { display: flex; }

Tree-sitter output:
  rule: .btn { color: red; } (line 1) ✅
  rule: .btn { color: blue; } (line 3) ✅
  rule: #header { display: flex; } (line 5) ✅
  @media: (lines 2-4) ✅
```

### ERB — template structure parsing

```
Input:
  <h1><%= @title %></h1>
  <% if @user %>
    <p>Hello <%= @user.name %></p>
  <% end %>

Tree-sitter output:
  content: "<h1>" ✅
  output_directive: "<%= @title %>" ✅
  content: "</h1>\n" ✅
  directive: "<% if @user %>" ✅
  content: "\n  <p>Hello " ✅
  output_directive: "<%= @user.name %>" ✅
  content: "</p>\n" ✅
  directive: "<% end %>" ✅
```

ERB parser splits templates into directives (`<% %>`), output directives (`<%= %>`), and raw HTML content. Content portions can optionally be further parsed with tree-sitter-html for deeper DOM-level splitting.

---

## 3. Dependencies

### Package List

| Package | Version | Peer Dep | Purpose |
|---------|---------|----------|---------|
| `tree-sitter` | `0.25.0` | — | Core parser engine (native C addon) |
| `tree-sitter-javascript` | `0.25.0` | `tree-sitter@^0.25.0` | JS + JSX grammar |
| `tree-sitter-typescript` | `0.23.2` | `tree-sitter@^0.21.0` | TS + TSX (exports `.typescript` and `.tsx`) |
| `tree-sitter-python` | `0.25.0` | `tree-sitter@^0.25.0` | Python grammar |
| `tree-sitter-ruby` | `0.23.1` | `tree-sitter@^0.21.1` | Ruby grammar |
| `tree-sitter-html` | `0.23.2` | `tree-sitter@^0.21.1` | HTML grammar |
| `tree-sitter-css` | `0.25.0` | `tree-sitter@^0.25.0` | CSS grammar |
| `tree-sitter-embedded-template` | `0.25.0` | `tree-sitter@^0.25.0` | ERB + EJS grammar |

**Total: 8 new required dependencies** (all native C addons).

All are **required dependencies**, not optional. pi-index must have AST chunking for these 8 languages to function correctly.

### Peer Dependency Note

`tree-sitter-html` (0.23.2) and `tree-sitter-ruby` (0.23.1) have a peer dep on `tree-sitter@^0.21.1` while we install `tree-sitter@0.25.0`. This causes a peer dep warning but **works correctly** — verified in testing. The tree-sitter ABI is backward-compatible. pnpm resolves this without errors.

### Updated Dependency Count

| | Before (v1) | After |
|---|---|---|
| Required | `@lancedb/lancedb`, `openai` | `@lancedb/lancedb`, `openai`, `tree-sitter` + 7 grammars |
| **Total** | **2** | **10** |

---

## 4. Build Requirements

### Node 24 + C++20

tree-sitter 0.25.0 compiles native C code via node-gyp. On **Node 24**, the V8 headers require C++20 but tree-sitter's `binding.gyp` doesn't pass `"-std=c++20"`. This causes a build failure:

```
v8config.h:13:2: error: "C++20 or later required."
```

**Fix**: Set `CXXFLAGS="-std=c++20"` at install time:

```bash
CXXFLAGS="-std=c++20" pnpm install
```

This will be unnecessary once tree-sitter publishes 0.26.x on npm (which tracks tree-sitter core 0.26.6, already released).

### Platform Requirements

| Platform | Requirement | Notes |
|----------|------------|-------|
| macOS | Xcode Command Line Tools | Same as LanceDB — already required |
| Linux | `build-essential`, `python3` | Same as LanceDB — already required |
| Windows | Visual Studio Build Tools (C++) | Same as LanceDB — already required |

**No new platform requirements.** Anyone who can install `@lancedb/lancedb` can install tree-sitter.

### tree-sitter-css ESM Note

`tree-sitter-css@0.25.0` uses ESM with top-level await. In pi-index (which is ESM via TypeScript), this works natively with `import`. If using CommonJS, a dynamic `import()` is needed. Since pi-index already uses ESM (`"type": "module"` or `.ts` → ESM output), this is a non-issue.

---

## 5. Splittable Node Types

These are the AST node types that represent logical code boundaries — where chunks should be split.

### Code Languages

```typescript
const SPLITTABLE_NODES: Record<string, string[]> = {
  javascript: [
    'function_declaration',       // function foo() {}
    'arrow_function',             // const foo = () => {}
    'class_declaration',          // class Foo {}
    'method_definition',          // foo() {} inside class body
    'export_statement',           // export function/class/const
  ],

  typescript: [
    'function_declaration',       // function foo() {}
    'arrow_function',             // const foo = () => {}
    'class_declaration',          // class Foo {}
    'method_definition',          // foo() {} inside class body
    'export_statement',           // export function/class/const
    'interface_declaration',      // interface Foo {}
    'type_alias_declaration',     // type Foo = ...
  ],

  python: [
    'function_definition',        // def foo(): (ANY nesting level)
    'async_function_definition',  // async def foo():
    'class_definition',           // class Foo:
    'decorated_definition',       // @decorator \n def foo():
  ],

  ruby: [
    'method',                     // def foo ... end
    'singleton_method',           // def self.foo ... end
    'class',                      // class Foo ... end
    'module',                     // module Bar ... end
  ],
};
```

### Markup & Style Languages

```typescript
const MARKUP_SPLITTABLE_NODES: Record<string, string[]> = {
  html: [
    'element',                    // any HTML element
    // Strategy: split at depth-1 elements only (direct children of <html> or <body>)
    // to avoid micro-chunks from deeply nested DOM nodes
  ],

  css: [
    'rule_set',                   // .btn { ... }
    'media_statement',            // @media (...) { ... }
    'keyframes_statement',        // @keyframes name { ... }
    'import_statement',           // @import url(...)
    'supports_statement',         // @supports (...) { ... }
    'charset_statement',          // @charset "UTF-8"
    'namespace_statement',        // @namespace ...
  ],

  erb: [
    'directive',                  // <% ... %>
    'output_directive',           // <%= ... %>
    'content',                    // raw HTML between directives
    // Strategy: group consecutive content + directive nodes into logical blocks
    // rather than splitting every single node (which would be too granular)
  ],
};
```

### HTML Chunking Strategy

HTML requires special handling because naively splitting at every `element` would create thousands of micro-chunks. The strategy:

1. Parse with tree-sitter-html
2. Walk the tree to **depth 1-2 only** (children of `<html>`, `<head>`, `<body>`)
3. Each top-level section (`<head>`, `<nav>`, `<main>`, `<section>`, `<footer>`, `<aside>`, `<article>`) becomes one chunk
4. If a section exceeds `MAX_CHUNK_LINES`, sub-split at its direct children
5. Inline elements (`<span>`, `<a>`, `<em>`) never trigger a split

This produces semantically meaningful chunks: the header, the navigation, the main content area, the footer — each as a separate indexed unit.

### CSS Chunking Strategy

CSS has natural boundaries: each rule set and at-rule is a self-contained unit. The strategy:

1. Parse with tree-sitter-css
2. Split at every top-level `rule_set` and `media_statement` / `keyframes_statement`
3. Group small consecutive rules (< 5 lines each) into a single chunk to avoid micro-chunks
4. `@media` blocks become one chunk including their inner rules

### ERB Chunking Strategy

ERB templates mix Ruby logic with HTML markup. Two-phase approach:

1. **Phase 1**: Parse with tree-sitter-embedded-template → splits into `directive`, `output_directive`, `content` nodes
2. **Phase 2**: Group nodes into logical blocks:
   - A `directive` (e.g., `<% if @user %>`) + all nodes until its matching `<% end %>` → one chunk
   - Large `content` sections → further parse with tree-sitter-html for deeper splitting
3. Each logical block (conditional, loop, partial render + its HTML) becomes one chunk
4. Standalone `content` between blocks becomes its own chunk

This preserves the relationship between Ruby logic and its rendered HTML.

---

## 6. Architecture

### File Structure

```
extensions/index/
├── chunker.ts                 ← MODIFIED: delegates to ast-chunker or regex fallback
├── ast-chunker.ts             ← NEW: tree-sitter AST parsing + splitting
├── ast-chunker.test.ts        ← NEW: tests for all 8 languages
├── constants.ts               ← MODIFIED: add AST_LANGUAGES set
├── ...existing files...
```

### Flow

```
chunkFile(filePath, content, mtime)
  │
  ├── language = detectLanguage(extension)
  │
  ├── AST_LANGUAGES.has(language)?
  │     │
  │     YES ──→ astChunkFile(filePath, content, mtime, language)
  │     │         │
  │     │         ├── parser.setLanguage(grammar)
  │     │         ├── tree = parser.parse(content)
  │     │         ├── walk tree, split at SPLITTABLE_NODES
  │     │         ├── sub-split oversized chunks (> MAX_CHUNK_LINES)
  │     │         ├── add chunk overlap (CHUNK_OVERLAP_LINES)
  │     │         └── return CodeChunk[]
  │     │
  │     NO ───→ regexChunkFile(filePath, content, mtime, language)
  │               │
  │               └── existing regex boundary detection (unchanged)
  │
  └── return CodeChunk[]
```

### Key Design Decisions

1. **Single `Parser` instance, reused** — `parser.setLanguage()` is fast; no need for one parser per language
2. **Grammars loaded once at module level** — `import` at top of `ast-chunker.ts`, not per call
3. **Regex chunker stays** — it's the fallback for SQL, Markdown, YAML, TOML, .env, and any future language without a tree-sitter grammar
4. **`chunkFile()` interface unchanged** — callers don't know or care which chunker runs
5. **Chunk overlap added to both paths** — new `CHUNK_OVERLAP_LINES` constant (default: 5 lines) applied after splitting, regardless of AST vs regex path

---

## 7. Chunk Overlap

**New addition** — neither the v1 code nor the v2 plan includes chunk overlap. claude-context uses 300-character overlap by default.

### Why It Matters

Without overlap, a function call at the end of chunk N and its definition at the start of chunk N+1 are completely disconnected in the embedding space. The agent searching for "where is `validateToken` called?" won't find the caller if it's at the boundary.

### Implementation

After all chunks are produced (by either AST or regex path), apply overlap:

```typescript
const CHUNK_OVERLAP_LINES = 5; // configurable via PI_INDEX_CHUNK_OVERLAP

function addOverlap(chunks: CodeChunk[]): CodeChunk[] {
  if (chunks.length <= 1) return chunks;

  return chunks.map((chunk, i) => {
    if (i === 0) return chunk;

    const prevChunk = chunks[i - 1];
    const prevLines = prevChunk.text.split('\n');
    const overlapLines = prevLines.slice(-CHUNK_OVERLAP_LINES);
    const overlapText = overlapLines.join('\n');

    return {
      ...chunk,
      text: overlapText + '\n' + chunk.text,
      startLine: Math.max(1, chunk.startLine - CHUNK_OVERLAP_LINES),
    };
  });
}
```

Overlap is prepended from the previous chunk's last N lines. `startLine` is adjusted to reflect the actual content range. The `endLine` stays the same — overlap only extends backward.

---

## 8. ERB Two-Phase Parsing Detail

ERB is the most complex language because it's a template that contains two languages: Ruby directives and HTML content.

### Phase 1: ERB Parse

```
Input: <h1><%= @title %></h1><% if @user %><p>Hello <%= @user.name %></p><% end %>

tree-sitter-embedded-template output:
  content       "<h1>"
  output_dir    "<%= @title %>"
  content       "</h1>"
  directive     "<% if @user %>"
  content       "<p>Hello "
  output_dir    "<%= @user.name %>"
  content       "</p>"
  directive     "<% end %>"
```

### Phase 2: Group Into Logical Blocks

```
Block 1: content + output_dir + content  →  "<h1><%= @title %></h1>"
Block 2: directive + content + output_dir + content + directive
          →  "<% if @user %><p>Hello <%= @user.name %></p><% end %>"
```

Grouping rules:
- A `directive` that opens a block (`if`, `each`, `do`, `unless`, `case`) starts a new group
- All nodes until the matching `end` directive belong to that group
- Consecutive `content` + `output_directive` nodes without block directives are merged
- Standalone `content` > 10 lines gets its own chunk (and can be further parsed with tree-sitter-html)

### When to Sub-Parse HTML Content

If a `content` node in an ERB template is large (> 20 lines of pure HTML), it's worth running tree-sitter-html on just that content to split it at `<section>`, `<div>`, etc. For small content nodes (< 20 lines), keep them as-is.

---

## 9. Configuration

### New Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PI_INDEX_CHUNK_OVERLAP` | `5` | Number of lines to overlap between consecutive chunks (0 to disable) |

### New Constants

```typescript
// constants.ts additions

/** Languages with tree-sitter AST support. */
export const AST_LANGUAGES = new Set([
  'typescript', 'javascript', 'python', 'ruby',
  'html', 'css', 'erb',
]);

/** Default chunk overlap in lines. */
export const CHUNK_OVERLAP_LINES = 5;

/** HTML: maximum depth for element splitting (avoid micro-chunks). */
export const HTML_SPLIT_MAX_DEPTH = 2;

/** ERB: minimum content lines before sub-parsing with HTML parser. */
export const ERB_HTML_SUBPARSE_THRESHOLD = 20;

/** CSS: minimum lines for a rule group before splitting. */
export const CSS_MIN_GROUP_LINES = 5;
```

---

## 10. Test Plan

### Unit Tests (`ast-chunker.test.ts`)

#### Python Tests
```typescript
it("splits Python class methods into separate chunks", () => {
  const chunks = astChunkFile("app/services/user_service.py", pythonClassWith3Methods, now);
  expect(chunks.length).toBeGreaterThanOrEqual(3);
  expect(chunks.some(c => c.symbol === "authenticate")).toBe(true);
  expect(chunks.some(c => c.symbol === "validate_token")).toBe(true);
});

it("handles decorated Python functions", () => {
  const content = `@login_required\nasync def protected_view(request):\n    return response`;
  const chunks = astChunkFile("views.py", content, now);
  expect(chunks[0].symbol).toBe("protected_view");
});

it("handles nested classes", () => {
  const content = `class Outer:\n    class Inner:\n        def method(self):\n            pass`;
  const chunks = astChunkFile("nested.py", content, now);
  expect(chunks.some(c => c.symbol === "method")).toBe(true);
});
```

#### TypeScript Tests
```typescript
it("splits TypeScript class methods into separate chunks", () => {
  const chunks = astChunkFile("src/auth/controller.ts", tsClassWith2Methods, now);
  expect(chunks.some(c => c.symbol === "login")).toBe(true);
  expect(chunks.some(c => c.symbol === "validateToken")).toBe(true);
});

it("handles interfaces and type aliases", () => {
  const content = `interface User { name: string; }\ntype Role = 'admin' | 'user';`;
  const chunks = astChunkFile("types.ts", content, now);
  expect(chunks.length).toBeGreaterThanOrEqual(2);
});

it("handles arrow functions assigned to exports", () => {
  const content = `export const handler = async (req: Request) => {\n  return new Response();\n};`;
  const chunks = astChunkFile("handler.ts", content, now);
  expect(chunks.length).toBeGreaterThanOrEqual(1);
});
```

#### Ruby Tests
```typescript
it("splits Ruby methods inside modules and classes", () => {
  const chunks = astChunkFile("app/models/user.rb", rubyModuleWithClass, now);
  expect(chunks.some(c => c.symbol === "validate")).toBe(true);
  expect(chunks.some(c => c.symbol === "decode_jwt")).toBe(true);
});

it("handles singleton methods (def self.foo)", () => {
  const content = `class Config\n  def self.load\n    {}\n  end\nend`;
  const chunks = astChunkFile("config.rb", content, now);
  expect(chunks.some(c => c.symbol === "load")).toBe(true);
});
```

#### JavaScript Tests
```typescript
it("splits arrow functions and declarations", () => {
  const chunks = astChunkFile("src/middleware.js", jsWithArrowAndFunction, now);
  expect(chunks.length).toBeGreaterThanOrEqual(2);
});
```

#### HTML Tests
```typescript
it("splits HTML at top-level sections", () => {
  const chunks = astChunkFile("index.html", fullHtmlPage, now);
  expect(chunks.length).toBeGreaterThanOrEqual(2); // head + body at minimum
});

it("does not create micro-chunks from deeply nested elements", () => {
  const content = `<div><span><a href="#">link</a></span></div>`;
  const chunks = astChunkFile("fragment.html", content, now);
  expect(chunks.length).toBe(1); // all nested, stays as one chunk
});
```

#### CSS Tests
```typescript
it("splits CSS at rule sets and @media blocks", () => {
  const chunks = astChunkFile("styles.css", cssWithMediaQueries, now);
  expect(chunks.some(c => c.text.includes("@media"))).toBe(true);
  expect(chunks.some(c => c.text.includes(".btn"))).toBe(true);
});
```

#### ERB Tests
```typescript
it("groups ERB blocks with their content", () => {
  const chunks = astChunkFile("index.html.erb", erbWithConditional, now);
  // The if/end block should be one chunk, not split at every directive
  const ifChunk = chunks.find(c => c.text.includes("<% if"));
  expect(ifChunk?.text).toContain("<% end %>");
});

it("keeps small ERB templates as a single chunk", () => {
  const content = `<h1><%= @title %></h1>\n<p><%= @body %></p>`;
  const chunks = astChunkFile("show.html.erb", content, now);
  expect(chunks.length).toBe(1);
});
```

#### Overlap Tests
```typescript
it("applies overlap between consecutive chunks", () => {
  const chunks = astChunkFile("large.py", pythonFileWith10Functions, now);
  // Second chunk should start with last 5 lines of first chunk
  const firstChunkLastLines = chunks[0].text.split('\n').slice(-5).join('\n');
  expect(chunks[1].text.startsWith(firstChunkLastLines)).toBe(true);
});

it("first chunk has no overlap prefix", () => {
  const chunks = astChunkFile("large.py", pythonFileWith10Functions, now);
  // First chunk starts at line 1, no overlap
  expect(chunks[0].startLine).toBe(1);
});
```

#### Fallback Tests
```typescript
it("falls back to regex chunker for SQL", () => {
  const chunks = chunkFile("schema.sql", sqlContent, now);
  // SQL is not in AST_LANGUAGES — uses regex
  expect(chunks.length).toBeGreaterThan(0);
});

it("falls back to regex chunker for Markdown", () => {
  const chunks = chunkFile("README.md", markdownContent, now);
  expect(chunks.length).toBeGreaterThan(0);
});
```

---

## 11. Integration with v2 Plan

### Tasks to Modify

| Plan Task | Change |
|-----------|--------|
| **Task 10** (extended file types) | Split into two parts: (a) add file extensions to LANGUAGE_MAP for the new languages (Go, Rust, YAML, etc. — regex only), (b) new task for tree-sitter AST chunking (this document) |
| **Task 13** (parent-child chunks) | Parent chunks still work — the parent is the file, children are AST-split chunks instead of regex-split chunks. No change to Task 13's design. |
| **Task 14** (contextual enrichment) | `enrichForEmbedding()` gets better symbol data from AST — tree-sitter extracts actual function/method names, not regex guesses. Enrichment quality improves automatically. |

### New Task to Add

Insert after current Task 10, before Task 11:

> **Task 10b: Tree-sitter AST chunking for TS, JS, Python, Ruby, HTML, CSS, ERB**
>
> Add `tree-sitter` and 7 language grammars as required dependencies. Create `ast-chunker.ts` that parses files using tree-sitter AST, splits at language-specific node types, sub-splits oversized chunks, and applies chunk overlap. Modify `chunker.ts` to delegate to AST chunker for supported languages and fall back to regex for others. Add `CHUNK_OVERLAP_LINES` constant (default: 5) applied to both AST and regex paths.
>
> **Files:**
> - Create: `extensions/index/ast-chunker.ts`
> - Create: `extensions/index/ast-chunker.test.ts`
> - Modify: `extensions/index/chunker.ts` (add delegation logic)
> - Modify: `extensions/index/constants.ts` (add AST_LANGUAGES, CHUNK_OVERLAP_LINES)
> - Modify: `package.json` (add 8 tree-sitter dependencies)
>
> **Dependencies to add to `package.json`:**
> ```json
> {
>   "dependencies": {
>     "tree-sitter": "^0.25.0",
>     "tree-sitter-javascript": "^0.25.0",
>     "tree-sitter-typescript": "^0.23.2",
>     "tree-sitter-python": "^0.25.0",
>     "tree-sitter-ruby": "^0.23.1",
>     "tree-sitter-html": "^0.23.2",
>     "tree-sitter-css": "^0.25.0",
>     "tree-sitter-embedded-template": "^0.25.0"
>   }
> }
> ```

### What This Does NOT Change

- **Search pipeline** — `db.ts`, `searcher.ts`, `mmr.ts` are untouched. Chunks go through the same embedding → hybrid search → MMR reranking pipeline.
- **`CodeChunk` type** — same fields, same interface. AST chunker produces `CodeChunk[]` just like regex chunker.
- **Indexer flow** — `indexer.ts` calls `chunkFile()` which returns chunks. It doesn't know or care about the internal chunking strategy.
- **Tools and commands** — `codebase_search`, `codebase_index`, `/index-rebuild` all work identically.

---

## 12. Symbol Extraction

Tree-sitter gives us better symbol names than regex. Each language has a pattern for extracting the human-readable name from AST nodes:

```typescript
function extractSymbol(node: Parser.SyntaxNode, language: string): string {
  switch (language) {
    case 'python':
      // function_definition → child 'identifier' is the name
      // class_definition → child 'identifier' is the name
      // decorated_definition → recurse into the inner definition
      return node.children.find(c => c.type === 'identifier')?.text
        ?? node.children.find(c => c.type === 'function_definition')
             ?.children.find(c => c.type === 'identifier')?.text
        ?? '';

    case 'typescript':
    case 'javascript':
      // method_definition → child 'property_identifier' is the name
      // function_declaration → child 'identifier' is the name
      // class_declaration → child 'identifier' is the name
      // arrow_function → no name (anonymous), use parent variable name if available
      return node.children.find(c =>
        c.type === 'property_identifier' || c.type === 'identifier'
      )?.text ?? '';

    case 'ruby':
      // method → child 'identifier' is the name
      // class → child 'constant' is the name
      // module → child 'constant' is the name
      return node.children.find(c =>
        c.type === 'identifier' || c.type === 'constant'
      )?.text ?? '';

    case 'html':
      // element → first child is tag name
      const tagNode = node.children.find(c => c.type === 'start_tag');
      return tagNode?.children.find(c => c.type === 'tag_name')?.text ?? '';

    case 'css':
      // rule_set → first child is selectors
      return node.children.find(c => c.type === 'selectors')?.text?.slice(0, 50) ?? '';

    case 'erb':
      // directive → the text content
      return node.text.slice(0, 50);

    default:
      return '';
  }
}
```

---

## 13. Known Limitations

### tree-sitter 0.25.0 on Node 24
- Requires `CXXFLAGS="-std=c++20"` at install time
- Will be fixed when tree-sitter 0.26.x is published to npm (core already at 0.26.6)
- Document in README with install instructions

### Peer Dependency Warnings
- `tree-sitter-html@0.23.2` and `tree-sitter-ruby@0.23.1` warn about peer dep `tree-sitter@^0.21.1` vs installed `0.25.0`
- These are warnings only — parsers work correctly
- Will resolve when those packages publish 0.25.x versions

### ERB Block Matching
- The ERB parser provides flat node lists, not nested block structure
- Matching `<% if %>` to `<% end %>` requires heuristic counting (count `if`/`each`/`do`/`unless`/`case` opens vs `end` closes)
- Edge cases: `<% end if %>` (modifier form), `<% rescue %>` (exception handling)
- Fallback: if block matching fails, treat the entire ERB file as sequential chunks split by size

### HTML Depth Heuristic
- Splitting at depth 1-2 is a heuristic — some layouts have meaningful structure at depth 3+
- The `HTML_SPLIT_MAX_DEPTH` constant allows tuning per project
- Worst case: some chunks are larger than ideal but never incorrectly split

### Languages Not Covered
- SQL, Markdown, YAML, TOML, .env, shell, Go, Rust, Java, C/C++, C# — all use regex fallback
- Tree-sitter grammars exist for most of these but are out of scope for this task
- Can be added incrementally in future tasks (each grammar is one `pnpm add` + one entry in the node type map)
