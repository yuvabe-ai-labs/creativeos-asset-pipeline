import Link from "next/link";

type Props = {
  kbStatus: "pending" | "in_review" | "ready";
  clientSlug: string;
};

export function KBStatusBanner({ kbStatus, clientSlug }: Props) {
  if (kbStatus === "ready") return null;

  const isPending = kbStatus === "pending";

  return (
    <div
      className={`mb-6 flex items-start gap-3 rounded-lg border px-4 py-3 text-sm ${
        isPending
          ? "border-amber-200 bg-amber-50 text-amber-800"
          : "border-blue-200 bg-blue-50 text-blue-800"
      }`}
    >
      <span className="mt-0.5 shrink-0 text-base leading-none">
        {isPending ? "⚠" : "ℹ"}
      </span>
      <div className="flex-1">
        <p className="font-medium">
          {isPending
            ? "Your Brand KB isn't set up yet."
            : "Your Brand KB needs review."}
        </p>
        <p className="mt-0.5 text-xs opacity-80">
          {isPending
            ? "Set it up for best results when generating content."
            : "Approve all fields to activate brand context across your canvases."}
        </p>
      </div>
      <Link
        href={`/clients/${clientSlug}/kb`}
        className={`shrink-0 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
          isPending
            ? "bg-amber-700 text-white hover:bg-amber-800"
            : "bg-blue-700 text-white hover:bg-blue-800"
        }`}
      >
        {isPending ? "Set up KB" : "Review KB"}
      </Link>
    </div>
  );
}
