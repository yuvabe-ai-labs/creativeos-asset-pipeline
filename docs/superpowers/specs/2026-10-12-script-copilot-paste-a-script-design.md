# Script copilot · paste a script

**12 October 2026 · product spec (the *what*) · builds on spec 2 (Generate)**
Branch: `worktree-script-copilot-finish`. Parent: [spec 2](2026-10-08-script-copilot-2-generate-design.md),
whose copilot, script pane, proposals and open items this spec reuses.
ADRs: D367 onward (D366 was the first-draft skeleton, on this branch).
How the copilot works today: https://claude.ai/artifact/KfULcVne4H8ARk9JnMWLC5 (§08 sketches this feature).

---

## 1. Problem

The copilot can only write a script from a brief. Agencies already have scripts: outlines written
before CreativeOS (the Jackfruit365 reels), a client's own Word script, a Google Doc. Getting one of
those into the copilot today means retyping it field by field. The team wants to paste any script
into the chat and have the copilot turn it into its own format, word for word, so it can be edited,
visualised and sent for review like any other.

## 2. The rule

**If the pasted script has a piece of information, the copilot uses it exactly. If it doesn't, the
copilot makes a best guess so the script is complete, and asks about that guess in the chat.**

Everything below follows from this rule.

## 3. The flow

1. In a script's Generate workspace, the person pastes a script into the copilot's message box.
   The box shows the first few lines, fading out, not the whole script. They send it. The sent
   message in the chat is clipped the same way.
2. The copilot recognises that the message is a whole script. This works at any point in the
   brief: if the person was partway through the brief questions, the pasted script wins and the
   remaining questions are skipped.
3. Writing starts as it does for a first draft: the thinking pill shows writing verbs, the right
   pane shows the script's skeleton, then the script streams in.
4. The copilot's reply says what it imported (for example "Reel 07 · 9 shots · 50s"), what it kept
   in the notes because it had no place in the script, the reel-number note if the pasted number was
   taken (§5.3), and then asks about each guess it made (§4.3). The usual open-items line follows.
5. From here it is an ordinary Generate-stage script: editable in place, changeable through the
   chat, and Mark final takes it to Visualise.

**When the script already has a draft**, pasting a whole script does not change anything on its
own. The copilot answers with a card offering to replace the current draft with the pasted script.
Nothing changes until the person accepts. Rejecting keeps the current draft.
*Open question for the user: §8, Q1.*

## 4. Accuracy

### 4.1 Used exactly

Every word the paste contains goes into the script as written: the title; purpose; setting and
camera; each character's description; every shot's visual, voiceover and on-screen text; watch-outs;
disclaimers, with their labels ("D4, on the pack end card. …"); and the header details (format,
region, post date, theme, aspect, length, production). Only formatting is removed: table borders,
bold markers, stray line breaks. Spelling and wording are never changed, typos included.

Each row or scene of the paste becomes one shot. The number of shots always equals the number of
rows or scenes in the paste; nothing is split or merged.

Beats and timings are read from the paste when it has them: "HOOK 0-4s" is the beat HOOK and a
length of 4 seconds.

### 4.2 Nothing lost

