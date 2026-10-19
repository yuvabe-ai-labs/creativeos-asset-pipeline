# Delete a script, for good, unless a canvas or the client depends on it

**19 October 2026 · product spec (the *what*) · supersedes D360 (delete for unwritten scripts only,
as an archive) · builds on script copilot specs 1–4 and the script → canvas spec (D372)**
Branch: `delete-script` (from `staging` at `fcb943d4`). ADRs: D384 onward. D380–D383 are taken by
the unmerged `storyboard-to-canvas` branch, so this branch starts at D384 to avoid a clash.

---

## 1. Problem

In a client's Scripts library, only a script the copilot has not written yet can be deleted (D360),
and even then it is only hidden. Every other card (a draft, a script being visualised, one in
review, an approved one) has no way out. Scripts made while trying things, or abandoned halfway
through the storyboard, stay in the library for good, with their storyboard panels behind them.

The user wants to delete a script **and its storyboard**, permanently, from the Scripts page. They
don't want it to break anything that still depends on that script.

## 2. The flow

1. In a client's Scripts library, **every script card shows a delete (trash) icon**, at every
   stage: unwritten, drafted, visualise, in review, approved.
2. Clicking it does one of two things:
   - **The script can't be deleted:** a message says why, and nothing is removed. There are two
     reasons (§3), and the message names the one that applies:
     - "a canvas was started from this script", or
     - "this script has been shared with the client".
   - **The script can be deleted:** a confirm dialog says what goes with it (the brief, the copilot
     conversation, the storyboard) and that it can't be undone. Confirming erases the script and it
     leaves the library.
3. That's the whole flow. There is no undo, no trash bin and no archive view.

## 3. Rules

**When delete is blocked**
- **A canvas was started from the script.** This is the recorded link a canvas gets when it's
  started from a script (D372). A script that was only *dragged* onto an existing canvas from the
  gallery doesn't count. The user chose this narrower rule on purpose because it's a single cheap
  check. The dragged copies stay safe anyway; see "What is kept".
- **The script has ever been shared with the client.** A client review link never expires and can't
  be turned off, so this means "has a client link at all". The link is made on the first share
  (not on moving to In review), so in practice every approved script, and any script shared then
  reopened, can never be deleted. The user accepted that outcome. *(My call:)* a script moved to
  In review but never shared has no link, and can be deleted. A link left over from a failed share
  still counts as a link: the client could hold it.
- *(My call, found after the user's decision:)* **a panel is still being drawn.** Drawing a panel
  pays the provider and then records the charge against the generation. If the script were erased
  mid-draw, that record would have nothing to attach to, and the charge would quietly be refunded
  even though the provider was already paid. So delete is refused while a panel draw is under way:
  "a panel is still being drawn; try again when it finishes". A crashed draw never blocks delete for
  good: the hourly clean-up fails and refunds it, and then the delete goes through.
- **Which message, when more than one applies.** Today a canvas can be started only from an approved
  script, and approval happens only through the client link. So every script with a canvas has also
  been shared. *(My call:)* the canvas reason is checked first and its message wins, because it's
  what the user named. It stays as its own check, in case canvases from unapproved scripts are
  allowed later.
- The check runs **on the server at the moment of deletion**, against fresh data, not only from what
  the card showed when the page loaded. If a canvas is started or a share is made at the same moment
  as a delete, the result is never "script gone, but a canvas or client link was relying on it". The
  delete is either refused or it runs before that link exists.

**What is erased (permanently, no undo)**
- The script itself, its brief and its copilot conversation.
- Its whole storyboard: every panel take, the picks, and the generation records behind them.
- Its client-review records. Because of the rule above, a script that can be deleted never had a
  review, so in practice there are none.

**What is kept**
- **The panel image files in storage.** Canvas File nodes (from Fan out, and from dragging a panel
  out of the gallery) and Script nodes' frozen storyboards point straight at those files and have no
  copy of their own. Erasing the files would leave broken images on canvases, including canvases the
  script was only dragged onto. This matches the existing promise that panel takes are never deleted
  (spec 3 §6.6).
- **Credit history.** What was spent on the script's panels stays in the ledger; its link to the
  erased generation records goes blank, as it already does elsewhere.
- **Canvases.** Unchanged. Because of the rule above, no canvas started from the script can exist.
- **Avatars.** Avatars are the client's, not the script's, including draft avatars made from the
  script's cast in Visualise. They stay in the Avatars library. The user said storyboards go,
  "nothing else".

**Unwritten scripts change too.** Today they are hidden, not erased (D360). From now on they are
erased like every other script, so "delete" means one thing everywhere. *(My call:)* scripts that
D360 already hid stay as they are, hidden. They aren't purged, and the hidden filter stays in place.

**Who may delete.** *(My call:)* anyone who can open the client, the same as today's delete. No role
check.

## 4. Out of scope

- Turning off a client's review link (and so making a shared script deletable).
- Bulk delete, an archive view, undo, a trash bin.
- Deleting from anywhere but the Scripts library card: not from a script's own page, and not from
  the canvas gallery.
- Removing storyboard image files from storage, or cleaning up orphaned files later.
- Any change to canvases, Script nodes or File nodes.

## 5. Success

1. On a drafted or visualise-stage script that was never shared and has no canvas, delete → confirm
   removes it from the library. Reloading confirms it's gone, and its storyboard is gone with it.
2. On a script with a canvas started from it, clicking delete shows the canvas message, and the script
   and its storyboard are untouched.
3. On a script that has been shared and has no canvas (in review, or approved without a canvas),
   clicking delete shows the shared-with-client message, and the client's link still opens.
4. While one of its panels is being drawn, a script can't be deleted: it says why. Once the draw
   finishes, it deletes normally.
5. A canvas that already shows that script's panels (File nodes or a Script node's storyboard) still
   shows every image after the script is deleted.
6. An unwritten script deletes the same way, and is erased, not just hidden.
7. If a canvas or share link appears after the page loaded, the delete is refused, with the right
   message, instead of going through.

## 6. Calls made without the user (flag if wrong)

- **The icon stays clickable on blocked scripts** and the explanation appears on click. That's how
  I read "show the delete icon but show a message".
- **Delete lives only on the library card**, as it does today.
- **A panel still being drawn blocks delete** (§3). An earlier draft let the delete go ahead, but
  that would quietly refund a paid draw.
- **In review but never shared is deletable.** A leftover link from a failed share still blocks.
- **Canvas message wins** when both reasons apply.
- **Avatars are kept.** Scripts D360 already hid aren't purged. There's no role check.
- **The confirm dialog's wording** names what goes and says it can't be undone.
