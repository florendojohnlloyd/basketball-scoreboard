// Test the full doc structure section by section to find what breaks Word
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  Table, TableRow, TableCell, WidthType, BorderStyle,
  AlignmentType, ShadingType, Header, ImageRun,
  TableLayoutType,
} from 'docx'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SCREENSHOTS = path.join(__dirname, 'screenshots')

const BRAND_DARK = '1A1A2E'
const BRAND_GOLD = 'F0A020'
const WHITE = 'FFFFFF'
const ROW_ALT = 'F5F7FA'

// Test 1: Cover page with shading
async function test(name, children) {
  try {
    const doc = new Document({
      sections: [{ children }]
    })
    const buf = await Packer.toBuffer(doc)
    const outPath = path.join(__dirname, '..', `test-${name}.docx`)
    fs.writeFileSync(outPath, buf)
    console.log(`✅ test-${name}.docx OK (${buf.length} bytes)`)
  } catch(e) {
    console.error(`❌ test-${name} FAILED: ${e.message}`)
  }
}

// Test cover shading paragraph
await test('cover-shading', [
  new Paragraph({
    alignment: AlignmentType.CENTER,
    shading: { type: ShadingType.SOLID, color: BRAND_DARK, fill: BRAND_DARK },
    children: [new TextRun({ text: 'LigaControl', bold: true, size: 72, color: BRAND_GOLD })],
  })
])

// Test table with shading
await test('table-shading', [
  new Table({
    layout: TableLayoutType.FIXED,
    width: { size: 9000, type: WidthType.DXA },
    rows: [
      new TableRow({
        tableHeader: true,
        children: [
          new TableCell({
            shading: { type: ShadingType.SOLID, color: BRAND_DARK, fill: BRAND_DARK },
            margins: { top: 80, bottom: 80, left: 120, right: 120 },
            children: [new Paragraph({
              children: [new TextRun({ text: 'Header', bold: true, size: 20, color: WHITE })]
            })]
          })
        ]
      }),
      new TableRow({
        children: [
          new TableCell({
            shading: { type: ShadingType.SOLID, color: WHITE, fill: WHITE },
            margins: { top: 60, bottom: 60, left: 120, right: 120 },
            children: [new Paragraph({
              children: [new TextRun({ text: 'Data row', size: 20 })]
            })]
          })
        ]
      }),
    ]
  })
])

// Test header element
await test('doc-header', [
  new Paragraph({ children: [new TextRun({ text: 'Body text' })] })
], )

// Actually test with Header
try {
  const doc = new Document({
    sections: [{
      headers: {
        default: new Header({
          children: [
            new Paragraph({
              border: { bottom: { color: BRAND_DARK, space: 1, style: BorderStyle.SINGLE, size: 4 } },
              children: [
                new TextRun({ text: 'LigaControl', bold: true, size: 18, color: BRAND_GOLD }),
                new TextRun({ text: '  |  Guide', size: 18, color: '888888' }),
              ],
            })
          ]
        })
      },
      children: [new Paragraph({ children: [new TextRun({ text: 'Body' })] })]
    }]
  })
  const buf = await Packer.toBuffer(doc)
  fs.writeFileSync(path.join(__dirname, '..', 'test-header.docx'), buf)
  console.log(`✅ test-header.docx OK (${buf.length} bytes)`)
} catch(e) {
  console.error(`❌ test-header FAILED: ${e.message}`)
}

// Test code block shading
await test('code-shading', [
  new Paragraph({
    shading: { type: ShadingType.SOLID, color: '1a1a2e', fill: '1a1a2e' },
    children: [new TextRun({ text: 'code block text', size: 18, color: 'f0a020', font: 'Courier New' })],
  })
])

// Test image embedded
const imgData = fs.readFileSync(path.join(SCREENSHOTS, 'login.png'))
await test('image-in-doc', [
  new Paragraph({ children: [new TextRun({ text: 'Before image' })] }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new ImageRun({ data: imgData, transformation: { width: 300 * 9525, height: 284 * 9525 }, type: 'png' })]
  }),
  new Paragraph({ children: [new TextRun({ text: 'After image' })] }),
])
