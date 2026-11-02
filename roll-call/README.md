# Roll Call — Phase 1 prototype

Drop in a camera export, see everyone's faces clustered into a people strip, fix
mistakes (merge / "not them"), run a selfie test, and download one person's
photos as a zip. **Everything runs in your browser tab** — no backend, nothing
uploaded. See [`CLAUDE.md`](./CLAUDE.md) for the full product spec.

## Run it

Requires Node 20+.

```bash
cd roll-call
npm install      # also copies face-api model weights into public/models
npm run dev
```

Open http://localhost:3000 in Chrome, Safari or Firefox (desktop is easiest).

### Testing the selfie flow on your phone

Browsers only allow camera access on `localhost` or HTTPS. To use your phone on
the same Wi-Fi:

```bash
npm run dev:https
```

Then open `https://<your-computer's-LAN-IP>:3000` on the phone and accept the
self-signed certificate warning. (Or just use "Upload a selfie".)

## Testing with your real camera export

1. Click **Choose folder** (or drag the folder onto the page). JPG / PNG / WebP
   are supported. **HEIC isn't** — browsers can't decode it; export as JPEG
   (iPhone: Settings → Camera → Formats → Most Compatible, or AirDrop/export
   as JPEG).
2. Watch "Scanning N / M photos · found X people so far". With a GPU expect
   roughly 0.2–0.5 s per photo. If you see a yellow "running on the CPU"
   banner, enable hardware acceleration in your browser — CPU is ~50× slower.
3. **People strip** — one bubble per person, sorted by how many photos they're
   in. People seen in only one photo (often strangers in the background) are
   hidden; tick *show seen-once* to see them.
4. Tap a bubble to see their photos (their face is outlined).
   - **Not them ✕** splits that face out into its own bubble.
   - **Merge people…** → tap the bubbles that are the same person → *Merge*.
   - Optional name.
   - **Download N as zip** — full-resolution originals, no recompression.
5. **Selfie test** → consent → camera or upload → "You're in N photos", split
   into *Just you / small groups* and *Group shots*. The small numbers on each
   photo are descriptor distances (lower = more similar). Open *Tuning: closest
   people* to see how far the selfie was from each person.
6. **Unsorted** lists photos with no detectable face.

### Tuning the threshold

The **Match threshold** slider (default `0.50`) re-clusters instantly:

- People split into several bubbles → raise it (try 0.55).
- Different people lumped together → lower it (try 0.45).

Changing it discards merges/names (you'll be asked). Once you find a good
value, set `MATCH_THRESHOLD` in `lib/faces/constants.ts`. Other knobs live in
the same file (detection size, min confidence, min face size).

## How it works

- `@vladmandic/face-api` (TensorFlow.js, WebGL backend): SSD MobileNet v1 →
  68-point landmarks → 128-d face descriptor. Images are downscaled to 1024px
  longest side first, one at a time, yielding to the UI between photos.
- **Clustering** (`lib/faces/cluster.ts`): greedy — faces sorted by detection
  confidence, each joins the nearest cluster centroid under the threshold, else
  starts a new cluster. A cluster never takes two faces from the same photo.
- **Selfie match** (`lib/faces/match.ts`): matches every photo with a face
  within the threshold of the selfie, plus all photos of the best-matching
  person (by centroid) — so merges/removals you made are respected.

```
lib/faces/       constants, types, distance, cluster, match (pure, unit-tested), detect (browser-only)
lib/files.ts     folder drag-and-drop traversal, file filtering
lib/zip.ts       JSZip download (STORE, no compression)
lib/roll-state.ts  reducer for the whole roll
components/      RollCall (main page), SelfieTest, PhotoGrid, Bubble
```

## Scripts

| | |
|---|---|
| `npm run dev` | dev server on :3000 |
| `npm run dev:https` | dev server with a self-signed cert (camera on phones) |
| `npm test` | unit tests for clustering / matching / zip naming |
| `npm run lint` | ESLint |
| `npm run build` | production build |

## Known limitations (Phase 1)

- State lives in memory only — refreshing the page loses the roll.
- Detection runs on the main thread (a Web Worker is a later improvement).
- Very large rolls (1000+ photos) work but hold a thumbnail per photo in memory.
