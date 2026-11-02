"use client";

import { useMemo, useReducer, useRef, useState } from "react";
import { canvasThumb, currentBackend, detectFaces, fileToCanvas, loadFaceApi } from "@/lib/faces/detect";
import { photosOfPerson } from "@/lib/faces/cluster";
import { THRESHOLD_MAX, THRESHOLD_MIN } from "@/lib/faces/constants";
import type { Face, Person, Photo } from "@/lib/faces/types";
import { filesFromDrop, partitionFiles } from "@/lib/files";
import { initialState, reducer } from "@/lib/roll-state";
import { downloadZip } from "@/lib/zip";
import { FaceBubble } from "./Bubble";
import { PhotoGrid } from "./PhotoGrid";
import { SelfieTest } from "./SelfieTest";

/** Re-cluster this often while processing so the people strip fills in live. */
const LIVE_CLUSTER_EVERY = 10;

const yieldToUI = () => new Promise<void>((r) => setTimeout(r, 0));
const newId = () => crypto.randomUUID().slice(0, 8);

export function RollCall() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mergeMode, setMergeMode] = useState(false);
  const [mergeIds, setMergeIds] = useState<string[]>([]);
  const [showOneOffs, setShowOneOffs] = useState(false);
  const [selfieOpen, setSelfieOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [zipProgress, setZipProgress] = useState<number | null>(null);
  const busy = useRef(false);

  const { photos, faces, people, threshold, status, progress, skipped } = state;
  const photoById = useMemo(() => new Map(photos.map((p) => [p.id, p])), [photos]);

  const peopleInfo = useMemo(
    () =>
      people.map((p) => ({
        person: p,
        photoIds: photosOfPerson(p, faces),
        // Bubble = highest-confidence face
        thumb: p.faceIds.map((id) => faces.get(id)!).reduce((a, b) => (b.score > a.score ? b : a)).thumb,
      })),
    [people, faces],
  );
  const regulars = peopleInfo.filter((i) => i.photoIds.length > 1);
  const oneOffs = peopleInfo.filter((i) => i.photoIds.length <= 1);
  const visible = showOneOffs ? peopleInfo : regulars;
  const selected = peopleInfo.find((i) => i.person.id === selectedId) ?? null;
  const unsorted = photos.filter((p) => p.faceIds.length === 0);

  async function ingest(files: File[]) {
    if (busy.current) return;
    const { images, heic, other } = partitionFiles(files);
    if (images.length === 0) {
      dispatch({
        type: "error",
        message: heic.length
          ? `Found ${heic.length} HEIC file(s), which browsers can't decode. Export as JPEG (on iPhone: Settings → Camera → Formats → Most Compatible) and try again.`
          : "No JPG/PNG/WebP images found in that drop.",
      });
      return;
    }
    busy.current = true;
    dispatch({ type: "start", total: images.length, heic: heic.length, other: other });
    try {
      await loadFaceApi();
      dispatch({ type: "models-ready", backend: currentBackend() });
    } catch (e) {
      busy.current = false;
      dispatch({
        type: "error",
        message: `Couldn't load face models from /models (${(e as Error).message}). Run "npm install" (it copies them into public/models) and restart.`,
      });
      return;
    }

    for (let i = 0; i < images.length; i++) {
      const file = images[i];
      try {
        const canvas = await fileToCanvas(file);
        const detected = await detectFaces(canvas);
        const photoId = newId();
        const photoFaces: Face[] = detected.map((d, j) => ({ ...d, id: `${photoId}-${j}`, photoId }));
        const photo: Photo = {
          id: photoId,
          file,
          name: file.webkitRelativePath || file.name,
          url: URL.createObjectURL(file),
          thumb: canvasThumb(canvas),
          detectWidth: canvas.width,
          detectHeight: canvas.height,
          faceIds: photoFaces.map((f) => f.id),
        };
        dispatch({ type: "photo", photo, faces: photoFaces });
      } catch (e) {
        console.warn("Failed to process", file.name, e);
        dispatch({ type: "photo-failed" });
      }
      if ((i + 1) % LIVE_CLUSTER_EVERY === 0) dispatch({ type: "recluster" });
      await yieldToUI();
    }
    dispatch({ type: "finish" });
    setSelectedId(null);
    busy.current = false;
  }

  async function download(list: Photo[], name: string) {
    setZipProgress(0);
    try {
      await downloadZip(
        list.map((p) => p.file),
        name,
        (pct) => setZipProgress(pct),
      );
    } finally {
      setZipProgress(null);
    }
  }

  function confirmDiscardEdits() {
    return !state.edited || confirm("Re-clustering will undo your merges, removals and names. Continue?");
  }

  function toggleMerge(id: string) {
    setMergeIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  }

  function doMerge() {
    dispatch({ type: "merge", ids: mergeIds });
    setSelectedId(mergeIds[0]);
    setMergeIds([]);
    setMergeMode(false);
  }

  const working = status === "loading-models" || status === "processing";
  const totalPeople = regulars.length;

  return (
    <main
      className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-6"
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDragging(false);
      }}
      onDrop={async (e) => {
        e.preventDefault();
        setDragging(false);
        if (working) return;
        if (photos.length > 0 && !confirmDiscardEdits()) return;
        await ingest(await filesFromDrop(e.dataTransfer));
      }}
    >
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-mono text-2xl font-bold tracking-tight">
            ROLL<span className="text-amber-400">●</span>CALL
          </h1>
          <p className="text-xs text-neutral-400">Phase 1 prototype · everything stays in this browser tab</p>
        </div>
        {photos.length > 0 && !working && (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setSelfieOpen(true)}
              disabled={people.length === 0}
              className="rounded-lg bg-amber-400 px-4 py-2 text-sm font-medium text-black hover:bg-amber-300 disabled:opacity-40"
            >
              Selfie test
            </button>
            <button
              type="button"
              onClick={() => {
                if (!confirmDiscardEdits()) return;
                dispatch({ type: "reset" });
                setSelectedId(null);
              }}
              className="rounded-lg border border-white/20 px-3 py-2 text-sm hover:bg-white/10"
            >
              New roll
            </button>
          </div>
        )}
      </header>

      {state.backend && state.backend !== "webgl" && (
        <p className="rounded-md bg-amber-950 px-3 py-2 text-sm text-amber-200">
          WebGL isn&apos;t available, so face detection is running on the CPU ({state.backend}) and will be very slow.
          Use a recent Chrome/Safari/Firefox with hardware acceleration enabled.
        </p>
      )}

      {state.error && <p className="rounded-md bg-red-950 px-3 py-2 text-sm text-red-200">{state.error}</p>}

      {photos.length === 0 && !working ? (
        <DropZone dragging={dragging} onFiles={ingest} />
      ) : (
        <>
          <Progress
            status={status}
            done={progress.done}
            total={progress.total}
            people={totalPeople}
            photos={photos.length}
            skipped={skipped}
          />

          {/* People strip */}
          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-medium text-neutral-300">
                People {oneOffs.length > 0 && <span className="text-neutral-500">· {oneOffs.length} seen once</span>}
              </h2>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                {oneOffs.length > 0 && (
                  <label className="flex items-center gap-1.5 text-neutral-400">
                    <input type="checkbox" checked={showOneOffs} onChange={(e) => setShowOneOffs(e.target.checked)} />
                    show seen-once
                  </label>
                )}
                {mergeMode ? (
                  <>
                    <button
                      type="button"
                      disabled={mergeIds.length < 2}
                      onClick={doMerge}
                      className="rounded-md bg-sky-500 px-3 py-1 font-medium text-black disabled:opacity-40"
                    >
                      Merge {mergeIds.length || ""}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMergeMode(false);
                        setMergeIds([]);
                      }}
                      className="rounded-md border border-white/20 px-3 py-1"
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    disabled={people.length < 2 || working}
                    onClick={() => setMergeMode(true)}
                    className="rounded-md border border-white/20 px-3 py-1 hover:bg-white/10 disabled:opacity-40"
                  >
                    Merge people…
                  </button>
                )}
              </div>
            </div>
            {mergeMode && (
              <p className="text-xs text-sky-300">Tap the bubbles that are the same person, then Merge.</p>
            )}
            <div className="-mx-4 overflow-x-auto px-4 pb-2">
              <ul className="flex gap-3">
                {visible.map(({ person, photoIds, thumb }) => {
                  const inMerge = mergeIds.includes(person.id);
                  return (
                    <li key={person.id}>
                      <button
                        type="button"
                        onClick={() =>
                          mergeMode
                            ? toggleMerge(person.id)
                            : setSelectedId((s) => (s === person.id ? null : person.id))
                        }
                        className="flex w-[72px] flex-col items-center gap-1"
                      >
                        <FaceBubble
                          src={thumb}
                          ring={inMerge ? "merge" : person.id === selectedId && !mergeMode ? "selected" : "none"}
                        />
                        <span className="w-full truncate text-center text-xs text-neutral-300">
                          {person.name ?? `${photoIds.length} photo${photoIds.length === 1 ? "" : "s"}`}
                        </span>
                      </button>
                    </li>
                  );
                })}
                {visible.length === 0 && (
                  <li className="text-sm text-neutral-500">{working ? "Looking for faces…" : "No people yet."}</li>
                )}
              </ul>
            </div>
          </section>

          {/* Threshold tuning */}
          <section className="rounded-lg border border-white/10 p-3">
            <label className="flex flex-wrap items-center gap-3 text-sm">
              <span className="text-neutral-300">Match threshold</span>
              <input
                type="range"
                min={THRESHOLD_MIN}
                max={THRESHOLD_MAX}
                step={0.01}
                value={threshold}
                disabled={working}
                onChange={(e) => {
                  if (!confirmDiscardEdits()) return;
                  dispatch({ type: "set-threshold", threshold: Number(e.target.value) });
                  setSelectedId(null);
                  setMergeIds([]);
                }}
                className="flex-1 accent-amber-400"
              />
              <span className="w-10 font-mono text-amber-300">{threshold.toFixed(2)}</span>
            </label>
            <p className="mt-1 text-xs text-neutral-500">
              Lower = stricter (more people, fewer wrong matches). Higher = looser (fewer people, more merges). Changing
              it re-clusters from scratch.
            </p>
          </section>

          {selected && !mergeMode && (
            <PersonPanel
              key={selected.person.id}
              person={selected.person}
              photoIds={selected.photoIds}
              thumb={selected.thumb}
              photoById={photoById}
              faces={faces}
              zipProgress={zipProgress}
              onRename={(name) => dispatch({ type: "rename", personId: selected.person.id, name })}
              onRemoveFace={(faceId) => dispatch({ type: "remove-face", faceId, newId: newId() })}
              onDownload={(list) => download(list, `${selected.person.name || "person"}-photos`)}
            />
          )}

          {!working && unsorted.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-sm font-medium text-neutral-300">Unsorted · no faces found ({unsorted.length})</h2>
              <PhotoGrid items={unsorted.map((photo) => ({ photo }))} />
            </section>
          )}
        </>
      )}

      {selfieOpen && (
        <SelfieTest
          photos={photos}
          faces={faces}
          people={people}
          threshold={threshold}
          onClose={() => setSelfieOpen(false)}
          onDownload={download}
        />
      )}
    </main>
  );
}

