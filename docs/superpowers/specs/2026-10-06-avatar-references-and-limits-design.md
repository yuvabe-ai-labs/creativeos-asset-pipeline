# Avatar references and reference limits — design

**Status:** design approved 2026-10-06 · **ADR:** D308
**Builds on:** D299 (the avatar as a virtual input), BUG-010 (references stored by id), D97 (the
server rejects, it never corrects), D290 (which faces Seedance takes)

## 1. What this is

Three changes to how images reach video and image models:

1. The avatar sends its **profile sheet** as well as its front portrait.
2. When a shot has **more references than the video model takes**, the choice is made in the open:
   a fixed priority fills the slots, Video Gen shows what is left out and why, and the server sends
   exactly that list. Today the route keeps the first N and silently drops the rest — the avatar,
   added last, is the first to go, and a prompt citing a dropped image points at nothing.
3. In Video Gen, clicking an image's **current role turns it off**.

### 1.1 Decisions taken in review (2026-10-06)

| Question | Decision |
|---|---|
| The sheet on video models | Front + sheet on Gemini Omni, Kling and Veo; **front only on Seedance** until the experiment (§6) says otherwise |
| Over the limit | Priority fills the slots, Video Gen shows what is left out with a reason, the operator can change it, the server sends exactly that and refuses rather than cuts |
| Priority | 1) the avatar's front, 2) images the prompt cites, 3) the avatar's sheet, 4) everything else in canvas order |
| Clicking a role again | Turns it off, and the off state is kept so defaults don't re-fill it |
| Seedance's 30-day trust window | Later (not in this work) |

## 2. The avatar's images

Where the avatar joins a prompt node's inputs (`getPromptUpstream`, `withStillPresenter`), it adds
up to two virtual image rows:

