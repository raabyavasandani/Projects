/** Helpers for getting image files out of drag-and-drop (incl. folders) and file inputs. */

const IMAGE_EXT = /\.(jpe?g|png|webp)$/i;
const HEIC_EXT = /\.(heic|heif)$/i;

export function isSupportedImage(file: File): boolean {
  return IMAGE_EXT.test(file.name) || ["image/jpeg", "image/png", "image/webp"].includes(file.type);
}

export function isHeic(file: File): boolean {
  return HEIC_EXT.test(file.name) || file.type === "image/heic" || file.type === "image/heif";
}

function readEntries(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  return new Promise((resolve, reject) => reader.readEntries(resolve, reject));
}

async function walk(entry: FileSystemEntry, out: File[]): Promise<void> {
  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) =>
      (entry as FileSystemFileEntry).file(resolve, reject),
    );
    out.push(file);
  } else if (entry.isDirectory) {
    const reader = (entry as FileSystemDirectoryEntry).createReader();
    // readEntries returns batches (≤100 in Chrome); keep reading until empty.
    for (;;) {
      const batch = await readEntries(reader);
      if (batch.length === 0) break;
      for (const child of batch) await walk(child, out);
    }
  }
}

/** All files from a drop event, recursing into dropped folders. */
export async function filesFromDrop(dt: DataTransfer): Promise<File[]> {
  const entries = [...dt.items]
    .filter((i) => i.kind === "file")
    .map((i) => i.webkitGetAsEntry())
    .filter((e): e is FileSystemEntry => e !== null);
  if (entries.length === 0) return [...dt.files];
  const out: File[] = [];
  for (const e of entries) await walk(e, out);
  return out;
}

/** Split a list of files into supported images, HEIC (unsupported), and everything else. */
export function partitionFiles(files: File[]) {
  const images: File[] = [];
  const heic: File[] = [];
  let other = 0;
  for (const f of files) {
    if (f.name.startsWith(".")) continue; // ._DSC0001.JPG etc. from macOS
    if (isSupportedImage(f)) images.push(f);
    else if (isHeic(f)) heic.push(f);
    else other++;
  }
  images.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  return { images, heic, other };
}
