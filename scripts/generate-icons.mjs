// Generates placeholder PWA icons (flat orange background + a cream temple-bell silhouette,
// echoing the 🕉️ used elsewhere in the app's branding) as real PNG files using only Node's
// built-in zlib — no image library dependency needed for a build step that only ever runs once.
// Replace public/icons/*.png with real branded artwork before a real deployment; these exist so
// the PWA manifest has valid icons out of the box.
import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const outDir = join(__dirname, '..', 'public', 'icons')
mkdirSync(outDir, { recursive: true })

const ORANGE = [234, 88, 12]
const CREAM = [255, 247, 237]

function crc32(buf) {
  let c
  const table = crc32.table || (crc32.table = (() => {
    const t = new Uint32Array(256)
    for (let n = 0; n < 256; n++) {
      c = n
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      t[n] = c
    }
    return t
  })())
  let crc = 0xffffffff
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii')
  const lenBuf = Buffer.alloc(4)
  lenBuf.writeUInt32BE(data.length, 0)
  const crcBuf = Buffer.alloc(4)
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0)
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf])
}

// A temple-bell (ghanta) silhouette: a rounded dome (upper arc of a circle) flaring linearly
// into a wider rim below it — two simple curves, kept detail-free (no handle/clapper) so it
// still reads clearly at the smallest 192px size rather than blurring into noise.
function isBellGlyph(gx, gy, R) {
  const domeCenterY = -0.1 * R
  const domeRadius = 0.5 * R
  const rimHalfWidth = 0.9 * R
  const domeTopY = domeCenterY - domeRadius
  const rimY = 0.55 * R

  if (gy < domeTopY || gy > rimY) return false

  let halfWidth
  if (gy <= domeCenterY) {
    const under = domeRadius * domeRadius - (gy - domeCenterY) * (gy - domeCenterY)
    halfWidth = under > 0 ? Math.sqrt(under) : 0
  } else {
    const t = (gy - domeCenterY) / (rimY - domeCenterY)
    halfWidth = domeRadius + (rimHalfWidth - domeRadius) * t
  }
  return Math.abs(gx) <= halfWidth
}

function buildPng(size, { maskable = false } = {}) {
  const pixels = Buffer.alloc(size * size * 3)
  const center = size / 2
  // Glyph bounding radius, inset further for maskable icons per the safe-zone spec.
  const inset = maskable ? size * 0.28 : size * 0.22
  const glyphRadius = size / 2 - inset

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const gx = x - center
      const gy = y - center
      const isGlyph = isBellGlyph(gx, gy, glyphRadius)
      const color = isGlyph ? CREAM : ORANGE
      const idx = (y * size + x) * 3
      pixels[idx] = color[0]
      pixels[idx + 1] = color[1]
      pixels[idx + 2] = color[2]
    }
  }

  const rowSize = size * 3 + 1
  const raw = Buffer.alloc(rowSize * size)
  for (let y = 0; y < size; y++) {
    raw[y * rowSize] = 0 // filter type: none
    pixels.copy(raw, y * rowSize + 1, y * size * 3, (y + 1) * size * 3)
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 2 // color type: RGB
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0

  const idat = deflateSync(raw)
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

  return Buffer.concat([signature, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))])
}

writeFileSync(join(outDir, 'icon-192.png'), buildPng(192))
writeFileSync(join(outDir, 'icon-512.png'), buildPng(512))
writeFileSync(join(outDir, 'icon-512-maskable.png'), buildPng(512, { maskable: true }))

console.log('Generated placeholder PWA icons in public/icons/')
