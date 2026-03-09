---
name: pdf-tools
description: Read, create, and edit PDF files. Use when you need to extract text or metadata from existing PDFs, generate new professionally formatted PDFs with headings, paragraphs, lists, and multi-column layouts, or modify existing PDFs by adding text, images, merging pages, removing pages, or updating metadata — all without destroying existing layout. Requires Node.js 18+ and tsx.
compatibility: "Requires Node.js 18+, tsx, and the pdf-tools package dependencies installed (pnpm install from the package root)"
metadata:
  author: josorio7122
  version: "1.0"
---

# PDF Tools

Read, create, and edit PDF files using Node.js. Three scripts cover the full workflow: extracting content from existing PDFs, generating new formatted documents, and modifying PDFs non-destructively.

## Prerequisites

Node.js 18+ and `tsx` must be available. Dependencies must be installed from the package root:

```bash
node --version   # must be >= 18
tsx --version
```

Scripts live at `skills/pdf-tools/scripts/` relative to the package root (`packages/pdf-tools/`). Always run them from the package root so Node.js can resolve dependencies:

```bash
cd /path/to/packages/pdf-tools
tsx skills/pdf-tools/scripts/read-pdf.ts --help
```

## Available Scripts

- **`skills/pdf-tools/scripts/read-pdf.ts`** — Extract text and metadata from a PDF
- **`skills/pdf-tools/scripts/create-pdf.ts`** — Generate a new PDF from a content JSON spec
- **`skills/pdf-tools/scripts/edit-pdf.ts`** — Modify an existing PDF (add text, images, merge, remove pages)

All scripts output JSON to stdout and diagnostics to stderr. Pass `--help` to any script for usage details.

---

## 1. Read PDF

Extract text content and metadata from an existing PDF file.

```bash
tsx skills/pdf-tools/scripts/read-pdf.ts <pdf-path> [options-json]
```

**Options JSON fields:**

| Field | Values | Default | Description |
|-------|--------|---------|-------------|
| `mode` | `"text"` \| `"metadata"` \| `"all"` | `"all"` | What to extract |

**Examples:**

```bash
# Extract everything (text + metadata)
tsx skills/pdf-tools/scripts/read-pdf.ts /path/to/file.pdf

# Text only
tsx skills/pdf-tools/scripts/read-pdf.ts /path/to/file.pdf '{"mode":"text"}'

# Metadata only
tsx skills/pdf-tools/scripts/read-pdf.ts /path/to/file.pdf '{"mode":"metadata"}'
```

**Output shape:**

```json
{
  "text": "Extracted page text...",
  "numPages": 5,
  "metadata": {
    "Title": "My Document",
    "Author": "Jane Smith",
    "CreationDate": "D:20240101120000"
  }
}
```

---

## 2. Create PDF

Generate a new PDF document from a structured content specification.

```bash
tsx skills/pdf-tools/scripts/create-pdf.ts <output-path> <content-json-or-file>
```

Pass content inline as a JSON string or as a path to a `.json` file.

**Top-level content fields:**

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `title` | string | `"Document"` | PDF title metadata |
| `author` | string | `"pdf-tools"` | PDF author metadata |
| `margins` | object | `{top:72,bottom:72,left:72,right:72}` | Page margins in points |
| `defaultFont` | string | `"Helvetica"` | Base font for body text |
| `defaultFontSize` | number | `12` | Base font size in points |
| `elements` | array | `[]` | Content elements (see below) |

**Element types:**

| `type` | Key fields | Description |
|--------|-----------|-------------|
| `heading` | `text`, `level` (1–4), `color` | Bold heading, size auto-scaled by level |
| `paragraph` | `text`, `align` | Body paragraph with line gap |
| `text` | `text`, `fontSize`, `font`, `align`, `color` | Fully custom text block |
| `list` | `items[]`, `style` (`"bullet"` \| `"numbered"`) | Bullet or numbered list |
| `spacer` | `height` (points) | Vertical whitespace |
| `divider` | — | Horizontal rule |
| `pageBreak` | — | Start a new page |
| `columns` | `columns[]`, `widths[]` | Multi-column text layout |
| `keyValue` | `pairs[]` (`[key, value]` tuples) | Bold key + regular value rows |

**Example:**

```bash
tsx skills/pdf-tools/scripts/create-pdf.ts /tmp/report.pdf '{
  "title": "Quarterly Report",
  "author": "Finance Team",
  "elements": [
    { "type": "heading", "text": "Q1 2024 Summary", "level": 1 },
    { "type": "paragraph", "text": "Revenue increased 12% year-over-year." },
    { "type": "divider" },
    { "type": "list", "items": ["Growth in APAC", "Cost reduction"], "style": "bullet" },
    { "type": "keyValue", "pairs": [["Total Revenue", "$4.2M"], ["Net Profit", "$1.1M"]] }
  ]
}'
```

**Output:**

```json
{ "success": true, "path": "/tmp/report.pdf", "pages": 1 }
```

---

## 3. Edit PDF

Modify an existing PDF non-destructively: add text overlays, embed images, merge in other PDFs, remove pages, or update document metadata.

```bash
tsx skills/pdf-tools/scripts/edit-pdf.ts <input-path> <output-path> <operations-json-or-file>
```

Pass operations inline as a JSON string or as a path to a `.json` file. The input file is never modified; results are saved to the output path.

**Operation types:**

| `type` | Key fields | Description |
|--------|-----------|-------------|
| `addText` | `page`, `text`, `x`, `y`, `size`, `color`, `font` | Draw text at absolute coordinates |
| `addImage` | `page`, `imagePath`, `x`, `y`, `width`, `height` | Embed PNG or JPEG at absolute coordinates |
| `addPage` | `width`, `height` | Append a blank page (default: letter 612×792) |
| `mergePdf` | `pdfPath`, `pages[]` | Append pages from another PDF (all if omitted) |
| `removePage` | `page` | Remove page by 0-based index (processed last, reverse order) |
| `setMetadata` | `title`, `author` | Update document title/author |

Page indices are 0-based. `removePage` operations are always applied last (in reverse index order) regardless of their position in the array.

**Example:**

```bash
tsx skills/pdf-tools/scripts/edit-pdf.ts /tmp/input.pdf /tmp/output.pdf '{
  "operations": [
    { "type": "addText", "page": 0, "text": "DRAFT", "x": 200, "y": 700, "size": 48, "color": [200, 0, 0] },
    { "type": "setMetadata", "title": "Draft Document", "author": "Review Team" },
    { "type": "mergePdf", "pdfPath": "/tmp/appendix.pdf" }
  ]
}'
```

**Output:**

```json
{
  "success": true,
  "inputPath": "/tmp/input.pdf",
  "outputPath": "/tmp/output.pdf",
  "totalPages": 7,
  "operationsApplied": 3
}
```

---

## Rules

- **Always use absolute paths** for input, output, and any referenced image or PDF files.
- **Run scripts from the package root** (`packages/pdf-tools/`) so Node.js module resolution finds the installed dependencies.
- **JSON output goes to stdout; diagnostics go to stderr** — capture stdout when you need to parse results.
- **edit-pdf.ts never modifies the input file** — always specify a distinct output path.
- **Coordinates in edit-pdf.ts are PDF units** (points, 1/72 inch), with origin at the bottom-left of the page. A typical letter page is 612×792 points.
- **Colors in create-pdf.ts** use hex strings (`"#ff0000"`). Colors in edit-pdf.ts use `[R, G, B]` arrays (0–255).
- Check `--help` for each script if unsure about the interface.
