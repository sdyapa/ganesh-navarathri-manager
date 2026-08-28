// PDF export via jsPDF + jspdf-autotable. autoTable handles pagination, repeating headers on
// every page, and column widths automatically — the spec explicitly calls out "no unusable
// screenshots with clipped tables", which a naive canvas-of-the-DOM PDF cannot guarantee for
// long lists, so real vector text + autoTable is used instead of html2canvas here.
//
// jsPDF/jspdf-autotable are dynamically imported (not top-level) so they land in their own
// chunk and never bloat the initial page load — most visits never export a PDF at all (spec
// "Performance": lazy-load reports/exports where appropriate).
import { formatDisplayDate, formatTimestamp } from '@/lib/date'
import { needsRasterRendering, rasterizeText } from './pdfUnicodeText'
import { APP_NAME } from '@/types'
import type jsPDF from 'jspdf'

/** Draws text with doc.text() when it's plain ASCII/Latin-1 (crisp vector text, the common
 *  case); falls back to a rasterized image for any other script — see pdfUnicodeText.ts. */
function drawText(doc: jsPDF, text: string, x: number, y: number, fontSizePt: number, options: { bold?: boolean; colorGray?: number } = {}) {
  if (!needsRasterRendering(text)) {
    doc.text(text, x, y)
    return
  }
  const gray = options.colorGray ?? 0
  const color = `rgb(${gray}, ${gray}, ${gray})`
  const { dataUrl, widthPt, heightPt, baselineOffsetPt } = rasterizeText(text, fontSizePt, { bold: options.bold, color })
  doc.addImage(dataUrl, 'PNG', x, y - baselineOffsetPt, widthPt, heightPt)
}

/** Same fallback as drawText(), for autoTable cells — suppresses autoTable's own (garbled) text
 *  draw for a non-Latin cell and paints a rasterized image over it instead. Registered once per
 *  table via the didParseCell/didDrawCell hooks below. */
function rasterizeNonLatinCellText(doc: jsPDF, cell: { raw: unknown; text: string[]; x: number; y: number; width: number; height: number; styles: { fontSize: number; cellPadding: number } }) {
  const raw = Array.isArray(cell.raw) ? cell.raw.join(' ') : String(cell.raw ?? '')
  if (!needsRasterRendering(raw)) return
  const pad = typeof cell.styles.cellPadding === 'number' ? cell.styles.cellPadding : 4
  const { dataUrl, widthPt, heightPt } = rasterizeText(raw, cell.styles.fontSize || 8)
  const maxWidth = Math.max(1, cell.width - pad * 2)
  const width = Math.min(widthPt, maxWidth)
  const height = width < widthPt ? heightPt * (width / widthPt) : heightPt
  const y = cell.y + (cell.height - height) / 2
  doc.addImage(dataUrl, 'PNG', cell.x + pad, y, width, height)
}

export interface PdfTableSpec {
  head: string[]
  rows: Array<Array<string>>
}

export interface PdfReportOptions {
  yearName: string
  reportTitle: string
  /** Shown as the document's top heading — the user's customizable display name
   *  (Settings › General), not the fixed internal APP_NAME. Callers must pass it explicitly;
   *  it defaults to APP_NAME only so a caller that genuinely doesn't care still gets a sane
   *  heading rather than a blank one. */
  appName?: string
  orientation?: 'portrait' | 'landscape'
  /** Short key/value lines shown under the title (e.g. totals). */
  summaryLines?: string[]
  table?: PdfTableSpec
  /** Additional tables rendered after the first, each with its own heading. */
  extraTables?: Array<{ heading: string; table: PdfTableSpec }>
}

export async function buildPdfReport(options: PdfReportOptions): Promise<jsPDF> {
  const [{ default: JsPdf }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ])
  const doc = new JsPdf({ orientation: options.orientation ?? 'portrait', unit: 'pt' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const margin = 40
  let cursorY = 50

  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  drawText(doc, options.appName ?? APP_NAME, margin, cursorY, 16, { bold: true })
  cursorY += 20

  doc.setFontSize(13)
  doc.setFont('helvetica', 'normal')
  drawText(doc, `${options.reportTitle} — ${options.yearName}`, margin, cursorY, 13)
  cursorY += 16

  doc.setFontSize(9)
  doc.setTextColor(100)
  doc.text(`Generated: ${formatTimestamp(new Date().toISOString())}`, margin, cursorY)
  doc.setTextColor(0)
  cursorY += 18

  if (options.summaryLines?.length) {
    doc.setFontSize(10)
    for (const line of options.summaryLines) {
      drawText(doc, line, margin, cursorY, 10)
      cursorY += 14
    }
    cursorY += 6
  }

  const renderTable = (table: PdfTableSpec, startY: number) => {
    autoTable(doc, {
      head: [table.head],
      body: table.rows,
      startY,
      margin: { left: margin, right: margin },
      styles: { fontSize: 8, cellPadding: 4, overflow: 'linebreak' },
      headStyles: { fillColor: [234, 88, 12] },
      // Non-Latin cell content (e.g. a donor name or notes written in Telugu/Hindi/Tamil) can't
      // render via autoTable's own Helvetica-based text draw — see pdfUnicodeText.ts. Blank the
      // text here so autoTable skips drawing it, then paint a rasterized image over the cell in
      // didDrawCell instead.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      willDrawCell: (data: any) => {
        const raw = Array.isArray(data.cell.raw) ? data.cell.raw.join(' ') : String(data.cell.raw ?? '')
        if (needsRasterRendering(raw)) data.cell.text = []
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      didDrawCell: (data: any) => {
        rasterizeNonLatinCellText(doc, data.cell)
      },
      didDrawPage: () => {
        const pageCount = doc.getNumberOfPages()
        doc.setFontSize(8)
        doc.setTextColor(120)
        doc.text(`Page ${pageCount}`, pageWidth - margin - 30, doc.internal.pageSize.getHeight() - 20)
        doc.setTextColor(0)
      },
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (doc as any).lastAutoTable.finalY as number
  }

  if (options.table) {
    cursorY = renderTable(options.table, cursorY) + 24
  }

  if (options.extraTables) {
    for (const extra of options.extraTables) {
      if (cursorY > doc.internal.pageSize.getHeight() - 100) {
        doc.addPage()
        cursorY = 50
      }
      doc.setFontSize(11)
      doc.setFont('helvetica', 'bold')
      drawText(doc, extra.heading, margin, cursorY, 11, { bold: true })
      doc.setFont('helvetica', 'normal')
      cursorY += 12
      cursorY = renderTable(extra.table, cursorY) + 24
    }
  }

  return doc
}

export function pdfFileName(yearName: string, reportTitle: string): string {
  const safe = `${yearName}-${reportTitle}`.toLowerCase().replace(/[^a-z0-9]+/g, '-')
  return `${safe}-${formatDisplayDate(new Date().toISOString().slice(0, 10)).toLowerCase()}.pdf`
}
