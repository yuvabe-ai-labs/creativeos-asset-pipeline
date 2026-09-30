"use client";

import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

// Random-character step 2: describe the character to generate.
export function AvatarDescribeStep({ value, onChange }: { value: string; onChange: (text: string) => void }) {
  return (
    <section className="flex flex-col gap-3">
      <Label htmlFor="avatar-description" className="text-sm font-medium">
        2. Describe your avatar
      </Label>
      <Textarea
        id="avatar-description"
        rows={4}
        value={value}
        maxLength={500}
        placeholder="e.g. Young Indian male, late 20s, professional look, short hair, light blue shirt"
        onChange={(e) => onChange(e.target.value)}
      />
    </section>
  );
}