| Row | Id | Writer text |
|---|---|---|
| Front | the Avatar node's id (unchanged) | "{name}, the person on camera in this shot. Take only their face, hair, build and clothing from this image…" (unchanged) |
| Profile sheet | \`{avatarNodeId}:sheet\` | "{name}'s profile sheet: front, side and back views of the same person, for their build and outfit. Identity only: never its plain background, lighting or layout." |

The sheet row exists only when the avatar has a sheet that is not stale. Both rows are virtual: the
id is never a canvas node, so nothing can connect to or delete it. The browser's mention list
(\`useMentionUpstream\`) and reference list add the same rows, in the same order (front, then sheet,
both after the wired inputs), so numbering agrees with the server.

- **Stills** (Image Gen): both images go, within the model's limit (10–16).
- **Seedance**: the sheet is never sent; Video Gen shows it left out with "Seedance can't use the
  profile sheet". Changed by §6's result only.

## 3. Choosing what is sent

One pure function decides, used by Video Gen and by the video route alike:

\`\`\`ts
selectReferences({
  images,          // ordered as the prompt numbers them: wired inputs, then avatar front, then sheet
  roles,           // the node's stored roles: start_frame | end_frame | reference | off
  cap,             // the model's maxReferenceImages
  citedIds,        // images the prompt cites (planCitedRefIds / citedRefIds)
  avatarFrontId, avatarSheetId,
  unusable,        // id → reason the model can't take it (e.g. the sheet on Seedance)
}) → { sent: string[]; leftOut: { id: string; reason: string }[] }
\`\`\`

1. Images with role \`start_frame\` / \`end_frame\` keep it (frames are not references).
2. Images marked \`off\`, and images in \`unusable\`, are never sent; each gets its reason.
3. Images explicitly marked \`reference\` are sent, in order, up to the cap.
4. Unassigned images fill the remaining slots in priority order: avatar front, cited images, avatar
   sheet, the rest in canvas order.
5. Whatever does not fit is left out with "No room: {model} takes {cap}".

**Video Gen** shows every image with its state: Start, End, Ref, or left out (dimmed, the reason
under it). A left-out image's Ref is enabled when a slot is free; when all slots are taken it stays
disabled with "Max {cap} references", as today.

**The server** runs the same function on the same inputs. It sends \`sent\`, in that order, and
\`splice\` is gone. If the stored roles mark more references than the cap (a stale client, a model
switch), it refuses with "{model} takes {cap} references; {n} are selected. Turn some off in Video
Gen." (D97).

**Prompt numbering.** \`@Image N\` / \`<IMAGE_REF_N>\` in the request are numbered over \`sent\`, not
over every connected image (renderRefs / renderPlan get \`sent\` as their order). A cited image that
is left out is written as its name, and Video Gen says "The prompt names {label}, but it isn't sent".
Because cited images come second in priority, this happens only by an operator's choice.

## 4. Roles

\`ImageRole\` gains \`off\`. Clicking a role chip that is already active sets \`off\`; clicking any chip
on an \`off\` image sets that role (subject to the existing limits). \`off\` is stored like the other
roles, so the default fill never re-assigns it. Every reader of \`imageRoles\` treats \`off\` as "not
an input".

## 5. Failures and edges

| Case | Behaviour |
|---|---|
| The model takes no references (some Kling and Veo modes) | References are unsupported, as today; the avatar's images show as left out with that reason |
| A frame role on the avatar's sheet | Allowed only where frames are allowed; the sheet is a 16:9 image, so as a first frame it is unusual — no special rule |
| The avatar is not in the shot | No avatar rows, as today |
| Old nodes with no stored roles | The default fill (§3 step 4) decides; no migration |

## 6. The Seedance experiment

Seedance 2.5 refuses real human faces in references, except untouched outputs a ByteDance model
made on this account in the past 30 days. Four cases decide the Seedance rule for the sheet: front
only (control), the Nano Banana 2 sheet, a Seedream sheet made from the Seedream front, and front +
Seedream sheet. The first run (2026-10-05/06) was refused for an overdue BytePlus balance before
any check ran. When it runs: if the Seedream sheet passes, the rule becomes "sheet allowed on
Seedance when made with Seedream 5.0 Lite and untouched" and the sheet step defaults to Seedream for
Seedream avatars; otherwise Seedance stays front only.

## 7. What changes, where

| Where | Change |
|---|---|
| \`src/lib/avatars/presenter.ts\`, \`presenter-server.ts\` | The sheet row; rows returned as a list |
| \`src/hooks/use-mention-upstream.ts\` | The sheet in the browser's list |
| \`src/lib/video-gen/select-references.ts\` (new) | \`selectReferences\` |
| \`src/app/api/nodes/[id]/video-generate/route.ts\` | Sends \`sent\`; refuses over the cap; numbers the prompt over \`sent\` |
| \`src/lib/video-gen/resolve-prompt.ts\`, \`multishot-plan.ts\` | Render over a given order |
| \`src/lib/video-gen/assign-image-roles.ts\`, \`constraints.ts\`, \`video-gen-focus-view.tsx\` | \`off\`; toggling; left-out state and reasons |

## 8. Testing

- **Pure:** \`selectReferences\` (each priority step, \`off\`, unusable, the cap, operator choices
  beating priority); the avatar rows with and without a sheet; prompt numbering over \`sent\`.
- **Route:** sends exactly \`sent\`; refuses over the cap; Seedance never gets the sheet.
- **Browser:** the toggle and the left-out display, by hand.

## 9. As built (2026-10-06)

Built as designed, with these additions:

- **Frames that exclude references.** `selectReferences` also takes `framesExcludeReferences`
  (from `areFramesAndRefsExclusive`): on a model like Veo, a start or end frame means no
  references, each left out with "{model} can't use references with a start or end frame".
- **Defaults are no longer saved as references.** Video Gen used to save "reference" on every
  unassigned image, uncapped, which put nodes over the model's cap. On models that take references it
  now saves nothing and lets the shared rule place them; on models that take none it still saves the
  start-frame default.
- **Saved references over the cap** (a node from before, or a model switch) disable Generate with the
  route's own message, so the refusal is seen before the click.
- **The prompt is re-numbered only when something is left out.** With every image sent, the request
  is byte-identical to before.
- **`upstream-images`** returns the prompt's cited image ids and the avatar's front and sheet ids,
  so the screen runs the same selection as the route.
- **Not verified in a browser**; components checked with `tsc` and eslint.
