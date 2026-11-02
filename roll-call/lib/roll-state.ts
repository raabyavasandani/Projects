import { greedyCluster, mergePeople, removeFaceFromPerson } from "./faces/cluster";
import { MATCH_THRESHOLD } from "./faces/constants";
import type { Face, Person, Photo } from "./faces/types";

export type Status = "idle" | "loading-models" | "processing" | "done";

export interface RollState {
  status: Status;
  photos: Photo[];
  faces: Map<string, Face>;
  people: Person[];
  threshold: number;
  /** True once the sharer has merged/removed/named — re-clustering would discard that. */
  edited: boolean;
  progress: { done: number; total: number };
  skipped: { heic: number; failed: number; other: number };
  error: string | null;
  /** tfjs backend in use, once models are loaded. */
  backend: string | null;
}

export const initialState: RollState = {
  status: "idle",
  photos: [],
  faces: new Map(),
  people: [],
  threshold: MATCH_THRESHOLD,
  edited: false,
  progress: { done: 0, total: 0 },
  skipped: { heic: 0, failed: 0, other: 0 },
  error: null,
  backend: null,
};

export type Action =
  | { type: "start"; total: number; heic: number; other: number }
  | { type: "models-ready"; backend: string }
  | { type: "photo"; photo: Photo; faces: Face[] }
  | { type: "photo-failed" }
  | { type: "recluster" }
  | { type: "finish" }
  | { type: "error"; message: string }
  | { type: "set-threshold"; threshold: number }
  | { type: "merge"; ids: string[] }
  | { type: "remove-face"; faceId: string; newId: string }
  | { type: "rename"; personId: string; name: string }
  | { type: "reset" };

function cluster(state: RollState, threshold = state.threshold): Person[] {
  return greedyCluster([...state.faces.values()], { threshold });
}

export function reducer(state: RollState, action: Action): RollState {
  switch (action.type) {
    case "start":
      return {
        ...state,
        status: state.status === "done" ? "processing" : "loading-models",
        error: null,
        progress: { done: state.progress.done, total: state.progress.total + action.total },
        skipped: {
          ...state.skipped,
          heic: state.skipped.heic + action.heic,
          other: state.skipped.other + action.other,
        },
      };
    case "models-ready":
      return { ...state, status: "processing", backend: action.backend };
    case "photo": {
      const faces = new Map(state.faces);
      for (const f of action.faces) faces.set(f.id, f);
      return {
        ...state,
        photos: [...state.photos, action.photo],
        faces,
        progress: { ...state.progress, done: state.progress.done + 1 },
      };
    }
    case "photo-failed":
      return {
        ...state,
        progress: { ...state.progress, done: state.progress.done + 1 },
        skipped: { ...state.skipped, failed: state.skipped.failed + 1 },
      };
    case "recluster":
      return { ...state, people: cluster(state), edited: false };
    case "finish":
      return { ...state, status: "done", people: cluster(state), edited: false };
    case "error":
      return { ...state, status: state.photos.length ? "done" : "idle", error: action.message };
    case "set-threshold":
      return { ...state, threshold: action.threshold, people: cluster(state, action.threshold), edited: false };
    case "merge":
      return { ...state, people: mergePeople(state.people, action.ids), edited: true };
    case "remove-face":
      return { ...state, people: removeFaceFromPerson(state.people, action.faceId, action.newId), edited: true };
    case "rename":
      return {
        ...state,
        edited: true,
        people: state.people.map((p) =>
          p.id === action.personId ? { ...p, name: action.name.trim() || undefined } : p,
        ),
      };
    case "reset":
      for (const p of state.photos) URL.revokeObjectURL(p.url);
      return { ...initialState, threshold: state.threshold, backend: state.backend };
  }
}
