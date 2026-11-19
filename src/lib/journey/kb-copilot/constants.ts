import { SCRIPT_QUICK_MODEL } from "@/lib/scripts/copilot/constants";

/** The model that drives the brand KB chat: the same quick model the script copilot's short steps use. */
export const KB_COPILOT_MODEL = SCRIPT_QUICK_MODEL;

/** The longest message a person can send in one turn. */
export const KB_TURN_MAX_CHARS = 4000;
/** The most files one message can carry. */
export const KB_TURN_MAX_ATTACHMENTS = 10;
/** How many earlier messages the model is given. */
export const KB_CONVERSATION_WINDOW = 12;

/** Reply choices the model may offer under its message. */
export const KB_REPLY_CHOICES_MAX = 4;
export const KB_REPLY_CHOICE_MAX_CHARS = 80;

/** What a failed turn says, stored in the thread so the person's message is not left unanswered. */
export const KB_TURN_FAILED_REPLY = "Something went wrong on my side. Nothing was changed. Try again.";
/** What a failed turn says when a tool had already saved something before the failure. */
export const KB_TURN_FAILED_AFTER_SAVE_REPLY = "Something went wrong on my side after I saved what you gave me. Check the page on the right, then try again.";

/** How many questions the review walk asks before it offers to stop (brand KB spec §2.3). */
export const REVIEW_QUESTIONS_FIRST = 5;
/** The most of a field's value a question repeats back. */
export const QUESTION_VALUE_MAX_CHARS = 280;
/** The most of a field's value the model is shown in its list of fields. */
export const PROMPT_VALUE_MAX_CHARS = 300;
/** How long a turn's trace is kept (turn traces spec §3.3, D509). */
export const TRACE_KEEP_DAYS = 30;
/** The most lines the Turns list shows. */
export const TRACE_LIST_LIMIT = 50;
/** The most of the person's message a Turns line keeps; the trace itself keeps all of it. */
export const TRACE_SENT_TEXT_MAX_CHARS = 200;
