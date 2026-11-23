import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/** D547: why the catalog drops this row, and where each kind of problem is fixed. */
export function ModelProblems({ problems }: { problems: string[] }) {
  return (
    <Card className="px-2">
      <CardHeader>
        <CardTitle>This row fails its check</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <ul className="list-disc pl-5 text-sm">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
        <p className="text-sm text-muted-foreground">The app leaves this model out until it is fixed.</p>
        <p className="text-sm text-muted-foreground">
          Labels, order and status can still be changed here; settings, rules and limits are fixed by a migration.
        </p>
      </CardContent>
    </Card>
  );
}
