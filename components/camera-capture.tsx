"use client";

import { useRef, useState } from "react";

type Props = {
  /** 拍完照回呼：傳回壓縮過的 Blob 與預覽 dataURL */
  onCapture: (blob: Blob, previewUrl: string) => void;
  maxWidth?: number;
  quality?: number;
};

/**
 * 手機相機拍照（非前置）+ Canvas 壓縮。
 * 用 <input capture="environment"> 直接開啟原生相機。
 */
export function CameraCapture({
  onCapture,
  maxWidth = 1280,
  quality = 0.8
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const { blob, dataUrl } = await compress(file, maxWidth, quality);
      setPreview(dataUrl);
      onCapture(blob, dataUrl);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleChange}
      />
      <button
        type="button"
        className="btn-secondary"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
      >
        {preview ? "重拍" : "📷 拍現場照"}
      </button>
      {preview && (
        <img
          src={preview}
          alt="preview"
          className="w-full rounded-xl border border-neutral-200"
        />
      )}
    </div>
  );
}

async function compress(
  file: File,
  maxWidth: number,
  quality: number
): Promise<{ blob: Blob; dataUrl: string }> {
  const dataUrl = await fileToDataUrl(file);
  const img = await loadImage(dataUrl);
  const scale = Math.min(1, maxWidth / img.width);
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0, w, h);
  const blob: Blob = await new Promise((res) =>
    canvas.toBlob((b) => res(b!), "image/jpeg", quality)
  );
  return { blob, dataUrl: canvas.toDataURL("image/jpeg", quality) };
}

function fileToDataUrl(f: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = rej;
    r.readAsDataURL(f);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = rej;
    i.src = src;
  });
}
