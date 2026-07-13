"use client";

import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { ReferenceImageCard } from "./reference-image-card";

export type GridImage = {
  id: string;
  imageUrl: string;
  filename: string;
  subtitle: string;
};

type Props = {
  images: GridImage[];
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  loading: boolean;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  searchPlaceholder?: string;
  emptyMessage: string;
};

export function ReferenceImageGrid({
  images,
  selectedIds,
  onToggle,
  loading,
  searchQuery,
  onSearchChange,
  searchPlaceholder = "Search…",
  emptyMessage,
}: Props) {
  const filtered = images.filter((img) =>
    img.filename.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex flex-1 flex-col gap-3 overflow-hidden">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" strokeWidth={1.5} />
        <Input
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={searchPlaceholder}
          className="pl-8 text-sm"
        />
      </div>

      <div className="flex-1 overflow-y-auto pr-1">
        {loading ? (
          <div className="grid grid-cols-3 gap-3">
            {Array.from({ length: 9 }).map((_, i) => (
              <div
                key={i}
                className="h-48 animate-pulse rounded-xl bg-muted"
              />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex h-48 items-center justify-center">
            <p className="text-sm text-muted-foreground">{emptyMessage}</p>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            {filtered.map((img) => (
              <ReferenceImageCard
                key={img.id}
                imageUrl={img.imageUrl}
                filename={img.filename}
                subtitle={img.subtitle}
                selected={selectedIds.has(img.id)}
                onToggle={() => onToggle(img.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
