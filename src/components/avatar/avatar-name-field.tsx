"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Props = {
  value: string;
  onChange: (name: string) => void;
  label?: string;
  placeholder?: string;
};

export function AvatarNameField({ value, onChange, label = "Character name", placeholder = "e.g. Priya" }: Props) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="avatar-name" className="text-sm font-medium">
        {label}
      </Label>
      <Input
        id="avatar-name"
        value={value}
        placeholder={placeholder}
        maxLength={60}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
