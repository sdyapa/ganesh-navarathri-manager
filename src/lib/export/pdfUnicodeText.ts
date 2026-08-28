// jsPDF's built-in "standard 14" fonts (Helvetica/Times/Courier) only cover the WinAnsi/Latin-1
// glyph range. Any text outside that — Telugu, Hindi, Tamil, or any other non-Latin script —
// renders as a row of garbled boxes via doc.text() or an autoTable cell, the same underlying
// cause as the ₹ symbol issue (see currency.ts's formatCurrencyForPdf). Unlike the currency
// symbol, there's no plain-ASCII substitute for a donor's name or a custom app name written in
// Telugu, and embedding one specific script's font wouldn't generalize — free-text fields
// (display name, donor name, notes, category/commodity/unit names) can contain any script the
// user's keyboard produces.
//
// Instead, text containing non-Latin-1 characters is rasterized via an offscreen <canvas> using
// the browser's own font stack — the browser already knows how to fall back to a script-
// appropriate system font per character — and placed into the PDF as an image instead of vector
// text. Plain ASCII/Latin-1 text (the common case) is untouched and stays crisp vector text.

const PX_PER_PT = 96 / 72

// Deliberately matches the full Latin-1 byte range (including its control-character codepoints)
// to detect any character outside it.
export function needsRasterRendering(text: string): boolean {
  // eslint-disable-next-line no-control-regex
  return /[^\x00-\xFF]/.test(text)
}

export interface RasterTextResult {
  dataUrl: string
  widthPt: number
  heightPt: number
  /** Distance in pt from the text baseline up to the top of the image — subtract this from the
   *  baseline y you'd otherwise pass to doc.text() to get the y for doc.addImage(). */
  baselineOffsetPt: number
}

export function rasterizeText(text: string, fontSizePt: number, options: { bold?: boolean; color?: string } = {}): RasterTextResult {
  const scale = 4
  const fontPx = fontSizePt * PX_PER_PT * scale
  const weight = options.bold ? '700' : '400'
  const font = `${weight} ${fontPx}px 'Segoe UI', 'Noto Sans', Arial, sans-serif`

  const measuringCtx = document.createElement('canvas').getContext('2d')!
  measuringCtx.font = font
  const metrics = measuringCtx.measureText(text)
  const ascent = metrics.actualBoundingBoxAscent || fontPx * 0.75
  const descent = metrics.actualBoundingBoxDescent || fontPx * 0.25
  const pad = 4
  const widthPx = Math.max(1, Math.ceil(metrics.width) + pad * 2)
  const heightPx = Math.max(1, Math.ceil(ascent + descent) + pad * 2)

  const canvas = document.createElement('canvas')
  canvas.width = widthPx
  canvas.height = heightPx
  const ctx = canvas.getContext('2d')!
  ctx.font = font
  ctx.fillStyle = options.color ?? '#000000'
  ctx.textBaseline = 'alphabetic'
  ctx.fillText(text, pad, pad + ascent)

  const unitsPerPt = PX_PER_PT * scale
  return {
    dataUrl: canvas.toDataURL('image/png'),
    widthPt: widthPx / unitsPerPt,
    heightPt: heightPx / unitsPerPt,
    baselineOffsetPt: (pad + ascent) / unitsPerPt,
  }
}
