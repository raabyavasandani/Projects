/** Euclidean distance between two equal-length descriptors. */
export function euclidean(a: ArrayLike<number>, b: ArrayLike<number>): number {
  if (a.length !== b.length) {
    throw new Error(`Descriptor length mismatch: ${a.length} vs ${b.length}`);
  }
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return Math.sqrt(sum);
}

/** Mean of a non-empty list of descriptors. */
export function centroid(descriptors: ArrayLike<number>[]): Float32Array {
  if (descriptors.length === 0) throw new Error("centroid of empty set");
  const out = new Float32Array(descriptors[0].length);
  for (const d of descriptors) {
    for (let i = 0; i < out.length; i++) out[i] += d[i];
  }
  for (let i = 0; i < out.length; i++) out[i] /= descriptors.length;
  return out;
}
