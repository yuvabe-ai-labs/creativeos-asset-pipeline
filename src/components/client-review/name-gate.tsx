"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { REVIEWER_NAME_MAX } from "@/lib/client-review/constants";

export function NameGate({ title, onSubmit }: { title: string; onSubmit: (name: string) => void }) {
  const [name, setName] = useState("");
  const ready = name.trim().length > 0;

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (ready) onSubmit(name);
  }

  return (
    <form onSubmit={handleSubmit} className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 px-6">
      <div className="flex flex-col gap-2">
        <p className="text-eyebrow text-muted-foreground">Yuvabe Studios</p>
        <h1 className="font-display text-3xl font-semibold tracking-tight">{title || "Your cut"}</h1>
        <p className="text-sm text-muted-foreground">Watch the cut and leave comments for the team.</p>
      </div>
      <label className="flex flex-col gap-2">
        <span className="text-sm font-medium">Your name</span>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={REVIEWER_NAME_MAX}
          autoComplete="name"
          autoFocus
          className="h-11 text-base"
        />
      </label>
      <Button type="submit" size="lg" disabled={!ready} className="h-11">
        Start review
      </Button>
    </form>
  );
}
