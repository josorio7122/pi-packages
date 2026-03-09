#!/usr/bin/env tsx
/**
 * Create a new PDF document with professional formatting.
 * Usage: tsx skills/pdf-tools/scripts/create-pdf.ts <output-path> <content-json-or-file>
 *
 * Content JSON structure:
 * {
 *   "title": "Document Title",
 *   "author": "Author Name",
 *   "margins": { "top": 72, "bottom": 72, "left": 72, "right": 72 },
 *   "defaultFont": "Helvetica",
 *   "defaultFontSize": 12,
 *   "elements": [
 *     { "type": "heading", "text": "Section Title", "level": 1 },
 *     { "type": "paragraph", "text": "Body text here..." },
 *     { "type": "list", "items": ["Item 1", "Item 2"], "style": "bullet" },
 *     { "type": "spacer", "height": 20 },
 *     { "type": "divider" },
 *     { "type": "text", "text": "Custom text", "fontSize": 10, "font": "Helvetica-Bold", "align": "center", "color": "#333333" },
 *     { "type": "pageBreak" },
 *     { "type": "columns", "columns": ["Left col text", "Right col text"], "widths": [250, 250] },
 *     { "type": "keyValue", "pairs": [["Name", "John"], ["Email", "john@example.com"]] }
 *   ]
 * }
 */
import PDFDocument from 'pdfkit';
import fs from 'fs';

const args = process.argv.slice(2);
if (!args[0] || !args[1] || args[0] === '--help') {
  console.error('Usage: tsx skills/pdf-tools/scripts/create-pdf.ts <output-path> <content-json-or-file>');
  console.error('Pass content as a JSON string or as a path to a .json file.');
  console.error('');
  console.error('Element types: heading, paragraph, text, list, spacer, divider, pageBreak, columns, keyValue');
  console.error('');
  console.error('Exit codes: 0 = success, 1 = error (invalid JSON, write failure, etc.)');
  process.exit(args[0] === '--help' ? 0 : 1);
}

const outputPath = args[0];
let content: Record<string, unknown>;
try {
  if (args[1].startsWith('{')) {
    content = JSON.parse(args[1]);
  } else {
    content = JSON.parse(fs.readFileSync(args[1], 'utf-8'));
  }
} catch {
  console.error('Error: content must be a valid JSON string or path to a JSON file.');
  process.exit(1);
}

interface Margins {
  top?: number;
  bottom?: number;
  left?: number;
  right?: number;
}
interface ContentElement {
  type: string;
  text?: string;
  level?: number;
  items?: string[];
  style?: string;
  height?: number;
  fontSize?: number;
  font?: string;
  align?: string;
  color?: string;
  columns?: string[];
  widths?: number[];
  pairs?: [string, string][];
}

const margins: Margins = (content.margins as Margins) || { top: 72, bottom: 72, left: 72, right: 72 };
const defaultFont = (content.defaultFont as string) || 'Helvetica';
const defaultFontSize = (content.defaultFontSize as number) || 12;

const doc = new PDFDocument({
  margins: {
    top: margins.top ?? 72,
    bottom: margins.bottom ?? 72,
    left: margins.left ?? 72,
    right: margins.right ?? 72,
  },
  info: {
    Title: (content.title as string) || 'Document',
    Author: (content.author as string) || 'pdf-tools',
  },
});

let pageCount = 1;
doc.on('pageAdded', () => { pageCount++; });

const stream = fs.createWriteStream(outputPath);
doc.pipe(stream);

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

const elements = (content.elements as ContentElement[]) || [];

for (const el of elements) {
  switch (el.type) {
    case 'heading': {
      const sizes: Record<number, number> = { 1: 24, 2: 20, 3: 16, 4: 14 };
      const size = sizes[el.level ?? 1] ?? 24;
      doc.font('Helvetica-Bold').fontSize(size);
      if (el.color) doc.fillColor(hexToRgb(el.color));
      else doc.fillColor([0, 0, 0]);
      doc.text(el.text ?? '', { align: 'left' });
      doc.moveDown(0.5);
      doc.font(defaultFont).fontSize(defaultFontSize).fillColor([0, 0, 0]);
      break;
    }
    case 'paragraph': {
      doc.font(defaultFont).fontSize(defaultFontSize).fillColor([0, 0, 0]);
      doc.text(el.text ?? '', {
        align: (el.align as 'left' | 'center' | 'right' | 'justify') ?? 'left',
        lineGap: 4,
      });
      doc.moveDown(0.8);
      break;
    }
    case 'text': {
      const font = el.font ?? defaultFont;
      const size = el.fontSize ?? defaultFontSize;
      doc.font(font).fontSize(size);
      if (el.color) doc.fillColor(hexToRgb(el.color));
      else doc.fillColor([0, 0, 0]);
      doc.text(el.text ?? '', {
        align: (el.align as 'left' | 'center' | 'right' | 'justify') ?? 'left',
      });
      doc.moveDown(0.5);
      doc.font(defaultFont).fontSize(defaultFontSize).fillColor([0, 0, 0]);
      break;
    }
    case 'list': {
      const numbered = el.style === 'numbered';
      const items = el.items ?? [];
      for (let i = 0; i < items.length; i++) {
        const prefix = numbered ? `${i + 1}. ` : '• ';
        doc.font(defaultFont).fontSize(defaultFontSize).fillColor([0, 0, 0]);
        doc.text(`${prefix}${items[i]}`, { indent: 20, lineGap: 3 });
      }
      doc.moveDown(0.8);
      break;
    }
    case 'spacer': {
      doc.moveDown((el.height ?? 20) / defaultFontSize);
      break;
    }
    case 'divider': {
      const x = doc.x;
      const pageWidth = doc.page.width - (margins.left ?? 72) - (margins.right ?? 72);
      doc
        .moveTo(x, doc.y)
        .lineTo(x + pageWidth, doc.y)
        .lineWidth(0.5)
        .strokeColor([180, 180, 180])
        .stroke();
      doc.moveDown(0.8);
      break;
    }
    case 'pageBreak': {
      doc.addPage();
      break;
    }
    case 'columns': {
      const cols = el.columns ?? [];
      const totalWidth = doc.page.width - (margins.left ?? 72) - (margins.right ?? 72);
      const widths = el.widths ?? cols.map(() => totalWidth / cols.length);
      const startX = doc.x;
      const startY = doc.y;
      let maxHeight = 0;
      for (let i = 0; i < cols.length; i++) {
        const colX = startX + widths.slice(0, i).reduce((a, b) => a + b, 0);
        doc.font(defaultFont).fontSize(defaultFontSize).fillColor([0, 0, 0]);
        doc.text(cols[i], colX, startY, { width: widths[i] - 10 });
        maxHeight = Math.max(maxHeight, doc.y - startY);
      }
      doc.y = startY + maxHeight;
      doc.moveDown(0.5);
      break;
    }
    case 'keyValue': {
      const pairs = el.pairs ?? [];
      for (const [key, val] of pairs) {
        doc.font('Helvetica-Bold').fontSize(defaultFontSize).fillColor([0, 0, 0]);
        doc.text(`${key}: `, { continued: true });
        doc.font(defaultFont).text(val);
      }
      doc.moveDown(0.5);
      break;
    }
  }
}

doc.end();

stream.on('finish', () => {
  console.log(
    JSON.stringify({ success: true, path: outputPath, pages: pageCount }),
  );
});

stream.on('error', (err: Error) => {
  console.error(`Error writing PDF: ${err.message}`);
  process.exit(1);
});
