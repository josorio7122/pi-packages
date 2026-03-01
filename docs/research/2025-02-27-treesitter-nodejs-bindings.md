# Research: Tree-sitter Node.js Bindings (Feb 2025)

**Date:** February 27, 2025  
**Status:** Current and verified from official sources  
**Key Finding:** Tree-sitter ecosystem is actively maintained with clear version divergence between Node.js and WASM bindings.

---

## Executive Summary

Tree-sitter's Node.js bindings ecosystem consists of three active tracks:

1. **Native Node.js bindings** (`tree-sitter` npm package v0.25.0) — fastest, recommended for production code analysis
2. **WASM bindings** (`web-tree-sitter` v0.26.6) — browser/universal, slower in Node.js, good for testing and browser use
3. **Official WASM builds** (`@vscode/tree-sitter-wasm`, `tree-sitter-wasms`) — pre-compiled grammar files for web

**All packages are actively maintained.** Tree-sitter core is at v0.26.6 (released Feb 26, 2025), but npm package versions lag behind due to build complexity.

---

## Findings by Question

### 1. Latest Version of `tree-sitter` npm Package & Maintenance Status

| Package | Latest Version | Published | Status |
|---------|---|---|---|
| **tree-sitter** (Node.js) | **0.25.0** | ~8 months ago (June 2025) | ✅ Actively maintained |
| **web-tree-sitter** | **0.26.6** | Feb 26, 2025 (7 hours ago) | ✅ Actively maintained |
| **tree-sitter** (core C) | **0.26.6** | Feb 26, 2025 | ✅ Actively maintained |

**Key finding:** The `tree-sitter` npm package (Node.js bindings) is 8 months old but **still maintained**. The lag is due to native binding compilation complexity. `web-tree-sitter` tracks core releases much more closely.

