import { Document, Packer, Paragraph, ImageRun } from 'docx'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const imgPath = path.join(__dirname, 'screenshots', 'login.png')
const data = fs.readFileSync(imgPath)

console.log('Image size:', data.length, 'bytes')

// Test 1: basic ImageRun
try {
  const run = new ImageRun({
    data,
    transformation: { width: 300, height: 284 },
    type: 'png',
  })
  console.log('ImageRun created OK')

  const doc = new Document({
    sections: [{
      children: [
        new Paragraph({ children: [run] })
      ]
    }]
  })
  const buf = await Packer.toBuffer(doc)
  fs.writeFileSync(path.join(__dirname, '..', 'test-image.docx'), buf)
  console.log('✅ test-image.docx created, size:', buf.length)
} catch (e) {
  console.error('❌ Error:', e.message)
  console.error(e.stack)
}
