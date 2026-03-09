#!/usr/bin/env tsx
/**
 * Edit an existing PDF: add text, images, merge pages, remove pages, set metadata.
 * Usage: tsx skills/pdf-tools/scripts/edit-pdf.ts <input-path> <output-path> <operations-json-or-file>
 *
 * Operations JSON structure:
 * {
 *   "operations": [
 *     { "type": "addText", "page": 0, "text": "Hello", "x": 100, "y": 500, "size": 12, "color": [0, 0, 0], "font": "bold" },
 *     { "type": "addImage", "page": 0, "imagePath": "/path/to/image.png", "x": 100, "y": 300, "width": 200, "height": 100 },
 *     { "type": "addPage", "width": 612, "height": 792 },
 *     { "type": "mergePdf", "pdfPath": "/path/to/other.pdf", "pages": [0, 1] },
 *     { "type": "removePage", "page": 2 },
 *     { "type": "setMetadata", "title": "New Title", "author": "Author" }
 *   ]
 * }
 *
 * Notes:
 * - Page indices are 0-based.
 * - removePage operations are applied last (in reverse order) regardless of array position.
 * - Coordinates use PDF points (1/72 inch); origin is bottom-left of the page.
 * - color for addText is [R, G, B] with values 0-255.
 * - addImage supports PNG and JPEG.
 */
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import fs from 'fs';

const args = process.argv.slice(2);
if (!args[0] || !args[1] || !args[2] || args[0] === '--help') {
  console.error('Usage: tsx skills/pdf-tools/scripts/edit-pdf.ts <input-path> <output-path> <operations-json-or-file>');
  console.error('Pass operations as a JSON string or as a path to a .json file.');
  console.error('');
  console.error('Operation types: addText, addImage, addPage, mergePdf, removePage, setMetadata');
  console.error('');
  console.error('Exit codes: 0 = success, 1 = error (file not found, invalid PDF, invalid JSON, etc.)');
  process.exit(args[0] === '--help' ? 0 : 1);
}

const inputPath = args[0];
const outputPath = args[1];

if (!fs.existsSync(inputPath)) {
  console.error(`Error: input file not found: ${inputPath}`);
  process.exit(1);
}

let ops: Record<string, unknown>;
try {
  if (args[2].startsWith('{')) {
    ops = JSON.parse(args[2]);
  } else {
    ops = JSON.parse(fs.readFileSync(args[2], 'utf-8'));
  }
} catch {
  console.error('Error: operations must be a valid JSON string or path to a JSON file.');
  process.exit(1);
}

interface Operation {
  type: string;
  page?: number;
  text?: string;
  x?: number;
  y?: number;
  size?: number;
  color?: [number, number, number];
  font?: string;
  imagePath?: string;
  width?: number;
  height?: number;
  pdfPath?: string;
  pages?: number[];
  title?: string;
  author?: string;
}

try {
  const existingBytes = fs.readFileSync(inputPath);
  const pdfDoc = await PDFDocument.load(existingBytes);
  const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const operations = (ops.operations as Operation[]) ?? [];

  // Split removals out so they run last (in reverse page order) regardless of array position
  const removals = operations
    .filter((op) => op.type === 'removePage')
    .sort((a, b) => (b.page ?? 0) - (a.page ?? 0));
  const others = operations.filter((op) => op.type !== 'removePage');

  for (const op of others) {
    switch (op.type) {
      case 'addText': {
        const page = pdfDoc.getPage(op.page ?? 0);
        const selectedFont = op.font === 'bold' ? boldFont : regularFont;
        const [r, g, b] = op.color ?? [0, 0, 0];
        page.drawText(op.text ?? '', {
          x: op.x ?? 50,
          y: op.y ?? 700,
          size: op.size ?? 12,
          font: selectedFont,
          color: rgb(r / 255, g / 255, b / 255),
        });
        break;
      }
      case 'addImage': {
        if (!op.imagePath) {
          console.error('Warning: addImage operation missing imagePath — skipping.');
          break;
        }
        if (!fs.existsSync(op.imagePath)) {
          console.error(`Warning: image file not found: ${op.imagePath} — skipping.`);
          break;
        }
        const imgBytes = fs.readFileSync(op.imagePath);
        const ext = op.imagePath.toLowerCase();
        const image = ext.endsWith('.png')
          ? await pdfDoc.embedPng(imgBytes)
          : await pdfDoc.embedJpg(imgBytes);
        const page = pdfDoc.getPage(op.page ?? 0);
        page.drawImage(image, {
          x: op.x ?? 50,
          y: op.y ?? 500,
          width: op.width ?? image.width,
          height: op.height ?? image.height,
        });
        break;
      }
      case 'addPage': {
        pdfDoc.addPage([op.width ?? 612, op.height ?? 792]);
        break;
      }
      case 'mergePdf': {
        if (!op.pdfPath) {
          console.error('Warning: mergePdf operation missing pdfPath — skipping.');
          break;
        }
        if (!fs.existsSync(op.pdfPath)) {
          console.error(`Warning: PDF to merge not found: ${op.pdfPath} — skipping.`);
          break;
        }
        const otherBytes = fs.readFileSync(op.pdfPath);
        const otherPdf = await PDFDocument.load(otherBytes);
        const pageIndices =
          op.pages ?? Array.from({ length: otherPdf.getPageCount() }, (_, i) => i);
        const copiedPages = await pdfDoc.copyPages(otherPdf, pageIndices);
        for (const p of copiedPages) {
          pdfDoc.addPage(p);
        }
        break;
      }
      case 'setMetadata': {
        if (op.title) pdfDoc.setTitle(op.title);
        if (op.author) pdfDoc.setAuthor(op.author);
        break;
      }
      default: {
        console.error(`Warning: unknown operation type "${op.type}" — skipping.`);
      }
    }
  }

  // Apply page removals last, in reverse order so earlier indices stay valid
  for (const op of removals) {
    pdfDoc.removePage(op.page ?? 0);
  }

  const savedBytes = await pdfDoc.save();
  fs.writeFileSync(outputPath, savedBytes);

  console.log(
    JSON.stringify({
      success: true,
      inputPath,
      outputPath,
      totalPages: pdfDoc.getPageCount(),
      operationsApplied: operations.length,
    }),
  );
} catch (err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`Error editing PDF: ${message}`);
  process.exit(1);
}
