# API route patterns

All helpers live in `src/lib/api/route-helpers.ts`.

## File location and naming

Routes live at `src/app/api/<resource>/[id]/<action>/route.ts`. Segment names use lowercase kebab-case (`re-extract`, not `reExtract`).

## HTTP method conventions

| Method   | When to use |
|----------|-------------|
| `GET`    | Read-only fetch. No side effects. |
| `POST`   | Create a resource, or trigger an action (AI run, status change). |
| `PATCH`  | Partial update to an existing resource. |
| `DELETE` | Remove a resource. Pass the resource ID as a query param (`?docId=…`). |

Never use `PUT`. Use `PATCH` for all updates.

## Response helpers

Never write `NextResponse.json(...)` directly. Use:

```ts
import { apiError, apiOk } from "@/lib/api/route-helpers";

return apiError("Human-readable message.", statusCode);  // { error: string }
return apiOk({ fieldName: value });                      // 200
return apiOk({ fieldName: value }, 201);                 // resource creation
```

**Response shape conventions:**
- Errors: always `{ error: string }` with an appropriate HTTP status code.
- Creation: the created resource at 201 — e.g. `{ document: doc }`.
- Mutations with no meaningful return: `{ ok: true }`.
- Reads: a flat named-field object matching what the caller needs.

## Client-scoped routes — `withClient`

Any route under `src/app/api/clients/[id]/` must use `withClient`:

```ts
import { withClient } from "@/lib/api/route-helpers";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withClient(params, async (clientId, client) => {
    // clientId: string — the UUID
    // client: ClientRow — full row (slug, name, etc.)
  });
}
```

**Exception:** routes scoped to a `versionId` (e.g. `field`, `re-analyze`) skip `withClient`. Add `await params; // clientId not needed` with a comment explaining why.

## AI and multi-step routes — `withTryCatch`

Wrap any handler that calls OpenAI or performs multi-step async work:

```ts
import { withTryCatch } from "@/lib/api/route-helpers";

return withTryCatch("Extraction failed", async () => {
  // … openai calls, DB writes …
});
```

`withClient` and `withTryCatch` compose naturally:

```ts
return withClient(params, async (clientId) => {
  return withTryCatch("Re-extraction failed", async () => {
    // …
  });
});
```

**Exception:** `nodes/[id]/parse` keeps its own try/catch because failure must also write a version log entry before returning the error.

## File upload pattern

```ts
import {
  parseFormFile, validateFileExtension, validateFileSize, isApiError,
} from "@/lib/api/route-helpers";
import { DOC_EXTENSIONS } from "@/lib/kb/constants";          // or IMG_EXTENSIONS
import { KB_DOC_SIZE_LIMIT_BYTES, getKBTotalBytes } from "@/lib/db/kb";

const fileResult = await parseFormFile(req);
if (isApiError(fileResult)) return fileResult;               // bad form → 400
const { file } = fileResult;

const extResult = validateFileExtension(file, DOC_EXTENSIONS);
if (isApiError(extResult)) return extResult;                 // bad ext → 400
const { ext } = extResult;

const existing = await getKBTotalBytes(clientId);
const sizeErr = validateFileSize(file.size, existing, KB_DOC_SIZE_LIMIT_BYTES, "20 MB");
if (sizeErr) return sizeErr;                                 // over limit → 400
```

Always import extension sets and size limits from their canonical sources — never redeclare inline:
- `DOC_EXTENSIONS`, `IMG_EXTENSIONS` — `@/lib/kb/constants`
- `KB_DOC_SIZE_LIMIT_BYTES`, `KB_IMG_SIZE_LIMIT_BYTES` — `@/lib/db/kb`

## What never to do

- `NextResponse.json({ error: … }, { status: … })` — use `apiError`.
- `e instanceof Error ? e.message : "…"` inline — use `withTryCatch`.
- Copy-paste the `getClientById` + 404 block — use `withClient`.
- Declare `ALLOWED_EXTENSIONS` or size-limit constants in a route file — import them.
- `throw` inside a route handler body — always `return apiError(…)`.
