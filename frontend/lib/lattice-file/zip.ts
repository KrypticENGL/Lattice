/**
 * A minimal ZIP writer, for handing over several `.lattice` files at once.
 *
 * ## Why this exists rather than a dependency
 *
 * The browser cannot start more than one or two downloads from a single
 * gesture — the rest are silently dropped — so "download everything on
 * this post" has to be one file, and one file means an archive. Nothing
 * here compresses: every entry is stored (method 0), which is the whole
 * reason this fits in a page rather than needing a library. `.lattice`
 * files are JSON and would compress well, but a few hundred kB of text is
 * already a fast download, and a DEFLATE implementation is the entire
 * weight of the libraries this avoids.
 *
 * ## What it writes
 *
 * A standard ZIP: a local header per entry, then a central directory, then
 * an end-of-central-directory record. No ZIP64, no data descriptors, no
 * encryption. Fine for what this carries and small enough to read in one
 * sitting; if an archive ever needs to pass 4GB or hold 65,535 files, this
 * is the point to reach for a real library.
 */

/** ZIP stores timestamps in MS-DOS format: a date and a time, each packed
 * into 16 bits, with two-second resolution and an epoch of 1980. */
function dosDateTime(date: Date): { date: number; time: number } {
  const year = Math.max(1980, date.getFullYear());
  return {
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1),
  };
}

/** CRC-32, which the format requires per entry. The table is built once on
 * first use rather than shipped as 256 literals. */
let crcTable: Uint32Array | null = null;
function crc32(bytes: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[i] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) crc = crcTable[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

export type ZipEntry = { name: string; content: string };

/**
 * Packs `entries` into a ZIP blob.
 *
 * Names are used verbatim, so the caller owns de-duplication — two entries
 * with one name produces an archive most tools will extract as a single
 * file, silently losing one. See `uniqueNames`.
 */
export function createZip(entries: ZipEntry[]): Blob {
  const encoder = new TextEncoder();
  // `Uint8Array<ArrayBuffer>` rather than the plain alias: `TextEncoder`
  // yields an `ArrayBufferLike`-backed view, which could in principle sit
  // on a `SharedArrayBuffer` and so isn't a `BlobPart`. Copying through
  // the constructor below fixes the backing store to a real ArrayBuffer.
  const parts: Uint8Array<ArrayBuffer>[] = [];
  const central: Uint8Array<ArrayBuffer>[] = [];
  const { date, time } = dosDateTime(new Date());
  let offset = 0;

  for (const entry of entries) {
    const name = new Uint8Array(encoder.encode(entry.name));
    const data = new Uint8Array(encoder.encode(entry.content));
    const crc = crc32(data);

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true); // local file header signature
    local.setUint16(4, 20, true); // version needed: 2.0
    local.setUint16(6, 0x0800, true); // flags: names and comments are UTF-8
    local.setUint16(8, 0, true); // method: stored
    local.setUint16(10, time, true);
    local.setUint16(12, date, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, data.length, true); // compressed size
    local.setUint32(22, data.length, true); // uncompressed size — equal, stored
    local.setUint16(26, name.length, true);
    local.setUint16(28, 0, true); // extra field length
    parts.push(new Uint8Array(local.buffer), name, data);

    const dir = new DataView(new ArrayBuffer(46));
    dir.setUint32(0, 0x02014b50, true); // central directory header signature
    dir.setUint16(4, 20, true); // version made by
    dir.setUint16(6, 20, true); // version needed
    dir.setUint16(8, 0x0800, true);
    dir.setUint16(10, 0, true);
    dir.setUint16(12, time, true);
    dir.setUint16(14, date, true);
    dir.setUint32(16, crc, true);
    dir.setUint32(20, data.length, true);
    dir.setUint32(24, data.length, true);
    dir.setUint16(28, name.length, true);
    dir.setUint16(30, 0, true); // extra
    dir.setUint16(32, 0, true); // comment
    dir.setUint16(34, 0, true); // disk number
    dir.setUint16(36, 0, true); // internal attributes
    dir.setUint32(38, 0, true); // external attributes
    dir.setUint32(42, offset, true); // where this entry's local header is
    central.push(new Uint8Array(dir.buffer), name);

    offset += 30 + name.length + data.length;
  }

  const centralSize = central.reduce((sum, part) => sum + part.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); // end of central directory signature
  end.setUint16(4, 0, true); // this disk
  end.setUint16(6, 0, true); // disk with the central directory
  end.setUint16(8, entries.length, true);
  end.setUint16(10, entries.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true); // where the central directory starts
  end.setUint16(20, 0, true); // comment length

  return new Blob([...parts, ...central, new Uint8Array(end.buffer)], {
    type: "application/zip",
  });
}

/**
 * Makes every name distinct, keeping the first of each and numbering the
 * rest — `a.lattice`, `a (2).lattice`. Two canvases with the same name is
 * ordinary (a graph and the canvas generated from it share one), and an
 * archive that quietly dropped one of them would be the worst outcome.
 */
export function uniqueNames(names: string[]): string[] {
  const seen = new Map<string, number>();
  return names.map((name) => {
    const count = seen.get(name) ?? 0;
    seen.set(name, count + 1);
    if (count === 0) return name;
    const dot = name.lastIndexOf(".");
    return dot > 0
      ? `${name.slice(0, dot)} (${count + 1})${name.slice(dot)}`
      : `${name} (${count + 1})`;
  });
}
