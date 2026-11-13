// src/lib/permissions/legacy-need.ts
// Task 5 → Task 6 of plan 3 only: routes keep naming the old area keys for one commit while the
// checker is already the six-permission one. Task 6 renames every need and deletes this file.
import { splitKey, type PermissionKey } from "./catalogue";
import { isAction, type Action } from "./model";

export type Need = Action | PermissionKey;

const AGENCY_KEYS: Partial<Record<PermissionKey, Action>> = {
  "clients.edit": "manage_clients",
  "clients.delete": "manage_clients",
  "credits.view": "view_credits",
  "team.view": "manage_team",
  "team.edit": "manage_team",
  "team.delete": "manage_team",
};

export function actionForNeed(need: Need): Action {
  if (isAction(need)) return need;
  return AGENCY_KEYS[need] ?? splitKey(need).level;
}
