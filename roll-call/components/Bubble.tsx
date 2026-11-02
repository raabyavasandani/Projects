/* eslint-disable @next/next/no-img-element -- data URLs / object URLs, next/image adds nothing here */
"use client";

export function FaceBubble({
  src,
  size = 64,
  ring = "none",
}: {
  src: string;
  size?: number;
  ring?: "none" | "selected" | "merge";
}) {
  const ringClass =
    ring === "selected"
      ? "ring-4 ring-amber-400"
      : ring === "merge"
        ? "ring-4 ring-sky-400"
        : "ring-1 ring-white/15";
  return (
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      className={`rounded-full object-cover bg-neutral-800 ${ringClass}`}
      style={{ width: size, height: size }}
    />
  );
}
