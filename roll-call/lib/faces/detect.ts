/**
 * Browser-only face detection + description via @vladmandic/face-api.
 * Imported dynamically so it never runs during server rendering.
 */
import {
  MAX_DETECT_SIDE,
  MIN_DETECTION_CONFIDENCE,
  MIN_FACE_SIZE,
  MODEL_URL,
} from "./constants";
import type { Box } from "./types";

type FaceApi = typeof import("@vladmandic/face-api");

let apiPromise: Promise<FaceApi> | null = null;
let backendName = "";

/** The tfjs backend in use after loadFaceApi() ("webgl" is fast; "cpu" is very slow). */
export function currentBackend(): string {
  return backendName;
}

/** Load face-api + the three models we need (once). */
export function loadFaceApi(): Promise<FaceApi> {
  if (!apiPromise) {
    apiPromise = (async () => {
      const faceapi = await import("@vladmandic/face-api");
      // face-api bundles tfjs; prefer WebGL, fall back to whatever's available.
      const tf = (
        faceapi as unknown as {
          tf: {
            setBackend(b: string): Promise<boolean>;
            ready(): Promise<void>;
            getBackend(): string;
            env(): { set(flag: string, value: boolean): void };
          };
        }
      ).tf;
      // WebGL is ~50x faster than CPU. (The wasm backend would need its .wasm
      // files served separately, so we skip it and go straight to CPU.)
      // Accept software-rendered WebGL too (e.g. no GPU / blocklisted drivers):
      // still much faster than the CPU backend.
      tf.env().set("SOFTWARE_WEBGL_ENABLED", true);
      let ok = false;
      try {
        ok = await tf.setBackend("webgl");
      } catch {
        ok = false;
      }
      if (!ok) await tf.setBackend("cpu");
      await tf.ready();
      backendName = tf.getBackend();
      await Promise.all([
        faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
        faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
        faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
      ]);
      return faceapi;
    })();
    apiPromise.catch(() => {
      apiPromise = null;
    });
  }
  return apiPromise;
}

export interface DetectedFace {
  box: Box;
  score: number;
  descriptor: Float32Array;
  thumb: string;
}

/** Draw an image source onto a canvas, downscaled so its longest side ≤ maxSide. */
export function toDetectCanvas(
  source: CanvasImageSource & { width: number; height: number },
  maxSide = MAX_DETECT_SIDE,
): HTMLCanvasElement {
  const scale = Math.min(1, maxSide / Math.max(source.width, source.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(source.width * scale);
  canvas.height = Math.round(source.height * scale);
  canvas.getContext("2d", { willReadFrequently: true })!.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/** Decode a File (respecting EXIF orientation) into a downscaled canvas. */
export async function fileToCanvas(file: Blob): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    return toDetectCanvas(bitmap);
  } finally {
    bitmap.close();
  }
}

/** Downscaled JPEG data URL of a whole canvas, for photo grids. */
export function canvasThumb(canvas: HTMLCanvasElement, maxSide = 480): string {
  return toDetectCanvas(canvas, maxSide).toDataURL("image/jpeg", 0.75);
}

/** Square crop around a face with some padding, as a small JPEG data URL. */
function cropThumb(canvas: HTMLCanvasElement, box: Box, size = 112): string {
  const side = Math.max(box.width, box.height) * 1.5;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const out = document.createElement("canvas");
  out.width = size;
  out.height = size;
  out.getContext("2d")!.drawImage(canvas, cx - side / 2, cy - side / 2, side, side, 0, 0, size, size);
  return out.toDataURL("image/jpeg", 0.8);
}

/** Detect all faces in a canvas and compute 128-d descriptors. */
export async function detectFaces(canvas: HTMLCanvasElement): Promise<DetectedFace[]> {
  const faceapi = await loadFaceApi();
  const results = await faceapi
    .detectAllFaces(canvas, new faceapi.SsdMobilenetv1Options({ minConfidence: MIN_DETECTION_CONFIDENCE }))
    .withFaceLandmarks()
    .withFaceDescriptors();

  return results
    .filter((r) => Math.min(r.detection.box.width, r.detection.box.height) >= MIN_FACE_SIZE)
    .map((r) => {
      const { x, y, width, height } = r.detection.box;
      const box = { x, y, width, height };
      return { box, score: r.detection.score, descriptor: r.descriptor, thumb: cropThumb(canvas, box) };
    });
}

/** For a selfie: the single largest face, or null. */
export async function detectLargestFace(canvas: HTMLCanvasElement): Promise<DetectedFace | null> {
  const faces = await detectFaces(canvas);
  if (faces.length === 0) return null;
  return faces.reduce((a, b) => (a.box.width * a.box.height >= b.box.width * b.box.height ? a : b));
}
