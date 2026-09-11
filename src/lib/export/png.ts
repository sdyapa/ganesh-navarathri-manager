// PNG export via html2canvas. html2canvas is dynamically imported so it never bloats the
// initial page load (spec "Performance": lazy-load reports/exports where appropriate).
import { formatFileTimestamp, formatTimestamp } from '@/lib/date'
import type { PdfTableSpec } from './pdf'

export interface PngReportMeta {
  /** The user's customizable display name (Settings › General) — same value passed as
   *  PdfReportOptions.appName, so PDF and PNG exports show matching branding. */
  appName: string
  reportTitle: string
  yearName: string
  /** Short "Label: value" lines — same content shown in the on-screen page, repeated here so
   *  the exported image is self-contained (a screenshot of the page section alone doesn't carry
   *  totals that live in the page header, outside the captured element). */
  summaryLines?: string[]
}

function buildExportHeader(meta: PngReportMeta): HTMLElement {
  const header = document.createElement('div')
  header.style.cssText =
    'padding: 4px 4px 18px; margin-bottom: 20px; border-bottom: 2px solid #ea580c; font-family: inherit; background: #ffffff;'

  const title = document.createElement('div')
  title.textContent = meta.appName
  title.style.cssText = 'margin: 0 0 4px; font-size: 20px; font-weight: 700; color: #111827;'
  header.appendChild(title)

  const subtitle = document.createElement('div')
  subtitle.textContent = `${meta.reportTitle} — ${meta.yearName}`
  subtitle.style.cssText = 'margin: 0 0 4px; font-size: 15px; font-weight: 600; color: #1f2937;'
  header.appendChild(subtitle)

  const generated = document.createElement('div')
  generated.textContent = `Generated: ${formatTimestamp(new Date().toISOString())}`
  generated.style.cssText = 'margin: 0 0 10px; font-size: 11px; color: #6b7280;'
  header.appendChild(generated)

  if (meta.summaryLines?.length) {
    const list = document.createElement('div')
    list.style.cssText = 'display: flex; flex-wrap: wrap; gap: 4px 24px; font-size: 12px; color: #111827;'
    for (const line of meta.summaryLines) {
      const span = document.createElement('div')
      span.textContent = line
      list.appendChild(span)
    }
    header.appendChild(list)
  }

  return header
}

async function canvasToPngDownload(canvas: HTMLCanvasElement, filename: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Could not generate image'))
        return
      }
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = filename
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      URL.revokeObjectURL(url)
      resolve()
    }, 'image/png')
  })
}

export async function exportElementAsPng(element: HTMLElement, filename: string, meta?: PngReportMeta): Promise<void> {
  const { default: html2canvas } = await import('html2canvas')

  // Temporarily insert the branding/summary header as the target's first child, capture, then
  // remove it. A cloned copy can't be used instead — cloning a live <canvas> (the Reports page's
  // charts) copies the empty element, not its drawn pixels, so the charts would render blank in
  // the exported image.
  const header = meta ? buildExportHeader(meta) : null
  if (header) element.insertBefore(header, element.firstChild)

  // Force this subtree back to the light palette for the capture, regardless of the app's
  // active theme — every stat card/badge/border color here is driven by the --color-* CSS
  // variables (see global.css's "Dark theme" section), and exports must always render the same
  // way no matter what theme is active on screen.
  //
  // `data-theme="light"` alone re-scopes what var(--color-*) resolves to for rules that apply
  // WITHIN this subtree, but `color` is an *inherited* property — most text here (e.g.
  // .stat-card__value) never sets its own `color` at all, so it just inherits body's already-
  // computed value, which resolved dark if the app's theme is dark. Re-declaring the custom
  // property here doesn't retroactively fix an already-inherited computed value, so `color`
  // needs its own explicit override too, not just the data-theme attribute.
  const previousTheme = element.getAttribute('data-theme')
  const previousColor = element.style.color
  element.setAttribute('data-theme', 'light')
  element.style.color = '#1c1917'

  try {
    const canvas = await html2canvas(element, {
      backgroundColor: '#ffffff',
      scale: Math.min(2, window.devicePixelRatio || 1.5),
      useCORS: true,
      windowWidth: element.scrollWidth,
      windowHeight: element.scrollHeight,
    })
    await canvasToPngDownload(canvas, filename)
  } finally {
    header?.remove()
    if (previousTheme === null) element.removeAttribute('data-theme')
    else element.setAttribute('data-theme', previousTheme)
    element.style.color = previousColor
  }
}

