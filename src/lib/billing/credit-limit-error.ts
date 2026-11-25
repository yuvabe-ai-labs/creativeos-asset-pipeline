import { CreditLimitError } from "@/lib/db/credit-transactions";
import type { CreditRefusal } from "./grants";
import { refusalToast } from "./refusal-copy";

// A refused run as an error whose message is safe to show anyone: the members' wording for its
// reason (D582). The browser swaps in the owners' wording when the viewer owns the agency. Routes
// answer 402 for any CreditLimitError, as before.
export function creditLimitError(reason: CreditRefusal): CreditLimitError {
  return new CreditLimitError(refusalToast(reason, false));
}
