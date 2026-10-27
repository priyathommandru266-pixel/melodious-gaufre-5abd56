import type { ConversionOption } from './types'
import { formatBytes } from './format'

export function getExtension(fileName: string): string {
  const i = fileName.lastIndexOf('.')
  return i > 0 ? fileName.slice(i + 1).toLowerCase() : ''
}

/**
 * Produce a filename that is safe to use in an S3 key and a download header:
 * strips paths, control characters and anything outside [A-Za-z0-9._-].
 * The backend applies the same rules — this only previews the result.
 */
export function sanitizeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? ''
  const cleaned = base
    .normalize('NFKD')
    .replace(/[^\w.-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[._]+/, '')
    .slice(-120)
  return cleaned || 'file'
}

export type ValidationResult = { ok: true } | { ok: false; message: string }

export function validateFile(
  file: File,
  option: ConversionOption | null,
  supported: ConversionOption[],
  maxBytes: number,
): ValidationResult {
  const ext = getExtension(file.name)
  const supportedExts = [...new Set(supported.flatMap((o) => o.inputExtensions))]

  if (!ext || !supportedExts.includes(ext)) {
    const list = supportedExts.length ? supportedExts.map((e) => `.${e}`).join(', ') : 'none'
    return {
      ok: false,
      message: `Unsupported file type${ext ? ` ".${ext}"` : ''}. Supported types: ${list}.`,
    }
  }
  if (file.size === 0) return { ok: false, message: 'The selected file is empty.' }
  if (file.size > maxBytes) {
    return {
      ok: false,
      message: `File is ${formatBytes(file.size)}. The maximum upload size is ${formatBytes(maxBytes)}.`,
    }
  }
  if (option) {
    if (!option.inputExtensions.includes(ext)) {
      return {
        ok: false,
        message: `"${option.label}" expects a .${option.inputExtensions.join('/.')} file, but you selected a .${ext} file.`,
      }
    }
    if (file.type && !option.inputMimeTypes.includes(file.type)) {
      return {
        ok: false,
        message: `The file's content type (${file.type}) does not match ${option.label}.`,
      }
    }
  }
  return { ok: true }
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

/** Inspect the first bytes of the file so a renamed file is caught early. */
export async function verifyFileSignature(
  file: File,
  option: ConversionOption,
): Promise<ValidationResult> {
  const head = new Uint8Array(await file.slice(0, 512).arrayBuffer())
  if (option.id === 'PNG_TO_JPEG') {
    const isPng = PNG_SIGNATURE.every((b, i) => head[i] === b)
    return isPng
      ? { ok: true }
      : { ok: false, message: 'This file has a .png extension but is not a valid PNG image.' }
  }
  // Text formats: reject obvious binary content (NUL bytes).
  if (head.includes(0)) {
    return { ok: false, message: 'This file looks like binary data, not plain text.' }
  }
  return { ok: true }
}
