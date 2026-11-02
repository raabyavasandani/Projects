export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A single detected face in a photo. */
export interface Face {
  id: string;
  photoId: string;
  /** Box in the downscaled detection image's coordinates. */
  box: Box;
  score: number;
  descriptor: Float32Array;
  /** Small square crop as a data URL, for face bubbles. */
  thumb: string;
}

export interface Photo {
  id: string;
  file: File;
  name: string;
  /** Object URL of the original file (open full-size). */
  url: string;
  /** Small JPEG data URL for grids. */
  thumb: string;
  /** Size of the downscaled image face boxes are measured in. */
  detectWidth: number;
  detectHeight: number;
  faceIds: string[];
}

/** A cluster of faces believed to be one person. */
export interface Person {
  id: string;
  faceIds: string[];
  name?: string;
}

/** Minimal shape the pure clustering/matching functions need. */
export interface FaceLike {
  id: string;
  photoId: string;
  descriptor: ArrayLike<number>;
  score?: number;
}
