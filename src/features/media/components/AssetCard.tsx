"use client";

import { Image as ImageIcon, Music, Plus, Trash2, Video } from "lucide-react";

import type { MediaAsset } from "@/core/project/schema";
import { formatBytes } from "@/core/media/validation";
import { formatDuration } from "@/core/types/time";

import { addAssetToTimeline, ASSET_DRAG_TYPE, deleteAsset } from "../actions";
import { useBlobUrl } from "../hooks/useBlobUrl";

const KIND_ICON = { video: Video, audio: Music, image: ImageIcon } as const;
const KIND_LABEL = { video: "Video", audio: "Audio", image: "Imagen" } as const;

export function AssetCard({ asset, onError }: { asset: MediaAsset; onError: (message: string) => void }) {
  const previewBlobId = asset.thumbnailBlobId ?? (asset.kind === "image" ? asset.blobId : undefined);
  const url = useBlobUrl(previewBlobId);
  const Icon = KIND_ICON[asset.kind];

  const details = [
    KIND_LABEL[asset.kind],
    asset.width && asset.height ? `${asset.width}×${asset.height}` : null,
    formatBytes(asset.size),
  ]
    .filter(Boolean)
    .join(" · ");

  const add = () => {
    const result = addAssetToTimeline(asset);
    if (!result.ok) onError(result.reason);
  };

  const remove = async () => {
    if (!window.confirm(`¿Eliminar "${asset.name}" de la biblioteca? El archivo se borrará de este dispositivo.`)) return;
    const result = await deleteAsset(asset);
    if (!result.ok) onError(result.reason);
  };

  return (
    <li className="group relative">
      <div
        draggable
        onDragStart={(event) => {
          event.dataTransfer.setData(ASSET_DRAG_TYPE, asset.id);
          event.dataTransfer.effectAllowed = "copy";
        }}
        onDoubleClick={add}
        title={`${asset.name}\n${details}`}
        className="cursor-grab overflow-hidden rounded-lg border border-border bg-panel-raised active:cursor-grabbing"
      >
        <div className="relative aspect-video bg-canvas">
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element -- object URL local, next/image no aplica
            <img src={url} alt="" draggable={false} loading="lazy" decoding="async" className="size-full object-cover" />
          ) : (
            <div className="grid size-full place-items-center">
              <Icon className="size-6 text-muted-foreground" aria-hidden />
            </div>
          )}
          {asset.duration !== undefined && (
            <span className="absolute right-1 bottom-1 rounded bg-black/70 px-1 font-mono text-[10px] tabular-nums">
              {formatDuration(asset.duration)}
            </span>
          )}
          <Icon className="absolute top-1 left-1 size-3.5 text-white drop-shadow" aria-hidden />
        </div>
        <p className="truncate px-2 py-1.5 text-[11px]">{asset.name}</p>
      </div>
      <div className="absolute top-1 right-1 flex gap-1 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
        <button
          type="button"
          onClick={add}
          aria-label={`Añadir ${asset.name} al timeline`}
          className="grid size-6 place-items-center rounded-md bg-primary text-primary-foreground shadow hover:bg-primary/85"
        >
          <Plus className="size-3.5" />
        </button>
        <button
          type="button"
          onClick={remove}
          aria-label={`Eliminar ${asset.name}`}
          className="grid size-6 place-items-center rounded-md bg-black/70 text-white shadow hover:bg-destructive"
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>
    </li>
  );
}
