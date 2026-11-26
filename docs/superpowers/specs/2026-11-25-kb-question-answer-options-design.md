# Likely answers on empty-field questions (short design, D533)

**Approved by Cyril 2026-11-25.** Refines the brand KB copilot spec §6 ("the copilot offers no value
of its own as a choice") for one case only.

## Why

During the review walk, a field the build found nothing for (for example Audience & Casting · Age
Range) is asked as "I could not find this in the sources. What should it be?" with only "There is
none" and "Skip this one". The person has to type every answer. A few likely answers to tap make
the walk much quicker.

## What

- **Only questions about empty fields** get likely answers: up to 4, shown before "There is none"
  and "Skip this one". Questions about an inferred value are unchanged.
- The question says they are guesses: "…What should it be? Some likely answers are below, or type
  your own."
- **Tapping one saves it as the person's answer** (the same as typing it), carried out by code, not
  by the model (D519). For a list field, "Warm, playful, direct" is saved as three items.
- The answers are kept on the question, so a reload shows the same ones.
- **The question is never held up by them:** if the call fails or takes over 5 seconds, the question
  appears with only its two usual buttons.

## Approaches

1. **Chosen: one quick call per empty-field question, when it is asked.** The quick model reads the
   field and the brand KB as it stands, including answers given so far. Costs a fraction of a cent
   and about a second per question.
2. Rejected: work out answers for every empty field at the end of the build. Stale once the person
   starts answering, and it makes the build heavier.
3. Rejected: let the chat model offer them with its own reply choices. Questions are written by
   code after the turn, and the first one is written when a build lands, with no model at all.

## Goals, non-goals, anti-goals

- Goal: answering an empty field is usually one tap.
- Non-goal: alternatives for inferred values; options on any other button.
- Anti-goal: a guess that reads as something the sources said. The wording says they are likely
  answers, and a tap is the person's choice.

## Left to the builder (my calls)

- The model is the KB copilot's quick model (`KB_COPILOT_MODEL`, OpenAI), not Gemini.
- Each answer is at most 80 characters (the reply-choice limit); duplicates of "There is none" or
  "Skip this one" are dropped.
- The brand KB text is data in the prompt, never instructions.
