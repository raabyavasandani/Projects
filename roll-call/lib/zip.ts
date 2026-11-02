import JSZip from "jszip";

/** Give duplicate file names a numeric suffix: IMG_1.jpg, IMG_1 (2).jpg, ... */
export function uniqueNames(names: string[]): string[] {
  const used = new Map<string, number>();
  return names.map((name) => {
    const key = name.toLowerCase();
    const n = used.get(key) ?? 0;
    used.set(key, n + 1);
    if (n === 0) return name;
    const dot = name.lastIndexOf(".");
    return dot > 0 ? `${name.slice(0, dot)} (${n + 1})${name.slice(dot)}` : `${name} (${n + 1})`;
  });
}

/** Zip original files with no recompression and trigger a browser download. */
export async function downloadZip(
  files: File[],
  zipName: string,
  onProgress?: (percent: number) => void,
): Promise<void> {
  const zip = new JSZip();
  const names = uniqueNames(files.map((f) => f.name));
  files.forEach((f, i) => zip.file(names[i], f, { binary: true }));
  const blob = await zip.generateAsync({ type: "blob", compression: "STORE" }, (m) =>
    onProgress?.(m.percent),
  );
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = zipName.endsWith(".zip") ? zipName : `${zipName}.zip`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