function DropZone({ dragging, onFiles }: { dragging: boolean; onFiles: (files: File[]) => void }) {
  const folderRef = useRef<HTMLInputElement>(null);
  const filesRef = useRef<HTMLInputElement>(null);
  return (
    <div
      className={`flex flex-1 flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed p-10 text-center transition-colors ${
        dragging ? "border-amber-400 bg-amber-400/5" : "border-white/15"
      }`}
    >
      <p className="text-lg font-medium">Drop your camera roll here</p>
      <p className="max-w-sm text-sm text-neutral-400">
        A folder or a bunch of JPG/PNG files. Faces are detected right here in your browser — nothing is uploaded.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          onClick={() => folderRef.current?.click()}
          className="rounded-lg bg-amber-400 px-4 py-2 font-medium text-black hover:bg-amber-300"
        >
          Choose folder
        </button>
        <button
          type="button"
          onClick={() => filesRef.current?.click()}
          className="rounded-lg border border-white/20 px-4 py-2 hover:bg-white/10"
        >
          Choose photos
        </button>
      </div>
      <input
        ref={folderRef}
        type="file"
        className="hidden"
        // @ts-expect-error -- non-standard but supported by all major browsers
        webkitdirectory=""
        multiple
        onChange={(e) => {
          onFiles([...(e.target.files ?? [])]);
          e.target.value = "";
        }}
      />
      <input
        ref={filesRef}
        type="file"
        className="hidden"
        accept="image/jpeg,image/png,image/webp,.heic,.heif"
        multiple
        onChange={(e) => {
          onFiles([...(e.target.files ?? [])]);
          e.target.value = "";
        }}
      />
    </div>
  );
}

