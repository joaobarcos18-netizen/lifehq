/* Generates build/icon.ico and build/icon.png — a LifeHQ isometric cube on a green gradient. */
const fs = require('fs')
const path = require('path')
const { PNG } = require('pngjs')
const _pti = require('png-to-ico')
const pngToIco = typeof _pti === 'function' ? _pti : _pti.default

const OUT_DIR = path.join(__dirname, '..', 'build')

function lerp(a, b, t) {
  return a + (b - a) * t
}
function hex(h) {
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]
}

const TOP_BG = hex('#8ed07f')
const BOT_BG = hex('#3f7a36')
const FACE_TOP = hex('#ffffff')
const FACE_LEFT = hex('#d7ead2')
const FACE_RIGHT = hex('#bfdcb8')

function sign(ax, ay, bx, by, cx, cy) {
  return (ax - cx) * (by - cy) - (bx - cx) * (ay - cy)
}
function inTri(px, py, a, b, c) {
  const d1 = sign(px, py, a[0], a[1], b[0], b[1])
  const d2 = sign(px, py, b[0], b[1], c[0], c[1])
  const d3 = sign(px, py, c[0], c[1], a[0], a[1])
  const neg = d1 < 0 || d2 < 0 || d3 < 0
  const pos = d1 > 0 || d2 > 0 || d3 > 0
  return !(neg && pos)
}
function inQuad(px, py, a, b, c, d) {
  return inTri(px, py, a, b, c) || inTri(px, py, a, c, d)
}

// Sample one supersampled pixel -> returns [r,g,b,a]
function sampleColor(fx, fy, N) {
  const radius = N * 0.215
  const round = N * 0.225
  // rounded-rect mask
  const inset = N * 0.06
  const x0 = inset
  const y0 = inset
  const x1 = N - inset
  const y1 = N - inset
  let inside = fx >= x0 && fx <= x1 && fy >= y0 && fy <= y1
  if (inside) {
    // knock out the four corners outside the rounding radius
    const corners = [
      [x0 + round, y0 + round, fx < x0 + round && fy < y0 + round],
      [x1 - round, y0 + round, fx > x1 - round && fy < y0 + round],
      [x0 + round, y1 - round, fx < x0 + round && fy > y1 - round],
      [x1 - round, y1 - round, fx > x1 - round && fy > y1 - round]
    ]
    for (const [ccx, ccy, near] of corners) {
      if (near && Math.hypot(fx - ccx, fy - ccy) > round) {
        inside = false
        break
      }
    }
  }
  if (!inside) return [0, 0, 0, 0]

  // background gradient
  const t = fy / N
  let r = lerp(TOP_BG[0], BOT_BG[0], t)
  let g = lerp(TOP_BG[1], BOT_BG[1], t)
  let b = lerp(TOP_BG[2], BOT_BG[2], t)

  // isometric cube
  const cx = N / 2
  const cy = N / 2 + N * 0.02
  const r2 = radius
  const dx = r2 * 0.86
  const apex = [cx, cy - r2]
  const right = [cx + dx, cy - r2 * 0.5]
  const left = [cx - dx, cy - r2 * 0.5]
  const center = [cx, cy]
  const bottom = [cx, cy + r2]
  const bRight = [cx + dx, cy + r2 * 0.5]
  const bLeft = [cx - dx, cy + r2 * 0.5]

  if (inQuad(fx, fy, apex, right, center, left)) {
    return [FACE_TOP[0], FACE_TOP[1], FACE_TOP[2], 255]
  }
  if (inQuad(fx, fy, left, center, bottom, bLeft)) {
    return [FACE_LEFT[0], FACE_LEFT[1], FACE_LEFT[2], 255]
  }
  if (inQuad(fx, fy, right, center, bottom, bRight)) {
    return [FACE_RIGHT[0], FACE_RIGHT[1], FACE_RIGHT[2], 255]
  }
  return [Math.round(r), Math.round(g), Math.round(b), 255]
}

function render(size) {
  const SS = 4 // supersampling
  const png = new PNG({ width: size, height: size })
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0,
        g = 0,
        b = 0,
        a = 0
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const fx = ((x + (sx + 0.5) / SS) / size) * size
          const fy = ((y + (sy + 0.5) / SS) / size) * size
          const c = sampleColor(fx, fy, size)
          // premultiply for correct edge blending
          const af = c[3] / 255
          r += c[0] * af
          g += c[1] * af
          b += c[2] * af
          a += c[3]
        }
      }
      const n = SS * SS
      const aAvg = a / n
      const idx = (size * y + x) << 2
      if (aAvg <= 0) {
        png.data[idx] = png.data[idx + 1] = png.data[idx + 2] = png.data[idx + 3] = 0
      } else {
        const alphaScale = aAvg / 255
        png.data[idx] = Math.round(r / n / alphaScale)
        png.data[idx + 1] = Math.round(g / n / alphaScale)
        png.data[idx + 2] = Math.round(b / n / alphaScale)
        png.data[idx + 3] = Math.round(aAvg)
      }
    }
  }
  return PNG.sync.write(png)
}

async function main() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true })
  const sizes = [16, 24, 32, 48, 64, 128, 256]
  const buffers = sizes.map((s) => render(s))
  // 512 master png for window icon / Linux
  fs.writeFileSync(path.join(OUT_DIR, 'icon.png'), render(512))
  const ico = await pngToIco(buffers)
  fs.writeFileSync(path.join(OUT_DIR, 'icon.ico'), ico)
  console.log('Wrote build/icon.ico and build/icon.png')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
