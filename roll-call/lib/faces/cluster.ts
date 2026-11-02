import { centroid, euclidean } from "./distance";
import type { FaceLike, Person } from "./types";

export interface ClusterOptions {
  threshold: number;
  /** Used to make cluster ids; defaults to a counter. */
  makeId?: () => string;
}

/**
 * Greedy clustering: walk faces (highest detection score first, so clean
 * faces seed clusters), assign each to the nearest cluster centroid if it's
 * under `threshold`, otherwise start a new cluster.
 *
 * Constraint: a person can't appear twice in one photo, so a face is never
 * assigned to a cluster that already holds a face from the same photo.
 *
 * Returned people are sorted by number of distinct photos, descending.
 */
export function greedyCluster(faces: FaceLike[], opts: ClusterOptions): Person[] {
  let n = 0;
  const makeId = opts.makeId ?? (() => `p${n++}`);

  const ordered = [...faces].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

  interface Working {
    id: string;
    faces: FaceLike[];
    photoIds: Set<string>;
    sum: Float64Array;
    center: Float32Array;
  }
  const clusters: Working[] = [];

  for (const face of ordered) {
    let best: Working | null = null;
    let bestDist = Infinity;
    for (const c of clusters) {
      if (c.photoIds.has(face.photoId)) continue;
      const d = euclidean(face.descriptor, c.center);
      if (d < bestDist) {
        bestDist = d;
        best = c;
      }
    }

    if (best && bestDist < opts.threshold) {
      best.faces.push(face);
      best.photoIds.add(face.photoId);
      for (let i = 0; i < best.sum.length; i++) best.sum[i] += face.descriptor[i];
      for (let i = 0; i < best.center.length; i++) best.center[i] = best.sum[i] / best.faces.length;
    } else {
      const sum = new Float64Array(face.descriptor.length);
      for (let i = 0; i < sum.length; i++) sum[i] = face.descriptor[i];
      clusters.push({
        id: makeId(),
        faces: [face],
        photoIds: new Set([face.photoId]),
        sum,
        center: Float32Array.from(face.descriptor),
      });
    }
  }

  return clusters
    .sort((a, b) => b.photoIds.size - a.photoIds.size)
    .map((c) => ({ id: c.id, faceIds: c.faces.map((f) => f.id) }));
}

/** Merge several people into the first one listed. Names: keep the first non-empty. */
export function mergePeople(people: Person[], ids: string[]): Person[] {
  if (ids.length < 2) return people;
  const idSet = new Set(ids);
  const targets = people.filter((p) => idSet.has(p.id));
  if (targets.length < 2) return people;
  const [keep] = targets;
  const merged: Person = {
    id: keep.id,
    name: targets.find((p) => p.name)?.name,
    faceIds: targets.flatMap((p) => p.faceIds),
  };
  const out: Person[] = [];
  for (const p of people) {
    if (p.id === keep.id) out.push(merged);
    else if (!idSet.has(p.id)) out.push(p);
  }
  return out;
}

/**
 * Remove a face from its person ("that's not them"). The face is split off
 * into its own new person so it isn't lost — it can be merged elsewhere.
 * People left with no faces are dropped.
 */
export function removeFaceFromPerson(people: Person[], faceId: string, newId: string): Person[] {
  const out: Person[] = [];
  let found = false;
  for (const p of people) {
    if (p.faceIds.includes(faceId)) {
      found = true;
      const rest = p.faceIds.filter((f) => f !== faceId);
      if (rest.length > 0) out.push({ ...p, faceIds: rest });
    } else {
      out.push(p);
    }
  }
  if (found) out.push({ id: newId, faceIds: [faceId] });
  return out;
}

/** Centroid descriptor of a person's faces. */
export function personCentroid(person: Person, faceById: Map<string, FaceLike>): Float32Array {
  return centroid(person.faceIds.map((id) => faceById.get(id)!.descriptor));
}

/** Distinct photo ids a person appears in, in first-seen order. */
export function photosOfPerson(person: Person, faceById: Map<string, FaceLike>): string[] {
  const seen = new Set<string>();
  for (const id of person.faceIds) {
    const f = faceById.get(id);
    if (f) seen.add(f.photoId);
  }
  return [...seen];
}
