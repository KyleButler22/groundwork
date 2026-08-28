#!/usr/bin/env node
// Generates flat-color placeholder PNGs so the PWA manifest (vite.config.ts)
// references real files instead of 404ing at install time. These are NOT
// app icon design — just enough for `npm run build` to produce a genuinely
// installable PWA. Replace with real artwork when the app gets designed;
// search for "pwa-" / "apple-touch-icon" in vite.config.ts and index.html
// for every reference.
//
// Dependency-free PNG encoder: Node has no image library built in, and
// pulling one in (sharp, etc.) for three solid-color squares isn't worth
// it. PNG is a simple enough format to write directly — signature, IHDR,
// one zlib-compressed IDAT of raw RGB scanlines, IEND.

import { deflateSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]):/, '$1:')
const publicDir = join(root, 'public')

// Brand token --color-train from src/style.css. Keep in sync by hand until
// there's a real design system to generate from.
const BRAND = { r: 0x1f, g: 0x6f, b: 0x5c }

function crc32(buf) {
  let c
  const table = crc32.table ?? (crc32.table = (() => {
    const t = new Uint32Array(256)
    for (let n = 0; n < 256; n++) {
      c = n
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      t[n] = c >>> 0
    }
    return t
  })())
  c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii')
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const crcBuf = Buffer.alloc(4)
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])))
  return Buffer.concat([len, typeBuf, data, crcBuf])
}

/** Flat RGB square, with a centered rounded square one shade lighter so it
 *  doesn't read as a totally blank/broken image at a glance. */
function makePng(size) {
  const light = { r: 0x57, g: 0xbe, b: 0x9e } // --color-train dark-mode tint
  const inset = Math.round(size * 0.28)
  const raw = Buffer.alloc(size * (1 + size * 3))
  for (let y = 0; y < size; y++) {
    const rowStart = y * (1 + size * 3)
    raw[rowStart] = 0 // filter type: None
    const insideMark = y >= inset && y < size - inset
    for (let x = 0; x < size; x++) {
      const px = rowStart + 1 + x * 3
      const useMark = insideMark && x >= inset && x < size - inset
      const c = useMark ? light : BRAND
      raw[px] = c.r
      raw[px + 1] = c.g
      raw[px + 2] = c.b
    }
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 2 // color type: truecolor RGB
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0

  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

const targets = [
  ['pwa-192x192.png', 192],
  ['pwa-512x512.png', 512],
  ['apple-touch-icon.png', 180],
]

for (const [name, size] of targets) {
  writeFileSync(join(publicDir, name), makePng(size))
  console.log(`wrote public/${name} (${size}x${size}, ${makePng(size).length} bytes)`)
}
