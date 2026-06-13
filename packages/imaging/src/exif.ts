// Dependency-free EXIF orientation reader (JPEG APP1/TIFF). Phones routinely store the
// sensor image plus an orientation flag rather than rotating pixels; if we ignore it,
// corner detection silently grades a sideways card. We surface the flag for provenance
// even when the browser auto-applies it during decode.

export function readExifOrientation(buf: ArrayBuffer): number {
  const view = new DataView(buf);
  if (view.byteLength < 2 || view.getUint16(0, false) !== 0xffd8) return 1; // not JPEG
  let offset = 2;
  const len = view.byteLength;
  while (offset + 4 <= len) {
    const marker = view.getUint16(offset, false);
    offset += 2;
    if (marker === 0xffe1) {
      // APP1
      const exifLen = view.getUint16(offset, false);
      const start = offset + 2;
      if (view.getUint32(start, false) !== 0x45786966) return 1; // "Exif"
      const tiff = start + 6;
      const little = view.getUint16(tiff, false) === 0x4949;
      const ifd0 = tiff + view.getUint32(tiff + 4, little);
      const tags = view.getUint16(ifd0, little);
      for (let i = 0; i < tags; i++) {
        const entry = ifd0 + 2 + i * 12;
        if (view.getUint16(entry, little) === 0x0112) {
          return view.getUint16(entry + 8, little) || 1;
        }
      }
      offset += exifLen;
    } else if ((marker & 0xff00) !== 0xff00) {
      break;
    } else {
      offset += view.getUint16(offset, false);
    }
  }
  return 1;
}
