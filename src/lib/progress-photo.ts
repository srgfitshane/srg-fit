const MAX_INPUT_BYTES = 30 * 1024 * 1024
const MAX_OUTPUT_BYTES = 10 * 1024 * 1024
const MAX_PIXELS = 50_000_000
const MAX_EDGE = 1920

// Prepare a new upload locally; never alter the selected file or stored photos.
export async function prepareProgressPhoto(file: File): Promise<File> {
  const extension = file.name.split('.').pop()?.toLowerCase() || ''
  const types: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', heic: 'image/heic', heif: 'image/heif' }
  const type = file.type.toLowerCase() || types[extension] || ''
  const supported = /^image\/(jpeg|png|webp|heic|heif)$/.test(type)
  if (!supported) throw new Error('Choose a JPEG, PNG, WebP, or a HEIC photo your browser can open.')
  if (!file.size) throw new Error('This photo is empty. Please choose another photo.')
  if (file.size > MAX_INPUT_BYTES) throw new Error('Choose a photo smaller than 30 MB.')

  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    throw new Error('This browser could not open the photo. Export it as JPEG and select it again.')
  }
  const canvas = document.createElement('canvas')
  try {
    if (!bitmap.width || !bitmap.height || bitmap.width * bitmap.height > MAX_PIXELS) {
      throw new Error('Choose a photo with a resolution of 50 megapixels or less.')
    }
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
    canvas.width = Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Your browser could not prepare the photo. Please try again.')
    context.fillStyle = '#fff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.9))
    if (!blob || blob.type !== 'image/jpeg' || !blob.size) {
      throw new Error('Your browser could not prepare a JPEG photo. Please try again.')
    }
    // Re-encoding a small, compatible image can increase its size. Keep the
    // validated original only when no resizing is needed and it is smaller.
    if (scale === 1 && /^image\/(jpeg|png|webp)$/.test(type) && file.size <= blob.size && file.size <= MAX_OUTPUT_BYTES) {
      return file.type === type ? file : new File([file], file.name, { type })
    }
    if (blob.size > MAX_OUTPUT_BYTES) throw new Error('This photo is still too large. Please select a smaller photo.')
    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' })
  } finally {
    bitmap.close()
    canvas.width = 0
    canvas.height = 0
  }
}
