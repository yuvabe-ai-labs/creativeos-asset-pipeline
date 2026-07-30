"use client";

type Props = {
  message: string;
};

export function GalleryEmptyState({ message }: Props) {
  return (
    <div className="flex h-48 items-center justify-center px-6 text-center">
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}
