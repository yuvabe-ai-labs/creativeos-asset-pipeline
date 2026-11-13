import type { Action } from "./model";

// Actions no server check uses yet, with the plan that adds the check. Remove an entry when its
// check ships; with-action-coverage.test.ts's "every action is checked" test then holds it to it.
export const NOT_YET_CHECKED: Partial<Record<Action, string>> = {
  manage_team: "Team page and client Members, plan 4",
  invite: "Client Members invite, plan 4",
};
