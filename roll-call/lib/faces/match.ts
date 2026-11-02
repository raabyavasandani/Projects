import { euclidean } from "./distance";
import { personCentroid } from "./cluster";
import type { FaceLike, Person } from "./types";

export interface PhotoMatch {
  photoId: string;
  /** Distance from the query to the closest face in this photo. */
  distance: number;
  faceId: string;
}

export interface PersonMatch {
  personId: string;
  /** Distance from the query to the person's centroid. */
  centroidDistance: number;
  /** Distance from the query to the person's closest face. */
  nearestFaceDistance: number;
}

export interface SelfieMatchResult {
  /** Best person (by centroid) if under threshold, else null. */
  bestPerson: PersonMatch | null;
  /** All people ranked by centroid distance (for tuning/debugging). */
  ranked: PersonMatch[];
  /**
   * Photos the query matches: every photo containing a face within
   * `threshold` of the query, plus every photo of the best-matching person.
   * Sorted by distance ascending.
   */
  photos: PhotoMatch[];
}

/**
 * Match a query descriptor (e.g. a selfie) against the roll.
 * Pure — no I/O, safe to unit-test.
 */
export function matchDescriptor(
  query: ArrayLike<number>,
  faces: FaceLike[],
  people: Person[],
  threshold: number,
): SelfieMatchResult {
  const faceById = new Map(faces.map((f) => [f.id, f]));
  const faceDist = new Map<string, number>();
  for (const f of faces) faceDist.set(f.id, euclidean(query, f.descriptor));

  const ranked: PersonMatch[] = people
    .filter((p) => p.faceIds.length > 0)
    .map((p) => ({
      personId: p.id,
      centroidDistance: euclidean(query, personCentroid(p, faceById)),
      nearestFaceDistance: Math.min(...p.faceIds.map((id) => faceDist.get(id) ?? Infinity)),
    }))
    .sort((a, b) => a.centroidDistance - b.centroidDistance);

  const bestPerson = ranked[0] && ranked[0].centroidDistance < threshold ? ranked[0] : null;
  const bestFaceIds = new Set(
    bestPerson ? people.find((p) => p.id === bestPerson.personId)!.faceIds : [],
  );

  const byPhoto = new Map<string, PhotoMatch>();
  for (const f of faces) {
    const d = faceDist.get(f.id)!;
    if (d >= threshold && !bestFaceIds.has(f.id)) continue;
    const prev = byPhoto.get(f.photoId);
    if (!prev || d < prev.distance) byPhoto.set(f.photoId, { photoId: f.photoId, distance: d, faceId: f.id });
  }

  return {
    bestPerson,
    ranked,
    photos: [...byPhoto.values()].sort((a, b) => a.distance - b.distance),
  };
}
