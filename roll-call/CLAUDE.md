# Roll Call — project spec

Working name: **Roll Call**. A website where someone drops in their camera export ("a roll") and each friend gets only the photos they appear in — either by taking a selfie or via a personal link.

Audience: friend groups after a night out with a digicam/phone. NOT event photographers. Free, no accounts for friends, setup in seconds.

## Core flows

### Sharer (the person who took the photos)
1. **Create a roll** — drag-and-drop a folder or multi-select JPG/PNG files.
2. **Face detection in the browser** — detect faces + compute descriptors client-side while showing progress ("Found 14 people in 212 photos").
3. **People strip** — one face bubble per detected person (cluster). Sharer can:
   - merge two clusters ("these are the same person")
   - remove a wrong photo from a cluster
   - optionally name a person
4. **Share**
   - one roll link for the group chat (friends use selfie to find themselves), or
   - per-person link from a face bubble (no selfie needed)
5. **Controls** — hide specific photos from sharing; link expiry (default 7 days).

### Friend (recipient)
1. Opens link → consent screen: selfie is used once to find their photos, then discarded.
2. Takes a selfie (camera) or uploads one.
3. Sees "You're in N photos" — sections: **Just you / small groups** and **Group shots**.
4. **Download all** as a zip of full-resolution originals (no compression), or tap to save individual photos.
5. **Unsorted** section: photos with no confident face match (backs of heads, blur) — browsable by anyone with the roll link.

## Tech stack
- Next.js (App Router) + TypeScript + Tailwind
- Face recognition: `@vladmandic/face-api` (maintained face-api.js fork), running client-side. Serve model weights from `/public/models`.
  - Use SSD MobileNet (or TinyFaceDetector for speed) + face landmarks + face recognition net → 128-d descriptors.
  - Downscale images to ~1024px longest side before detection; process in batches so the UI stays responsive (consider a Web Worker later).
  - Match threshold: Euclidean distance ≈ 0.5 (make it a constant to tune).
  - Clustering: start with greedy clustering (assign to nearest cluster centroid if under threshold, else new cluster); refine later if needed.
- Zip downloads: JSZip (client-side)
- Phase 2 backend: Supabase (private storage bucket + Postgres), signed URLs for photos.

## Privacy rules (non-negotiable)
- Friend selfies are never uploaded or stored. Matching happens in the friend's browser.
- Face descriptors for roll photos are stored only as long as the roll exists, and are deleted when the roll expires or the sharer deletes it.
- Per-person links work without any selfie.
- Clear consent screen before any camera access.
- No analytics on faces; no reuse of descriptors across rolls.

## Build phases

### Phase 1 — local prototype (no backend)
Everything in one browser session, to prove the face matching works:
- drop photos → detect → cluster → people strip with merge/remove
- "selfie test" button: take a selfie and show matched photos
- download a person's photos as zip
Goal: test on a real camera export and tune the threshold.

### Phase 2 — sharing
- Supabase: tables `rolls`, `photos`, `faces` (photo_id, bbox, descriptor, cluster_id), `people` (cluster, optional name), `share_links` (token, roll_id, person_id nullable, expires_at)
- Upload originals to private bucket; generate thumbnails
- Roll link + per-person link pages; selfie match runs client-side against the roll's descriptors
- Expiry job that deletes photos + descriptors

### Phase 3 — polish
- Digicam aesthetic: film-strip layout, date-stamp style type, "your roll is ready" copy
- Mobile-first friend view (most friends open links on phones)
- Hide photos, rename people, re-share

## Conventions
- Mobile-first layouts; test the friend flow at phone width.
- Keep face-recognition logic in `lib/faces/` (detect, describe, cluster, match) with unit-testable pure functions where possible.
- Ask before adding new paid services.
