// Copies the face-api model weights we use from node_modules into public/models.
// Runs automatically after `npm install` (postinstall).
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "node_modules", "@vladmandic", "face-api", "model");
const dest = join(root, "public", "models");
const models = ["ssd_mobilenetv1_model", "face_landmark_68_model", "face_recognition_model"];

if (!existsSync(src)) {
  console.warn(`[copy-models] ${src} not found — is @vladmandic/face-api installed?`);
  process.exit(0);
}
mkdirSync(dest, { recursive: true });
for (const m of models) {
  for (const f of [`${m}-weights_manifest.json`, `${m}.bin`]) copyFileSync(join(src, f), join(dest, f));
}
console.log(`[copy-models] copied ${models.length} models to public/models`);