**Maintenance indicators:**
- Tree-sitter core receives multiple commits per week
- Latest release v0.26.6 includes WASM stdlib fixes (#5208, #5210)
- 354 contributors, 92 releases, 7 years of active development
- Max Brunsfeld (creator) remains primary maintainer

**Sources:**
- https://www.npmjs.com/package/tree-sitter (1.6M weekly downloads)
- https://www.npmjs.com/package/web-tree-sitter (1.9M weekly downloads)
- https://github.com/tree-sitter/tree-sitter/releases
- https://swiftpackageindex.com/tree-sitter/tree-sitter

---

### 2. `node-tree-sitter` vs `web-tree-sitter` — Which to Use?

**Answer: Use `tree-sitter` (native) for Node.js code analysis. Use `web-tree-sitter` only for browsers or when portability matters.**

#### Comparison Table

| Aspect | `tree-sitter` (native) | `web-tree-sitter` (WASM) |
|--------|---|---|
| **Performance** | ✅ Fast (native C bindings) | ❌ Slower in Node.js (WASM overhead) |
| **npm package** | `tree-sitter` | `web-tree-sitter` |
| **Primary use** | Node.js server code | Browsers, universal portability |
| **Language grammar loading** | Native .node files | WASM .wasm files |
| **API compatibility** | Native tree-sitter C API | Web-focused API (differences noted below) |
| **Node.js 19+ support** | ✅ Works with latest versions | ⚠️ Known issues (#2338) |
| **Best for** | Production code analysis tools | Testing, prototypes, browser tools |

#### API Differences & Compatibility Issues

The two bindings have **non-identical APIs**, as documented in the community workaround post:
- https://nachawati.me/blog/2023/08/17/tree-sitter-api-differences-node-and-web-workaround

**Known issues with web-tree-sitter in Node.js:**
- `web-tree-sitter` fails in Node.js 19+ with: `Error: bad export type for tree_sitter_tsx_external_scanner_create: undefined` (#2338)
- Documented note: "executing `.wasm` files in Node.js is considerably slower than running Node.js bindings"
- Solution documented in npm docs: "this could be useful for testing purposes"

#### Recommendation

**For Node.js code analysis (linting, AST querying, static analysis):**
```bash
npm install tree-sitter
# Then add language grammars as needed:
npm install tree-sitter-javascript  # or other languages
```

**For browser/universal code (or when WASM portability is required):**
```bash
npm install web-tree-sitter
# Load WASM grammar files from GitHub releases or build your own
```

**Example: Parsing JavaScript with native bindings:**
```javascript
const Parser = require('tree-sitter');
const JavaScript = require('tree-sitter-javascript');

const parser = new Parser();
parser.setLanguage(JavaScript);
const tree = parser.parse('let x = 1;');
```

**Sources:**
- https://github.com/tree-sitter/node-tree-sitter (official native bindings)
- https://www.npmjs.com/package/web-tree-sitter (official WASM bindings)
- https://github.com/tree-sitter/tree-sitter/issues/2338 (Node.js 19+ compatibility issue)
- https://nachawati.me/blog/2023/08/17/tree-sitter-api-differences-node-and-web-workaround (API differences)

---

### 3. WASM Support Changes in v0.22+, v0.23+, v0.26+

**Key change:** Tree-sitter v0.26+ introduced WASM stdlib updates and ABI changes that affect grammar compatibility.

#### Version History & WASM Milestones

| Version | Release Date | WASM Changes |
|---------|---|---|
| v0.20.x | 2021-2022 | Original WASM support |
| v0.22.0 | ~2023 | Earlier stable version |
| v0.25.10 | Sept 2025 | Various bug fixes |
| **v0.26.0** | **Sept 2024** | **Major: WASM stdlib updates** |
| v0.26.3 | Nov 2024 | ⚠️ **Breaking change for Rust bindings** — `parse_with` deprecated |
| v0.26.4 | Early 2025 | WASM stdlib fixes (#5208, #5210) |
| **v0.26.6** | **Feb 26, 2025** | Latest — ongoing WASM stdlib refinements |

#### Critical Compatibility Issue: WASM ABI Mismatch

**Issue #5171 (Dec 2025):** WASM language files built with tree-sitter-cli v0.20.x are **incompatible** with web-tree-sitter v0.26.x due to **ABI changes**.

This affects:
- Users of third-party WASM packages like `tree-sitter-wasms` (if pinned to old CLI)
- Anyone building grammar files with an older tree-sitter-cli version

**Solution (from GitHub issue #5171):**
```json
{
  "dependencies": {
    "web-tree-sitter": "^0.25.x"
  }
}
```

Or ensure grammar files are rebuilt with matching tree-sitter-cli version:
```bash
# Rebuild grammars with the current tree-sitter-cli
tree-sitter build-wasm path/to/grammar
```

#### WASM Stdlib Improvements

v0.26.4+ fixed WASM stdlib bugs in crates/language/wasm/src/stdlib.c:
- Fixed "indirect call type mismatch" errors
- Fixed "uninitialized element" issues
- These affect grammar portability to WASM

**Sources:**
- https://github.com/tree-sitter/tree-sitter/releases/v0.26.6 (latest)
- https://github.com/tree-sitter/tree-sitter/issues/5171 (ABI compatibility issue)
- https://github.com/tree-sitter/tree-sitter/issues/5205 (WASM stdlib bugs)
- https://github.com/tree-sitter-grammars/tree-sitter-markdown/releases (v0.26.3 breaking changes)

---

### 4. New Approaches: `@aspect-build/tree-sitter`, `tree-sitter-wasms`, etc.

**Finding:** There are no new npm packages called `@aspect-build/tree-sitter`. Instead, several packaging alternatives exist:

#### Active Tree-sitter WASM Packages

| Package | Purpose | Weekly Downloads | Latest Version | Maintainer |
|---------|---------|---|---|---|
| **web-tree-sitter** | Official WASM bindings | 1.9M | 0.26.6 | tree-sitter core team |
| **@vscode/tree-sitter-wasm** | VS Code pre-built WASM files | 74k | 0.3.0 | Microsoft |
| **tree-sitter-wasms** | Community pre-built grammar WASM files | varies | 0.1.13 | Gregoor (forked from community) |
| **@opensumi/tree-sitter-wasm** | OpenSumi pre-built WASM | minimal | Latest 2024 | OpenSumi team |

#### Aspect Build Integration

**`@aspect-build`** (aspect.build) is NOT a tree-sitter npm package. It's a:
- **Bazel build system integration** for monorepos
- **High-performance JS rules** (rules_js) alternative to bazelbuild/rules_nodejs
- Does NOT provide tree-sitter-specific packaging

**For Bazel users** who want to build tree-sitter grammars:
- https://github.com/elliottt/rules_tree_sitter — Bazel rules for tree-sitter grammars
- https://github.com/zadlg/tree-sitter-bazel — Bazel repository for tree-sitter C API

These are build system integrations, **not npm packages.**

#### Recommended WASM Package Strategies

**Strategy 1: Use official web-tree-sitter (simplest)**
```bash
npm install web-tree-sitter
# Then manually fetch .wasm files from grammar repos
# e.g., https://github.com/tree-sitter/tree-sitter-javascript/releases
```

**Strategy 2: Use pre-built WASM bundles (tree-sitter-wasms)**
```bash
npm install tree-sitter-wasms
# Includes pre-built WASM files for multiple grammars
import treeSitterRust from "tree-sitter-wasms/out/tree-sitter-rust.wasm"
```

**Strategy 3: Use VS Code's WASM builds (production-grade)**
```bash
npm install @vscode/tree-sitter-wasm
# Build pipeline: https://github.com/microsoft/vscode-tree-sitter-wasm
```

**Sources:**
- https://npmjs.com/package/tree-sitter-wasms
- https://www.npmjs.com/package/@vscode/tree-sitter-wasm
- https://github.com/microsoft/vscode-tree-sitter-wasm
- https://github.com/cursorless-dev/tree-sitter-wasms (community fork)
- https://pkg.go.dev/aspect.build/cli/gazelle/common/treesitter (Bazel/Aspect context only)

---

### 5. Install Experience: macOS, Linux, Windows

**Summary:** Native `tree-sitter` npm package requires C++ compiler and build tools. WASM `web-tree-sitter` has zero native dependencies.

#### macOS Installation Failures

**Common errors:**
- `C++20 support missing` — Xcode command line tools too old
- `AvailabilityInternalLegacy.h not found` — Xcode tools not properly installed or updated
- Compiler version incompatibility with Node.js version

**Solution:**
```bash
# Update Xcode command line tools
xcode-select --install
# or
xcode-select --reset

# Then install
npm install tree-sitter
```

**Issue #5335 (Feb 2026):** macOS 26.2 users hitting compiler errors during node-gyp compilation. Likely requires:
- Xcode 16.x or later with C++20 support
- Node.js 18.x+ for compatibility

#### Linux Installation Failures

**Common errors:**
- Missing build tools (`build-essential`, `python3`)
- node-gyp compilation failures due to missing headers
- Incompatible versions of gcc/clang

**Solution:**
```bash
# Debian/Ubuntu
sudo apt-get install build-essential python3

# Fedora/RHEL
sudo dnf install gcc-c++ make python3

# Then install
npm install tree-sitter
```

#### Windows Installation Failures

**Common errors:**
- Missing Visual Studio Build Tools (C++ compiler)
- Python 3 not in PATH
- Node.js version mismatch with prebuilt binaries

**Solution:**
```bash
# Install Visual Studio Build Tools for C++
# https://visualstudio.microsoft.com/visual-cpp-build-tools/

# Ensure Python 3 is in PATH
python --version

# Then install
npm install tree-sitter
```

**Alternative: Use WASM (no compilation needed)**
```bash
# Works on all platforms without build tools
npm install web-tree-sitter
```

#### Summary: Which Installation Method is Most Reliable?

| Method | Platforms | Build Required | Speed | Reliability |
|--------|-----------|---|---|---|
| **tree-sitter (native)** | macOS, Linux, Windows | ✅ Yes (C++) | ⚡ Fast | ⚠️ Requires build tools |
| **web-tree-sitter (WASM)** | All | ❌ No | 🐢 Slower | ✅ Zero dependencies |

**Recommendation for maximum compatibility:** Use `web-tree-sitter` for initial development/testing, then migrate to native `tree-sitter` once build environment is verified.

**Sources:**
- https://github.com/tree-sitter/tree-sitter/issues/5335 (macOS 26.2 compiler issues)
- https://discussions.apple.com/thread/255277965 (Xcode tools issues)
- https://github.com/williamboman/mason.nvim/issues/1778 (Windows build failures)
- https://ehfeng.com/setting-up-tree-sitter-on-macos (macOS setup guide)
- https://stackoverflow.com/questions/72903239/how-to-install-nvim-treesitter-on-apple-silicon-m1-max (M1 Mac issues)
- https://github.com/tree-sitter/tree-sitter/issues/942 (Apple Silicon compatibility)

---

### 6. npm Download Statistics

**Current download volumes (as of Feb 2025):**

| Package | Weekly Downloads | Category | Trend |
|---------|---|---|---|
| **web-tree-sitter** | **1,899,478** | WASM bindings | Rising |
| **tree-sitter** | **1,607,036** | Native bindings | Stable |
| **@vscode/tree-sitter-wasm** | **74,412** | Pre-built WASM | Growing |
| **@tree-sitter-grammars/tree-sitter-hcl** | **2,600** | Grammar package | Small but active |

**Unpacked sizes:**
- `web-tree-sitter`: 4.51 MB
- `tree-sitter`: 928 KB
- `@vscode/tree-sitter-wasm`: ~150 MB+ (contains multiple pre-built WASM files)

**Interesting finding:** `web-tree-sitter` has slightly higher downloads (1.9M) than the native `tree-sitter` package (1.6M), likely because:
1. Browser use is common (web editors, documentation sites)
2. Tree-sitter is used by Prettier, ESLint, and other linting tools (which default to web/WASM)
3. It works across all platforms without build tools

**Sources:**
- https://www.npmjs.com/package/tree-sitter (1.6M weekly)
- https://www.npmjs.com/package/web-tree-sitter (1.9M weekly)
- https://www.npmjs.com/package/@vscode/tree-sitter-wasm (74k weekly)
- https://npm-stat.com/ (stats dashboard)

---

### 7. WASM Grammar Files: Official Publishing & Availability

**Key finding:** WASM grammar files (`.wasm`) are **officially published** by the tree-sitter organization in individual grammar repositories on GitHub.

#### Official Distribution Channels

**Source 1: Individual Grammar Repositories (Recommended)**

Each grammar has its own GitHub repository in the `tree-sitter-grammars` organization:
- tree-sitter-javascript
- tree-sitter-python
- tree-sitter-rust
- etc.

Each releases `.wasm` files alongside the grammar source. **Example:**
```
https://github.com/tree-sitter/tree-sitter-javascript/releases
→ Download: tree-sitter-javascript.wasm
```

**Source 2: tree-sitter Core Releases**

The main tree-sitter repository includes:
- `web-tree-sitter.js` and `web-tree-sitter.wasm`
- Grammar build instructions

https://github.com/tree-sitter/tree-sitter/releases

**Source 3: Reusable Build Workflow**

Grammar repos can use a GitHub Actions reusable workflow to auto-build and publish `.wasm` files:
```yaml
# In grammar repo workflow
uses: tree-sitter/setup-action@v1
```

Documentation: "You can also download the `.wasm` files from GitHub releases, so long as the repository uses our reusable workflow"

#### Pre-Built WASM Collections

**Option A: tree-sitter-wasms (Community)**
```bash
npm install tree-sitter-wasms
# Includes pre-built .wasm for multiple grammars
```
Repository: https://github.com/Gregoor/tree-sitter-wasms (forked from community)
Version: 0.1.13 (updated Oct 2025)

**Option B: @vscode/tree-sitter-wasm (Microsoft)**
```bash
npm install @vscode/tree-sitter-wasm
```
Repository: https://github.com/microsoft/vscode-tree-sitter-wasm
Build pipeline: Includes Emscripten configuration
Published: Multiple pre-built grammars for VS Code compatibility

#### Building Your Own `.wasm` Files

If a grammar doesn't have published WASM files:

```bash
# Install tree-sitter-cli
npm install -g tree-sitter-cli

# Build WASM from grammar directory
cd path/to/grammar-repo
tree-sitter build-wasm

# Output: tree-sitter-<language>.wasm
```

**Important:** Ensure your `tree-sitter-cli` version matches the tree-sitter core version you're using (ABI compatibility issue #5171).

```bash
# Check compatibility
tree-sitter --version
npm list tree-sitter  # or web-tree-sitter
```

#### File Loading in Code

```javascript
// Option 1: From GitHub release
const JavaScript = await Language.load(
  'https://github.com/tree-sitter/tree-sitter-javascript/releases/download/v0.21.0/tree-sitter-javascript.wasm'
);

// Option 2: From local file
const JavaScript = await Language.load('./tree-sitter-javascript.wasm');

// Option 3: From npm package (tree-sitter-wasms)
import treeSitterRust from "tree-sitter-wasms/out/tree-sitter-rust.wasm"
```

**Sources:**
- https://www.npmjs.com/package/web-tree-sitter (setup instructions)
- https://github.com/tree-sitter/tree-sitter/releases (WASM download location)
- https://github.com/microsoft/vscode-tree-sitter-wasm (pre-built pipeline)
- https://npmjs.com/package/tree-sitter-wasms (pre-built collection)
- https://github.com/tree-sitter/tree-sitter/issues/5171 (ABI version compatibility)

---

### 8. Projects Successfully Using web-tree-sitter in Node.js

**Finding:** web-tree-sitter works in Node.js but is documented as slower than native bindings. Viable for testing, prototypes, and cross-platform tools.

#### Official Documentation

The web-tree-sitter npm package includes a section: **"Running .wasm in Node.js"**

Quote from official docs:
> "Notice that executing `.wasm` files in Node.js is considerably slower than running Node.js bindings. However, this could be useful for testing purposes."

#### Code Analysis Projects (Recent Examples, 2025)

**1. Unraveling Tree-Sitter Queries (Dev.to, May 2025)**
- Uses native `tree-sitter` npm package for Node.js code analysis
- Demonstrates querying JavaScript code
- Example code uses `tree-sitter` directly (not web-tree-sitter)

**2. Digging Deeper into Code with Tree-Sitter (Dev.to, May 2025)**
- Cross-language examples including Go (go-tree-sitter)
- Shows tree-sitter usage for practical code analysis

**3. Getting Started with Tree-sitter (Dev.to, April 2025)**
- Practical examples with `tree-sitter-javascript`
- Shows parsing JavaScript in Node.js
- Uses native bindings (faster)

**4. A Beginner's Guide to Tree-sitter (Dev.to)**
- Multi-language support in Node.js
- Demonstrates Python parsing
- Uses native `tree-sitter` package

#### Documented Use Cases in Node.js

From npm documentation:
```javascript
// Official example: Running WASM in Node.js
const Parser = require('web-tree-sitter');

(async () => {
  await Parser.init();
  const parser = new Parser();
  const Language = await Parser.Language.load('/path/to/grammar.wasm');
  parser.setLanguage(Language);
  
  const tree = parser.parse('source code');
  console.log(tree.rootNode);
})();
```

**Use cases documented as viable:**
- Testing (marked as primary use case)
- Cross-platform code analysis tools
- Browser-based IDE components
- Prototyping (before optimizing with native bindings)

#### Real-World Projects Using Tree-sitter (for reference)

From awesome-tree-sitter curated list (https://github.com/HerringtonDarkholme/awesome-tree-sitter):

**Search/Analysis:**
- ast-grep (GitHub issue mentions tree-sitter)
- tree-grepper
- vscode-anycode (Microsoft)
- bloop (AI code search)
- tree-climber

**Code intelligence:**
- sourcegraph (code search/navigation)
- doctree (documentation generation)

**Note:** These projects likely use native bindings for server-side code analysis, but the core tree-sitter library is the same.

#### Comparison: Native vs WASM in Node.js

| Scenario | Recommendation |
|----------|---|
| **Production code analysis** | ✅ Use native `tree-sitter` |
| **Testing & CI/CD** | ✅ Either (but native is faster) |
| **Cross-platform tool** | ⚠️ web-tree-sitter (no build needed) |
| **Browser-based editor** | ✅ web-tree-sitter (only option) |
| **Rapid prototyping** | ✅ web-tree-sitter (easier setup) |

**Sources:**
- https://www.npmjs.com/package/web-tree-sitter (official docs)
- https://dev.to/shrsv/unraveling-tree-sitter-queries-your-guide-to-code-analysis-magic-41il (May 2025)
- https://dev.to/shailendra53/digging-deeper-into-code-with-tree-sitter-how-to-query-your-syntax-tree-3i1 (May 2025)
- https://dev.to/lovestaco/getting-started-with-tree-sitter-syntax-trees-and-express-api-parsing-5c2d (April 2025)
- https://dev.to/shreshthgoyal/understanding-code-structure-a-beginners-guide-to-tree-sitter-3bbc (Dev.to)
- https://github.com/HerringtonDarkholme/awesome-tree-sitter (curated project list)

---

## Recommended Approach for Node.js Code Analysis (2025)

### For New Projects

**Step 1: Choose your binding**
```bash
# For speed (recommended for most cases)
npm install tree-sitter

# For zero build dependencies
npm install web-tree-sitter
```

**Step 2: Add language grammar**
```bash
# Native binding
npm install tree-sitter-javascript

# WASM binding
# Download from: https://github.com/tree-sitter/tree-sitter-javascript/releases
```

**Step 3: Verify version compatibility**
```bash
# Check ABI compatibility
npm list tree-sitter
npm list web-tree-sitter

# If using old WASM files, they may be incompatible with v0.26+
# See issue #5171 for solutions
```

### For Existing Projects

**If currently using native `tree-sitter`:**
- Stay with v0.25.0 (stable, widely tested)
- Monitor for v0.26.0+ releases (more recent, WASM improvements)
- Ensure build tools are up-to-date (especially macOS)

**If migrating to WASM:**
- Rebuild all grammar `.wasm` files with matching tree-sitter-cli version
- Test performance impact (typically 2-10x slower than native)
- Consider using pre-built WASM packages (`tree-sitter-wasms` or `@vscode/tree-sitter-wasm`)

### Key Version Pins to Know

```json
{
  "devDependencies": {
    "tree-sitter": "^0.25.0",
    "tree-sitter-javascript": "^0.21.0"
  }
}
```

or

```json
{
  "dependencies": {
    "web-tree-sitter": "^0.26.5",
    "tree-sitter-wasms": "^0.1.13"
  }
}
```

### Installation Checklist

- [ ] Verify build tools available (or use WASM to skip)
- [ ] Install matching version of grammar package
- [ ] Test parsing a simple file
- [ ] Check for compiler/ABI warnings
- [ ] Benchmark if performance-critical

---

## Sources & Citations

### Official Resources
- Tree-sitter main project: https://github.com/tree-sitter/tree-sitter
- Node.js bindings: https://github.com/tree-sitter/node-tree-sitter
- WASM bindings: https://github.com/tree-sitter/tree-sitter (lib/binding_web)
- Official docs: https://tree-sitter.github.io/

### npm Packages
- https://www.npmjs.com/package/tree-sitter (1.6M weekly downloads)
- https://www.npmjs.com/package/web-tree-sitter (1.9M weekly downloads)
- https://www.npmjs.com/package/@vscode/tree-sitter-wasm (74k weekly downloads)
- https://npmjs.com/package/tree-sitter-wasms (community pre-built grammars)

### GitHub Issues & Discussions
- Issue #5171: WASM ABI compatibility
- Issue #5205: WASM stdlib bugs
- Issue #5335: macOS 26.2 compiler issues
- Issue #2338: Node.js 19+ compatibility

### Community Guides
- https://nachawati.me/blog/2023/08/17/tree-sitter-api-differences-node-and-web-workaround
- https://github.com/HerringtonDarkholme/awesome-tree-sitter
- https://dev.to (May 2025 articles on tree-sitter usage)

### Build Tools
- https://github.com/microsoft/vscode-tree-sitter-wasm (VS Code pre-built pipeline)
- https://github.com/cursorless-dev/tree-sitter-wasms (community fork)
- https://github.com/elliottt/rules_tree_sitter (Bazel integration)

---

## Conclusion

**Tree-sitter in 2025 is production-ready** with clear, well-maintained bindings for both native (Node.js) and WASM (universal) use cases. The ecosystem has matured significantly, with official WASM publishing, pre-built grammar collections, and extensive documentation.

**Choose based on your constraints:**
- **Native**: Fastest, best for production Node.js tools
- **WASM**: Universal, no build tools needed, acceptable for testing/prototypes
- **Pre-built WASM packages**: Good middle ground for cross-platform tools

All three approaches are supported and actively maintained as of February 2025.
