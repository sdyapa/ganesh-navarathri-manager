// PDF export via jsPDF + jspdf-autotable. autoTable handles pagination, repeating headers on
// every page, and column widths automatically — the spec explicitly calls out "no unusable
// screenshots with clipped tables", which a naive canvas-of-the-DOM PDF cannot guarantee for
// long lists, so real vector text + autoTable is used instead of html2canvas here.
//
// jsPDF/jspdf-autotable are dynamically imported (not top-level) so they land in their own
// chunk and never bloat the initial page load — most visits never export a PDF at all (spec
// "Performance": lazy-load reports/exports where appropriate).
import { formatDisplayDate, formatTimestamp } from '@/lib/date'
import { APP_NAME } from '@/types'
import type jsPDF from 'jspdf'

export interface PdfTableSpec {
  head: string[]
  rows: Array<Array<string>>
}

export interface PdfReportOptions {
  yearName: string
  reportTitle: string
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
  doc.text(APP_NAME, margin, cursorY)
  cursorY += 20

  doc.setFontSize(13)
  doc.text(`${options.reportTitle} — ${options.yearName}`, margin, cursorY)
  cursorY += 16

  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(100)
  doc.text(`Generated: ${formatTimestamp(new Date().toISOString())}`, margin, cursorY)
  doc.setTextColor(0)
  cursorY += 18

  if (options.summaryLines?.length) {
    doc.setFontSize(10)
    for (const line of options.summaryLines) {
      doc.text(line, margin, cursorY)
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
      doc.text(extra.heading, margin, cursorY)
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
