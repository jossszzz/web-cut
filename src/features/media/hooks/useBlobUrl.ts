"use client";

import { useEffect, useState } from "react";

import { getRepositories } from "@/infrastructure";

/**
 * Object URL de un blob guardado en IndexedDB. Lo revoca al desmontar o al
 * cambiar de blob para no retener memoria.
 */
export function useBlobUrl(blobId: string | undefined): string | null {
  const [entry, setEntry] = useState<{ blobId: string; url: string } | null>(null);

  useEffect(() => {
    if (!blobId) return;
    let url: string | null = null;
    let cancelled = false;
    getRepositories()
      .blobs.get(blobId)
      .then((blob) => {
        if (cancelled || !blob) return;
        url = URL.createObjectURL(blob);
        setEntry({ blobId, url });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [blobId]);

  return entry && entry.blobId === blobId ? entry.url : null;
}
