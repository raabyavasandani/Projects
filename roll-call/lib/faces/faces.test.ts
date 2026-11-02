import { describe, expect, it } from "vitest";
import { centroid, euclidean } from "./distance";
import { greedyCluster, mergePeople, photosOfPerson, removeFaceFromPerson } from "./cluster";
import { matchDescriptor } from "./match";
import type { FaceLike } from "./types";

/** 128-d vector that's `base` on axis `axis`, plus small jitter on axis 127. */
function vec(axis: number, jitter = 0, base = 1): Float32Array {
  const v = new Float32Array(128);
  v[axis] = base;
  v[127] = jitter;
  return v;
}

function face(id: string, photoId: string, descriptor: Float32Array, score = 0.9): FaceLike {
  return { id, photoId, descriptor, score };
}

describe("distance", () => {
  it("euclidean", () => {
    expect(euclidean([0, 0], [3, 4])).toBe(5);
    expect(() => euclidean([0], [0, 1])).toThrow();
  });
  it("centroid", () => {
    expect([...centroid([[0, 2], [2, 4]])]).toEqual([1, 3]);
  });
});

describe("greedyCluster", () => {
  const faces = [
    face("a1", "ph1", vec(0, 0.0)),
    face("a2", "ph2", vec(0, 0.1)),
    face("a3", "ph3", vec(0, 0.2)),
    face("b1", "ph1", vec(1, 0.0)),
    face("b2", "ph4", vec(1, 0.1)),
    face("c1", "ph5", vec(2, 0.0)),
  ];

  it("groups close descriptors and separates far ones", () => {
    const people = greedyCluster(faces, { threshold: 0.5 });
    expect(people).toHaveLength(3);
    const sets = people.map((p) => new Set(p.faceIds));
    expect(sets[0]).toEqual(new Set(["a1", "a2", "a3"])); // sorted by photo count
    expect(sets[1]).toEqual(new Set(["b1", "b2"]));
    expect(sets[2]).toEqual(new Set(["c1"]));
  });

  it("a very high threshold merges everything except same-photo faces", () => {
    const people = greedyCluster(faces, { threshold: 10 });
    for (const p of people) {
      const photos = p.faceIds.map((id) => faces.find((f) => f.id === id)!.photoId);
      expect(new Set(photos).size).toBe(photos.length);
    }
    // a1 and b1 share ph1, so they can never be in the same cluster
    expect(people.length).toBeGreaterThanOrEqual(2);
  });

  it("a tiny threshold makes every face its own person", () => {
    expect(greedyCluster(faces, { threshold: 0.01 })).toHaveLength(6);
  });
});

describe("merge / remove", () => {
  const people = [
    { id: "p0", faceIds: ["a1", "a2"] },
    { id: "p1", faceIds: ["b1"], name: "Bea" },
    { id: "p2", faceIds: ["c1"] },
  ];

  it("mergePeople keeps first id, combines faces, keeps a name", () => {
    const out = mergePeople(people, ["p0", "p1"]);
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({ id: "p0", faceIds: ["a1", "a2", "b1"], name: "Bea" });
  });

  it("mergePeople ignores fewer than two ids", () => {
    expect(mergePeople(people, ["p0"])).toBe(people);
  });

  it("removeFaceFromPerson splits the face into a new person", () => {
    const out = removeFaceFromPerson(people, "a2", "new");
    expect(out.find((p) => p.id === "p0")!.faceIds).toEqual(["a1"]);
    expect(out.find((p) => p.id === "new")!.faceIds).toEqual(["a2"]);
  });

  it("removeFaceFromPerson drops emptied people", () => {
    const out = removeFaceFromPerson(people, "c1", "new");
    expect(out.find((p) => p.id === "p2")).toBeUndefined();
    expect(out.find((p) => p.id === "new")!.faceIds).toEqual(["c1"]);
  });

  it("photosOfPerson dedupes photos", () => {
    const fm = new Map([
      ["x", face("x", "ph1", vec(0))],
      ["y", face("y", "ph1", vec(0))],
      ["z", face("z", "ph2", vec(0))],
    ]);
    expect(photosOfPerson({ id: "p", faceIds: ["x", "y", "z"] }, fm)).toEqual(["ph1", "ph2"]);
  });
});

describe("matchDescriptor", () => {
  const faces = [
    face("a1", "ph1", vec(0, 0.0)),
    face("a2", "ph2", vec(0, 0.1)),
    face("b1", "ph1", vec(1, 0.0)),
    face("b2", "ph3", vec(1, 0.1)),
  ];
  const people = greedyCluster(faces, { threshold: 0.5 });

  it("finds the right person and their photos", () => {
    const r = matchDescriptor(vec(0, 0.05), faces, people, 0.5);
    expect(r.bestPerson).not.toBeNull();
    const best = people.find((p) => p.id === r.bestPerson!.personId)!;
    expect(new Set(best.faceIds)).toEqual(new Set(["a1", "a2"]));
    expect(r.photos.map((p) => p.photoId).sort()).toEqual(["ph1", "ph2"]);
    expect(r.ranked).toHaveLength(2);
  });

  it("returns nothing for a stranger", () => {
    const r = matchDescriptor(vec(5), faces, people, 0.5);
    expect(r.bestPerson).toBeNull();
    expect(r.photos).toEqual([]);
  });
});