function buildHtmlTable(spec: PdfTableSpec): HTMLTableElement {
  const table = document.createElement('table')
  table.className = 'data-table'

  const thead = document.createElement('thead')
  const headRow = document.createElement('tr')
  for (const label of spec.head) {
    const th = document.createElement('th')
    th.textContent = label
    headRow.appendChild(th)
  }
  thead.appendChild(headRow)
  table.appendChild(thead)

  const tbody = document.createElement('tbody')
  for (const row of spec.rows) {
    const tr = document.createElement('tr')
    for (const cell of row) {
      const td = document.createElement('td')
      td.textContent = cell
      tr.appendChild(td)
    }
    tbody.appendChild(tr)
  }
  table.appendChild(tbody)

  return table
}

export interface PngTableReportOptions extends PngReportMeta {
  /** One or more tables, each with an optional heading — mirrors PdfReportOptions.extraTables
   *  so a PNG export can segregate e.g. Monetary vs. Commodity donations the same way the PDF
   *  does, rather than one mixed table. */
  tables: Array<{ heading?: string; table: PdfTableSpec }>
}

/** Exports a clean, self-contained tabular report as a PNG — used by list pages (Donations,
 *  Expenses, Auctions) instead of exportElementAsPng, which screenshots the on-screen
 *  interactive table verbatim (Edit/Delete/Copy-WhatsApp buttons, pagination, and all). That
 *  made for a confusing, action-cluttered image and produced one very tall screenshot for any
 *  real transaction volume. This builds an entirely synthetic offscreen table instead — the
 *  same {head, rows} data already used for PDF export (see reportBuilders.ts), rendered as a
 *  real <table class="data-table"> so it picks up the app's existing table styling — and
 *  captures that instead of the live page. */
export async function exportTableReportAsPng(filename: string, options: PngTableReportOptions): Promise<void> {
  const { default: html2canvas } = await import('html2canvas')

  const container = document.createElement('div')
  // `color: #1c1917` is set explicitly, not just `data-theme="light"` — table cells (.data-table
  // td) never declare their own `color`, they just inherit body's already-computed value, which
  // resolves dark if the app's theme is dark. data-theme alone only re-scopes fresh var(...)
  // lookups within this subtree; it can't retroactively fix an already-inherited computed color,
  // so it needs an explicit override here too (see exportElementAsPng's identical fix/comment).
  container.style.cssText =
    'position: fixed; left: -10000px; top: 0; width: 960px; background: #ffffff; color: #1c1917; padding: 8px; font-family: inherit;'
  // Despite being off-screen/fixed-position, this still inherits the app's --color-* CSS
  // variables from <html> through normal DOM inheritance — force it back to light regardless of
  // the active theme (see global.css's "Dark theme" section) so the .data-table styling below
  // always renders the same way.
  container.setAttribute('data-theme', 'light')
  container.appendChild(buildExportHeader(options))

  for (const { heading, table } of options.tables) {
    if (heading) {
      const headingEl = document.createElement('div')
      headingEl.textContent = heading
      headingEl.style.cssText = 'font-weight: 700; font-size: 15px; margin: 16px 0 8px; color: #111827;'
      container.appendChild(headingEl)
    }
    container.appendChild(buildHtmlTable(table))
  }

  document.body.appendChild(container)
  try {
    const canvas = await html2canvas(container, {
      backgroundColor: '#ffffff',
      scale: Math.min(2, window.devicePixelRatio || 1.5),
      useCORS: true,
      windowWidth: container.scrollWidth,
      windowHeight: container.scrollHeight,
    })
    await canvasToPngDownload(canvas, filename)
  } finally {
    container.remove()
  }
}

export function pngFileName(yearName: string, reportTitle: string): string {
  const safe = `${yearName}-${reportTitle}`.toLowerCase().replace(/[^a-z0-9]+/g, '-')
  return `${safe}-${formatFileTimestamp(new Date().toISOString())}.png`
}
