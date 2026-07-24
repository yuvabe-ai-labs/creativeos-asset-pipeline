"use client";

import type { Ref } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";

type Props = {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  inputRef?: Ref<HTMLInputElement>;
};

export function GallerySearch({ value, onChange, placeholder = "Search…", inputRef }: Props) {
  return (
    <div className="relative flex-1">
      <Search
        className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
        strokeWidth={1.5}
      />
      <Input
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-9 pl-8 text-sm focus-visible:border-input focus-visible:ring-[0.5px]"
      />
    </div>
  );
}
