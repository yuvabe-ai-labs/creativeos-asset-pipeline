// Catalogue keys no server check uses yet, with the plan that adds the check. Remove an entry
// when its check ships; with-action-coverage.test.ts's "every key is checked" test then holds
// the key to it.
export const NOT_YET_CHECKED: Record<string, string> = {
  "team.view": "Team page, plan 3",
  "team.edit": "Team page, plan 3",
  "team.delete": "Team page, plan 3",
  "credits.view": "/api/me credit figures, plan 2",
  "downloads.view": "download buttons, plan 2 (files sit in public buckets; UI-only until they go private)",
  "downloads.share": "download buttons, plan 2 (files sit in public buckets; UI-only until they go private)",
};
