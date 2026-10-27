import { Buffer } from 'node:buffer'

// Real, tiny images keep decoding and preview tests independent of external files.
export async function photoFile(page, mimeType = 'image/png', name = 'activity-photo.png') {
  const encoded = await page.evaluate((type) => {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 2
    canvas.getContext('2d').fillRect(0, 0, 2, 2)
    return canvas.toDataURL(type).split(',')[1]
  }, mimeType)
  return { name, mimeType, buffer: Buffer.from(encoded, 'base64') }
}
