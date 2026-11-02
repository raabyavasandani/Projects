/**
 * Tunables for face detection / matching. Phase 1 exists to tune these
 * against a real camera export, so keep them in one place.
 */

/** Euclidean distance between 128-d descriptors below which two faces are "the same person". */
export const MATCH_THRESHOLD = 0.5;

/** Slider bounds for tuning the threshold in the UI. */
export const THRESHOLD_MIN = 0.3;
export const THRESHOLD_MAX = 0.7;

/** Photos are downscaled so their longest side is at most this before detection. */
export const MAX_DETECT_SIDE = 1024;

/** Minimum detector confidence for a face to be kept. */
export const MIN_DETECTION_CONFIDENCE = 0.5;

/** Faces smaller than this (px, in the downscaled image) are ignored — too blurry to describe reliably. */
export const MIN_FACE_SIZE = 40;

/** Photos with at most this many faces count as "just you / small groups" in selfie results. */
export const SMALL_GROUP_MAX_FACES = 3;

/** Where model weights are served from (copied from node_modules by scripts/copy-models.mjs). */
export const MODEL_URL = "/models";