function Progress({
  status,
  done,
  total,
  people,
  photos,
  skipped,
}: {
  status: string;
  done: number;
  total: number;
  people: number;
  photos: number;
  skipped: { heic: number; failed: number; other: number };
}) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  const notes = [
    skipped.heic && `${skipped.heic} HEIC skipped (export as JPEG)`,
    skipped.failed && `${skipped.failed} couldn't be read`,
    skipped.other && `${skipped.other} non-image files ignored`,
  ].filter(Boolean);
  return (
    <section className="space-y-2">
      <p className="text-sm">
        {status === "loading-models" && "Loading face models…"}
        {status === "processing" && `Scanning ${done} / ${total} photos · found ${people} people so far`}
        {status === "done" && (
          <>
            Found <strong>{people}</strong> {people === 1 ? "person" : "people"} in <strong>{photos}</strong> photos
          </>
        )}
      </p>
      {status !== "done" && (
        <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
          <div className="h-full bg-amber-400 transition-[width]" style={{ width: `${pct}%` }} />
        </div>
      )}
      {notes.length > 0 && <p className="text-xs text-neutral-500">{notes.join(" · ")}</p>}
    </section>
  );
}

function PersonPanel({
  person,
  photoIds,
  thumb,
  photoById,
  faces,
  zipProgress,
  onRename,
  onRemoveFace,
  onDownload,
}: {
  person: Person;
  photoIds: string[];
  thumb: string;
  photoById: Map<string, Photo>;
  faces: Map<string, Face>;
  zipProgress: number | null;
  onRename: (name: string) => void;
  onRemoveFace: (faceId: string) => void;
  onDownload: (photos: Photo[]) => void;
}) {
  const [name, setName] = useState(person.name ?? "");
  const items = person.faceIds.map((faceId) => {
    const face = faces.get(faceId)!;
    return {
      photo: photoById.get(face.photoId)!,
      face,
      action: person.faceIds.length > 1 ? { label: "Not them ✕", onClick: () => onRemoveFace(faceId) } : undefined,
    };
  });

  return (
    <section className="space-y-3 rounded-xl border border-white/10 bg-white/[0.02] p-3">
      <div className="flex flex-wrap items-center gap-3">
        <FaceBubble src={thumb} size={48} />
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name !== (person.name ?? "") && onRename(name)}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          placeholder="Name (optional)"
          className="min-w-[10rem] flex-1 rounded-md border border-white/15 bg-transparent px-2 py-1.5 text-sm"
        />
        <button
          type="button"
          disabled={zipProgress !== null}
          onClick={() => onDownload(photoIds.map((id) => photoById.get(id)!))}
          className="rounded-lg bg-amber-400 px-4 py-2 text-sm font-medium text-black hover:bg-amber-300 disabled:opacity-50"
        >
          {zipProgress !== null ? `Zipping ${Math.round(zipProgress)}%` : `Download ${photoIds.length} as zip`}
        </button>
      </div>
      <p className="text-xs text-neutral-500">
        Outlined face = who this person is in that photo. Hit &ldquo;Not them&rdquo; to split a wrong face out into its
        own bubble.
      </p>
      <PhotoGrid items={items} />
    </section>
  );
}