Anything with no place in the script (a music cue, a props list, a director's note, a link) is kept
word for word in the script's notes, under "From the pasted script". The reply names what went there.

### 4.3 Guessed, then asked

Where the paste lacks something the script needs, the copilot fills it with its best guess and asks
about it in the chat:

- **No timings:** lengths estimated from the voiceover. *"There were no timings, so I estimated them
  from the VO (about 50 s). Keep them, or give me the real ones?"*
- **No beats:** shots labelled with beats, and the copilot asks whether the labels are right.
- **Nobody named on screen:** a "Narrator" lead, and the copilot asks who is on screen.
- **Avatars** (a pasted script never has them): the copilot asks who plays each character, with the
  client's avatars as chips, the same chips as "Who leads?" today. An avatar whose name or description
  clearly fits is offered first. No avatar is linked without the person choosing it.
- **Placeholders** such as `[real review, verbatim]` cannot be guessed. They stay as placeholders,
  the copilot asks for the real text, and they count as open items, as they do today.

Each guess stays an open item until the person answers it or edits that part themselves, so Mark
final names any guess nobody has looked at. The person's answers are ordinary chat messages, and the
copilot changes the script as it does today.

### 4.4 Checked

After the import, the app checks that every shot's voiceover and on-screen text appear in the pasted
text (ignoring spacing and quote style). Any shot that doesn't match is named in the reply and becomes
an open item, so the word-for-word promise is something the person can see, not only trust.

## 5. Edge cases

### 5.1 Length
A full client script must fit in one message. Today's limit (4,000 characters) cuts Reel 07 off
partway through its shot table. The limit for a pasted script is raised to at least 30,000
characters. Ordinary chat messages keep today's limit.

### 5.2 What counts as a whole script
Only a whole script is imported: something with a series of shots or scenes, usually with some
header or character detail. A message that pastes a few shots while a draft exists ("add these two
shots after the hook") is a normal chat edit. A long message that is a brief, notes or a review is
a normal message.

### 5.3 Reel number
The pasted reel number is kept, unless the client already has a script with that number. Then the
script takes the next free number and the reply says so ("Reel 07 is taken, so this is Reel 09").

### 5.4 When the import fails
If the copilot cannot read the paste as a script, nothing changes. The pasted message stays in the
chat and the reply says what went wrong and what to try (for example, paste the shot table too).

## 6. Out of scope

- Uploading a file (.docx, .pdf). This spec covers pasted text only.
- Importing into a canvas Script node. The canvas keeps its own parser.
- Several scripts in one paste.
- Translating a script, or rewriting a pasted script to the client's house rules on import. Later
  chat edits can do that when asked.
- Linking avatars automatically.

## 7. Success

1. Pasting the Reel 07 outline into a new script gives 9 shots whose visuals, voiceovers and
   on-screen text match the outline exactly, with beats and lengths from its Beat column (4, 5, 6, 6,
   8, 6, 5, 5, 5 seconds).
2. The header carries the outline's own text: UGC · REVIEW · OPTION, Pan-India, Thu 19 Nov, Diabetes Awareness Month, 9:16,
   45 to 55 sec and AI-generated; Rhea is the lead with her description; the four watch-outs and
   D1, D2 and D4 are there word for word.
3. The REVIEW shot keeps `[real review, verbatim]`; the reply asks for the real review, and it is an
   open item.
4. The reply asks who plays Rhea, with avatar chips.
5. A scene-by-scene script with no timings and no beats imports with estimated lengths and beat
   labels, and the reply asks about both.
6. A script with a music cue and a props list keeps both in the notes, and the reply names them.
7. Pasting while a draft exists shows the replace card; rejecting changes nothing, accepting
   replaces the draft.
8. A paste over 4,000 characters is not cut off. The composer and the sent message show a few lines.
9. Pasting "Reel 01" into a client that already has a Reel 01 gives the next free number, and the
   reply says so.
10. A pasted shot whose voiceover the import changed is named in the reply and listed as open.

## 8. Open questions for the user

**Q1. The replace card.** When a draft exists, should the copilot
(a) parse the paste first and then show the card, with a real summary ("9 shots · 50 s, replacing
13 shots · 62 s"), so accepting is instant, at the cost of one parse even if the person rejects; or
(b) show the card first and parse only after the person accepts, so nothing is wasted but the card
cannot say what the import contains?
*Recommendation: (a).*

**Assumptions to confirm** (written into §4–§6 above; say if any is wrong):

- A2. Each guess stays an open item until answered or edited (§4.3), so Mark final names it.
- A3. A few pasted shots while a draft exists are a chat edit, not an import (§5.2).
- A4. A pasted script is not rewritten to house rules on import (§6).
- A5. An imported script, like a copilot draft, is not used as an example for other scripts until it
  is past Generate.
