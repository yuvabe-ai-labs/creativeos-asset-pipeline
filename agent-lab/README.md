# Minimal Agent — learning sandbox 🧪

A throwaway space to learn the **agent primitives by building the loop by hand**.

- **Isolated in a git worktree** at `.claude/worktrees/minimal-agent` on branch
  `worktree-minimal-agent` — your app checkout on `main` is untouched.
- SDK: **OpenAI** (gentlest learning curve). No new dependencies — resolves the `openai`
  package from the main checkout's `node_modules`; uses the `OPENAI_API_KEY` copied into this
  worktree's `.env.local`.

## How it works here

You **type the code** in each exercise file (each ships as a stub with a spec + hints + a
`TODO`). Then we **run it together**, read the output, and the primitive gets explained.

## Run an exercise

```bash
npx tsx --env-file=.env.local agent-lab/00-plain-call.ts
```

## The ladder (one primitive per step)

| File | You build | Primitive |
|---|---|---|
| `00-plain-call.ts` | one chat call, print the reply | messages & roles (the substrate) |
| `01-declare-tool.ts` | define `add(a,b)`; print the model's tool *request* (don't run it) | tool schema + how a call surfaces |
| `02-one-roundtrip.ts` | run the tool, feed the result back, get the grounded answer | execute → return cycle |
| `03-the-loop.ts` | a `while` loop + 2 tools; ask "(3+4)×5" | **the loop = the agent** |
| `04-human-in-the-loop.ts` | gate a `write_note` tool behind a y/n prompt | guardrails / human-in-the-loop |

Start with `00-plain-call.ts`.
