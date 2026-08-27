interface ExportButtonsProps {
  onExportPdf: () => void
  onExportPng: () => void
  pdfLabel?: string
  pngLabel?: string
}

export function ExportButtons({ onExportPdf, onExportPng, pdfLabel = 'Export PDF', pngLabel = 'Export PNG' }: ExportButtonsProps) {
  return (
    <div className="export-buttons">
      <button type="button" className="button button--ghost" onClick={onExportPdf}>
        📄 {pdfLabel}
      </button>
      <button type="button" className="button button--ghost" onClick={onExportPng}>
        🖼️ {pngLabel}
      </button>
    </div>
  )
}
