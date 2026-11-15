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
