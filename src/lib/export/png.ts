// PNG export via html2canvas. Captures the full scrollHeight of the target element (not just
// the visible viewport), so a long report becomes one tall, complete image rather than a
// cropped screenshot — matching the spec's "avoid cutting off content" requirement for the
// long-form case where a single image is acceptable.
//
// html2canvas is dynamically imported so it never bloats the initial page load (spec
// "Performance": lazy-load reports/exports where appropriate).

export async function exportElementAsPng(element: HTMLElement, filename: string): Promise<void> {
  const { default: html2canvas } = await import('html2canvas')
  const canvas = await html2canvas(element, {
    backgroundColor: '#ffffff',
    scale: Math.min(2, window.devicePixelRatio || 1.5),
    useCORS: true,
    windowWidth: element.scrollWidth,
    windowHeight: element.scrollHeight,
  })

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

export function pngFileName(yearName: string, reportTitle: string): string {
  const safe = `${yearName}-${reportTitle}`.toLowerCase().replace(/[^a-z0-9]+/g, '-')
  return `${safe}.png`
}
