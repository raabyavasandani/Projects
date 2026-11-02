"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { detectLargestFace, fileToCanvas, toDetectCanvas } from "@/lib/faces/detect";
import { matchDescriptor, type SelfieMatchResult } from "@/lib/faces/match";
import { SMALL_GROUP_MAX_FACES } from "@/lib/faces/constants";
import type { Face, Person, Photo } from "@/lib/faces/types";
import { FaceBubble } from "./Bubble";
import { PhotoGrid, type GridItem } from "./PhotoGrid";

type Step = "consent" | "camera" | "working" | "result";

interface Props {
  photos: Photo[];
  faces: Map<string, Face>;
  people: Person[];
  threshold: number;
  onClose: () => void;
  onDownload: (photos: Photo[], name: string) => Promise<void>;
}

export function SelfieTest({ photos, faces, people, threshold, onClose, onDownload }: Props) {
  const [step, setStep] = useState<Step>("consent");
  const [error, setError] = useState<string | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [selfie, setSelfie] = useState<{ thumb: string; descriptor: Float32Array } | null>(null);
  const [downloading, setDownloading] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  // Always release the camera when the stream changes or the modal closes.
  useEffect(() => () => stream?.getTracks().forEach((t) => t.stop()), [stream]);

  const result: SelfieMatchResult | null = useMemo(
    () => (selfie ? matchDescriptor(selfie.descriptor, [...faces.values()], people, threshold) : null),
    [selfie, faces, people, threshold],
  );

  async function startCamera() {
    setError(null);
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 } },
        audio: false,
      });
      setStream(s);
      setStep("camera");
    } catch (e) {
      setError(
        `Couldn't open the camera (${(e as Error).name}). On a phone over your network the page must be served over HTTPS — try "npm run dev:https", or upload a selfie instead.`,
      );
    }
  }

  async function analyse(canvas: HTMLCanvasElement) {
    setStep("working");
    setError(null);
    try {
      const face = await detectLargestFace(canvas);
      if (!face) {
        setError("No face found in that selfie. Try again with your face well lit and filling more of the frame.");
        setStep("consent");
        return;
      }
      setSelfie({ thumb: face.thumb, descriptor: face.descriptor });
      setStep("result");
    } catch (e) {
      setError(`Face detection failed: ${(e as Error).message}`);
      setStep("consent");
    }
  }

  async function capture() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const full = document.createElement("canvas");
    full.width = video.videoWidth;
    full.height = video.videoHeight;
    full.getContext("2d")!.drawImage(video, 0, 0);
    stream?.getTracks().forEach((t) => t.stop());
    setStream(null);
    await analyse(toDetectCanvas(full));
  }

  async function upload(file: File | undefined) {
    if (!file) return;
    try {
      await analyse(await fileToCanvas(file));
    } catch {
      setError("Couldn't read that image. Use a JPG or PNG.");
      setStep("consent");
    }
  }

  function retake() {
    setSelfie(null);
    setStep("consent");
  }

  const photoById = useMemo(() => new Map(photos.map((p) => [p.id, p])), [photos]);
  const matched = (result?.photos ?? []).map((m) => ({ ...m, photo: photoById.get(m.photoId)! }));
  const toItem = (m: (typeof matched)[number]): GridItem => ({
    photo: m.photo,
    face: faces.get(m.faceId),
    caption: m.distance.toFixed(2),
  });
  const small = matched.filter((m) => m.photo.faceIds.length <= SMALL_GROUP_MAX_FACES);
  const group = matched.filter((m) => m.photo.faceIds.length > SMALL_GROUP_MAX_FACES);
  const personById = new Map(people.map((p) => [p.id, p]));
  const firstThumb = (personId: string) => faces.get(personById.get(personId)!.faceIds[0])!.thumb;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 sm:items-center sm:p-4">
      <div className="flex max-h-[100dvh] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl bg-neutral-900 sm:max-h-[90vh] sm:rounded-2xl">
        <header className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <h2 className="font-semibold">Selfie test</h2>
          <button type="button" onClick={onClose} className="rounded px-2 py-1 text-neutral-300 hover:bg-white/10">
            Close
          </button>
        </header>

        <div className="overflow-y-auto p-4">
          {error && <p className="mb-3 rounded-md bg-red-950 px-3 py-2 text-sm text-red-200">{error}</p>}

          {step === "consent" && (
            <div className="space-y-4">
              <p className="text-sm text-neutral-300">
                Your selfie is used once, <strong>in this browser only</strong>, to find the photos you&apos;re in. It
                is never uploaded or saved, and the camera turns off as soon as the picture is taken.
              </p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={startCamera}
                  className="rounded-lg bg-amber-400 px-4 py-2.5 font-medium text-black hover:bg-amber-300"
                >
                  Use camera
                </button>
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="rounded-lg border border-white/20 px-4 py-2.5 hover:bg-white/10"
                >
                  Upload a selfie
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  capture="user"
                  className="hidden"
                  onChange={(e) => {
                    void upload(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
              </div>
            </div>
          )}

          {step === "camera" && (
            <div className="space-y-3">
              <video
                ref={(el) => {
                  videoRef.current = el;
                  if (el && stream && el.srcObject !== stream) el.srcObject = stream;
                }}
                autoPlay
                playsInline
                muted
                className="mx-auto aspect-[3/4] w-full max-w-sm -scale-x-100 rounded-xl bg-black object-cover"
              />
              <button
                type="button"
                onClick={capture}
                className="mx-auto block rounded-full bg-amber-400 px-6 py-3 font-medium text-black hover:bg-amber-300"
              >
                Take selfie
              </button>
            </div>
          )}

          {step === "working" && <p className="py-8 text-center text-neutral-300">Finding your face…</p>}

          {step === "result" && selfie && result && (
            <div className="space-y-5">
              <div className="flex items-center gap-3">
                <FaceBubble src={selfie.thumb} size={56} />
                <div>
                  <p className="text-lg font-semibold">
                    {matched.length === 0
                      ? "No matches at this threshold"
                      : `You're in ${matched.length} photo${matched.length === 1 ? "" : "s"}`}
                  </p>
                  <p className="text-xs text-neutral-400">
                    Threshold {threshold.toFixed(2)} · numbers on photos are distances (lower = more similar)
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={matched.length === 0 || downloading}
                  onClick={async () => {
                    setDownloading(true);
                    try {
                      await onDownload(matched.map((m) => m.photo), "my-photos");
                    } finally {
                      setDownloading(false);
                    }
                  }}
                  className="rounded-lg bg-amber-400 px-4 py-2 font-medium text-black hover:bg-amber-300 disabled:opacity-40"
                >
                  {downloading ? "Zipping…" : "Download all"}
                </button>
                <button type="button" onClick={retake} className="rounded-lg border border-white/20 px-4 py-2 hover:bg-white/10">
                  Retake
                </button>
              </div>

              <section>
                <h3 className="mb-2 text-sm font-medium text-neutral-300">Just you / small groups ({small.length})</h3>
                <PhotoGrid items={small.map(toItem)} empty="None." />
              </section>
              <section>
                <h3 className="mb-2 text-sm font-medium text-neutral-300">Group shots ({group.length})</h3>
                <PhotoGrid items={group.map(toItem)} empty="None." />
              </section>

              <details className="rounded-lg border border-white/10 p-3 text-sm">
                <summary className="cursor-pointer text-neutral-300">Tuning: closest people</summary>
                <table className="mt-2 w-full text-left font-mono text-xs">
                  <thead className="text-neutral-400">
                    <tr>
                      <th className="py-1">person</th>
                      <th>centroid</th>
                      <th>nearest face</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.ranked.slice(0, 5).map((r) => (
                      <tr key={r.personId} className={r.centroidDistance < threshold ? "text-amber-300" : ""}>
                        <td className="py-1">
                          <span className="flex items-center gap-2">
                            <FaceBubble src={firstThumb(r.personId)} size={28} />
                            {personById.get(r.personId)?.name ?? ""}
                          </span>
                        </td>
                        <td>{r.centroidDistance.toFixed(3)}</td>
                        <td>{r.nearestFaceDistance.toFixed(3)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
