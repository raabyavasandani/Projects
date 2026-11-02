/* eslint-disable @next/next/no-img-element -- local data/object URLs */
"use client";

import type { Face, Photo } from "@/lib/faces/types";

export interface GridItem {
  photo: Photo;
  /** Face to outline in the photo. */
  face?: Face;
  caption?: string;
  action?: { label: string; onClick: () => void };
}

export function PhotoGrid({ items, empty }: { items: GridItem[]; empty?: string }) {
  if (items.length === 0) {
    return <p className="text-sm text-neutral-400">{empty ?? "No photos."}</p>;
  }
  return (
    <ul className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 lg:grid-cols-6">
      {items.map(({ photo, face, caption, action }) => (
        <li key={photo.id + (face?.id ?? "")} className="group relative">
          <a href={photo.url} target="_blank" rel="noreferrer" title={photo.name} className="block">
            <div className="relative aspect-square overflow-hidden rounded-md bg-neutral-800">
              <img src={photo.thumb} alt={photo.name} loading="lazy" className="h-full w-full object-cover" />
              {face && <FaceOutline face={face} photo={photo} />}
            </div>
          </a>
          {caption && (
            <span className="pointer-events-none absolute left-1 top-1 rounded bg-black/70 px-1 font-mono text-[10px] text-amber-300">
              {caption}
            </span>
          )}
          {action && (
            <button
              type="button"
              onClick={action.onClick}
              className="absolute bottom-1 right-1 rounded bg-black/75 px-1.5 py-0.5 text-[11px] text-white hover:bg-red-600 sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100"
            >
              {action.label}
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

/**
 * Outline a face on an object-cover square thumbnail. object-cover crops the
 * longer side symmetrically, so map box coords into the visible square.
 */
function FaceOutline({ face, photo }: { face: Face; photo: Photo }) {
  const { detectWidth: w, detectHeight: h } = photo;
  const side = Math.min(w, h);
  const offX = (w - side) / 2;
  const offY = (h - side) / 2;
  const pct = (v: number) => `${(v / side) * 100}%`;
  return (
    <span
      className="pointer-events-none absolute rounded-sm border-2 border-amber-400/90"
      style={{
        left: pct(face.box.x - offX),
        top: pct(face.box.y - offY),
        width: pct(face.box.width),
        height: pct(face.box.height),
      }}
    />
  );
}
