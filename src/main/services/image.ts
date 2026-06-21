import { openSync, readSync, closeSync } from 'fs'

/** Read image dimensions from common formats by inspecting the header bytes. */
export function readImageSize(path: string): { width: number; height: number } | null {
  let fd: number | null = null
  try {
    fd = openSync(path, 'r')
    const buf = Buffer.alloc(65536)
    const bytes = readSync(fd, buf, 0, buf.length, 0)
    const b = buf.subarray(0, bytes)

    // PNG
    if (b.length > 24 && b[0] === 0x89 && b[1] === 0x50) {
      return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) }
    }
    // GIF
    if (b.length > 10 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) {
      return { width: b.readUInt16LE(6), height: b.readUInt16LE(8) }
    }
    // BMP
    if (b.length > 26 && b[0] === 0x42 && b[1] === 0x4d) {
      return { width: b.readInt32LE(18), height: Math.abs(b.readInt32LE(22)) }
    }
    // WEBP
    if (b.length > 30 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') {
      const fmt = b.toString('ascii', 12, 16)
      if (fmt === 'VP8 ') {
        return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff }
      }
      if (fmt === 'VP8L') {
        const bits = b.readUInt32LE(21)
        return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 }
      }
      if (fmt === 'VP8X') {
        const w = 1 + ((b[24] | (b[25] << 8) | (b[26] << 16)) & 0xffffff)
        const h = 1 + ((b[27] | (b[28] << 8) | (b[29] << 16)) & 0xffffff)
        return { width: w, height: h }
      }
    }
    // JPEG
    if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8) {
      let off = 2
      while (off < b.length - 8) {
        if (b[off] !== 0xff) {
          off++
          continue
        }
        const marker = b[off + 1]
        const len = b.readUInt16BE(off + 2)
        // SOF markers carry the dimensions
        if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
          return { height: b.readUInt16BE(off + 5), width: b.readUInt16BE(off + 7) }
        }
        off += 2 + len
      }
    }
    return null
  } catch {
    return null
  } finally {
    if (fd !== null) closeSync(fd)
  }
}
