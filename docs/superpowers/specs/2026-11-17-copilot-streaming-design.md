# The copilot shows its work as it happens

**Date:** 2026-11-17
**Parent spec:** [2026-11-12-copilot-journey-design.md](2026-11-12-copilot-journey-design.md)
**Status:** draft for Cyril's review. The principle in section 2 was decided by Cyril on 2026-11-17 ("I want streaming to be a first class principle", "yes, every surface"). Lines marked *(my call)* are calls I made and can be overruled. Lines marked **Question** are yours to decide; nothing is built on a guess about them.

## 1. The problem

A person types the brand's website into the brand KB chat. Their message appears with a line that says "Working on it…", and then nothing else changes for about ten seconds. Then the reply and the filled-in form appear together.

Measured on 2026-11-17, the website was already stored about halfway through that wait. The person could not see it, because the chat sends one request and shows nothing until the whole answer comes back, and the form is only redrawn after that. The copilot was working the whole time and looked idle.

The same shape is waiting in every stage still to be built (market research, scripts, storyboards). Each is a copilot that thinks, acts and replies. If each shows nothing until it has finished, each will feel slow in the same way, however fast the work is.

The script copilot does not have this problem when it writes a first draft: the draft appears piece by piece while it is being written (the header, the cast, each finished shot). That is the experience the rest should have.

## 2. The principle

**Anything a copilot does that a person waits on is shown as it happens, not when it is finished.**

It applies to every copilot surface: the brand KB chat, market research, scripts, and the stages still to come. A new copilot surface is built this way from the start.

Three things make up "as it happens":

1. **Its words appear as they are written.** The reply grows in the thread; it does not arrive whole.
2. **Each thing it does shows at the moment it is done.** When the copilot saves a website, the form shows the website then, not at the end of the turn.
3. **The person can always see what it is doing now.** A short line says so while it works ("Saving the website…", "Starting the build…"), and goes away when that step is done.

Work that runs for minutes in the background (a KB build, collecting images) is not part of this. It already reports its progress through the live status lines, and it keeps doing so.

## 3. What a person sees in the brand KB chat

This is the first surface converted. The others follow the same picture when they are built or next changed.

**Sending a message.** The person's message appears at once with the "Working on it…" line, as it does today.

**While it works.** The line stays general while the copilot is thinking. When it starts a step that changes the page (saving a website, saving a handle, answering a field of the KB, starting a build), the line names that step, and when the step finishes the page beside the chat shows it at that moment. These steps are quick, so a named line may only show briefly. *(my call: only steps that change the page are named.)*

**The reply.** The copilot's words appear as they are written, in the place the finished reply will sit. If it begins to write and then turns to a step instead, those first words are cleared and the step's line shows: only the words of its final reply stay. *(my call)* Reply buttons appear when the reply is complete, not before, so nobody presses one that is about to change. *(my call)*

**A question that follows.** In the review, the next question is still asked by code after the reply (D499). It appears when the reply is complete.

**When it is done.** The thread looks exactly as it would after a reload: what was shown while it worked and what is stored are the same messages in the same order.

**When something goes wrong part-way.** Whatever was saved stays saved and stays shown. The thread says what happened in the copilot's own line, as it does today, and the person's message is never lost. Words that had begun to appear are replaced by that line, not left half-written. *(my call)*

**A teammate looking at the same client.** They do not see the words appear. They see the finished messages when their own view next checks the thread, as today. *(my call: showing one person's turn live to another is a different feature.)*

## 4. What must stay true

- Everything in the brand KB spec still holds: the rules the tools enforce, what the copilot may and may not save, the review walk, the gate.
- A turn stores the same messages it stores today. Showing work early changes when things are seen, never what is saved.
- A person on a slow or broken connection is no worse off than today: if the work cannot be shown as it happens, the finished result still arrives. A turn that has started finishes and stores its reply even if the person's connection drops or they close the page.
- The page beside the chat never shows a value that was not stored.
- Text a person has typed into the form and not saved is not replaced by a save to a different field.

## 5. How we will know it worked

- While the copilot is doing a step that changes the page, the line names that step.
- A saved website is in the form before the copilot's reply has finished.
- The first words of a reply are on screen before the reply is complete.
- A reload after a turn shows the same thread that was on screen. A reload during a turn is Question 3.
- All of section 4 holds.

## 6. Not in this piece

- Stopping a reply part-way. Decided: no stop button.
- Showing one person's turn live to their teammates.
- Changing how background work reports progress.
- Speeding up the work itself. This piece is about showing it.
- Converting the script copilot's turns that do not stream today. It streams its first draft already; the rest of it moves to this principle when it is next substantially changed, as the data-fetching rule does for old hooks. *(my call)*

## 7. Questions

**Question 3 is the one the plan cannot start without.**

**Answered by Cyril on 2026-11-17. No stop button.** A reply cannot be stopped part-way.

**Answered by Cyril on 2026-11-17. Plain saves stay as D501 made them.** After the copilot saves a website or a handle the reply is the fixed sentence written by code. With this piece the form fills at the moment of the save and the reply follows almost at once.

**Question 3. Reloading the page in the middle of a turn.** Today, and for a teammate, the reloaded page shows the person's message and an open message box, with nothing to say a reply is on its way; the reply appears when the page next checks the thread, which can be up to 20 seconds later. Two choices:

- **(a) Leave that as it is.** A reload mid-turn looks like the teammate's view. Nothing new is stored.
- **(b) The reloaded page shows the copilot is still working and does not take a second message until the reply lands.** This needs the app to record that a turn is running, and to clear that record safely if a turn dies.

My recommendation is (a) for this piece: a reload inside a turn of a few seconds is rare, the reply is never lost either way, and (b) can be added later for every surface at once.
