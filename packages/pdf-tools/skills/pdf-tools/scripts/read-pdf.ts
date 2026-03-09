#!/usr/bin/env tsx
/**
 * Read/extract content from a PDF file.
 * Usage: tsx skills/pdf-tools/scripts/read-pdf.ts <pdf-path> [options-json]
 * Options: { "mode": "text"|"metadata"|"all" }
 * Output: JSON to stdout with extracted text, page count, metadata
 */
import fs from 'fs';
import { PDFParse } from 'pdf-parse';

const args = process.argv.slice(2);
if (!args[0] || args[0] === '--help') {
  console.error('Usage: tsx skills/pdf-tools/scripts/read-pdf.ts <pdf-path> [options-json]');
  console.error('Options: { "mode": "text"|"metadata"|"all" }');
  console.error('Modes: text = extracted text only, metadata = PDF info only, all (default) = both');
  console.error('');
  console.error('Exit codes: 0 = success, 1 = error (missing file, invalid PDF, etc.)');
  process.exit(args[0] === '--help' ? 0 : 1);
}

const filePath = args[0];
const options = args[1] ? JSON.parse(args[1]) : {};
const mode = options.mode || 'all';

if (!fs.existsSync(filePath)) {
  console.error(`Error: file not found: ${filePath}`);
  process.exit(1);
}

try {
  const buffer = fs.readFileSync(filePath);
  const parser = new PDFParse({ data: new Uint8Array(buffer), verbosity: 0 });

  const result: Record<string, unknown> = {};

  if (mode === 'text' || mode === 'all') {
    const textResult = await parser.getText();
    result.text = textResult.text;
    result.numPages = textResult.total;
  }

  if (mode === 'metadata' || mode === 'all') {
    const infoResult = await parser.getInfo();
    result.metadata = infoResult.info;
    result.numPages = infoResult.total;
    result.fingerprints = infoResult.fingerprints;
  }

  console.log(JSON.stringify(result, null, 2));
} catch (err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`Error reading PDF: ${message}`);
  process.exit(1);
}
