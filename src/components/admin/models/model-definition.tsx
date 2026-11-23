import type { ParamSpec } from "@/lib/image-gen/types";
import { Card } from "@/components/ui/card";
import type { ConstraintRule } from "@/lib/video-gen/types";

function flatten(value: unknown, prefix = ""): Array<[string, string]> {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    return Object.entries(value as Record<string, unknown>).flatMap(([k, v]) =>
      flatten(v, prefix ? `${prefix}.${k}` : k),
    );
  }
  return [[prefix, typeof value === "string" ? value : JSON.stringify(value)]];
}

function paramDetail(p: ParamSpec): string {
  const c = p.constraints;
  if (!c) return "";
  if (c.type === "select") return c.options.join(", ");
  if (c.type === "slider") return `${c.min} to ${c.max}${c.step ? `, step ${c.step}` : ""}`;
  if (c.type === "number" && (c.min !== undefined || c.max !== undefined)) return `${c.min ?? "…"} to ${c.max ?? "…"}`;
  if (c.type === "textarea" && c.maxLength) return `up to ${c.maxLength} characters`;
  return "";
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-eyebrow mb-2 text-[0.7rem] text-muted-foreground/80">{title}</h3>
      <div className="divide-y rounded-lg border">{children}</div>
    </div>
  );
}

function Empty({ children }: { children: string }) {
  return <p className="px-4 py-3 text-sm text-muted-foreground">{children}</p>;
}

export function ModelDefinition({
  params,
  rules,
  capabilities,
}: {
  params: ParamSpec[];
  rules: ConstraintRule[];
  capabilities: Record<string, unknown>;
}) {
  const limits = flatten(capabilities).filter(([k]) => k !== "");
  return (
    <Card className="px-6">
      <div>
        <h2 className="font-display text-base font-semibold">Definition</h2>
        <p className="mt-1 text-sm text-muted-foreground">Changed by a migration. Editing here comes later.</p>
      </div>
      <div className="flex flex-col gap-6">
        <Section title="Settings">
          {params.length === 0 && <Empty>No settings.</Empty>}
          {params.map((p) => (
            <div key={p.name} className="flex items-baseline gap-3 px-4 py-2.5 text-sm">
              <span className="min-w-0 flex-[2]">
                <span className="font-medium">{p.label}</span>{" "}
                <span className="font-mono text-xs text-muted-foreground">{p.name}</span>
              </span>
              <span className="flex-1 text-muted-foreground">
                {p.constraints?.type ?? p.component}
                {!p.visible && <span className="ml-2 text-xs">hidden</span>}
              </span>
              <span className="flex-[2] text-muted-foreground">{paramDetail(p)}</span>
            </div>
          ))}
        </Section>
        <Section title="Rules">
          {rules.length === 0 && <Empty>No rules.</Empty>}
          {rules.map((r) => (
            <div key={r.id} className="flex items-baseline gap-3 px-4 py-2.5 text-sm">
              <span className="flex-[3]">{r.reason}</span>
              <span className="flex-1 font-mono text-xs text-muted-foreground">{r.id}</span>
            </div>
          ))}
        </Section>
        <Section title="Limits">
          {limits.length === 0 && <Empty>No limits.</Empty>}
          {limits.map(([k, v]) => (
            <div key={k} className="flex items-baseline gap-3 px-4 py-2.5 text-sm">
              <span className="flex-[2] font-mono text-xs">{k}</span>
              <span className="flex-[3] text-muted-foreground">{v}</span>
            </div>
          ))}
        </Section>
      </div>
    </Card>
  );
}
