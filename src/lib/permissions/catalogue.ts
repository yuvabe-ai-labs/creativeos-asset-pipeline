// D495: the areas and levels a permission can name. A tick only means something where the
// server checks it, so this list lives in code; presets, per-person ticks and client lists
// live in the database. Adding an area here ships with a migration that adds its keys to the
// presets that should get them.

export const LEVELS = ["view", "edit", "generate", "approve", "share", "delete"] as const;
export type Level = (typeof LEVELS)[number];

export const GROUPS = [
  { key: "brand", label: "Brand setup" },
  { key: "story", label: "Story" },
  { key: "production", label: "Production" },
  { key: "review", label: "Review and delivery" },
  { key: "agency", label: "Running the agency" },
] as const;
export type GroupKey = (typeof GROUPS)[number]["key"];

type AreaDef = {
  readonly key: string;
  readonly group: GroupKey;
  readonly label: string;
  readonly covers: string;
  readonly levels: readonly Level[];
  /** false = agency-wide (not tied to one client). */
  readonly clientScoped: boolean;
  /** Overrides the plain level name in screens, where the level means something narrower. */
  readonly levelLabels?: Partial<Record<Level, string>>;
};

export const AREAS = [
  { key: "client_profile", group: "brand", label: "Client profile", covers: "Name, logo, website, linked Drive folder", levels: ["edit"], clientScoped: true },
  { key: "brand_knowledge", group: "brand", label: "Brand knowledge", covers: "Uploaded documents and images, extracted brand facts, ready-check", levels: ["view", "edit", "generate", "delete"], clientScoped: true },
  { key: "brand_assets", group: "brand", label: "Brand assets", covers: "Brand kit files, images imported from social accounts", levels: ["view", "edit", "generate", "delete"], clientScoped: true },
  { key: "market", group: "brand", label: "Market and performance", covers: "Signals, references, tracked social handles and their numbers", levels: ["view", "edit", "generate", "delete"], clientScoped: true },
  { key: "moodboards", group: "brand", label: "Moodboards", covers: "Boards and their items", levels: ["view", "edit", "delete"], clientScoped: true },
  { key: "scripts", group: "story", label: "Scripts", covers: "Script library, writing, script copilot, mark final, reopen", levels: ["view", "edit", "generate", "approve", "delete"], clientScoped: true, levelLabels: { approve: "Mark final" } },
  { key: "storyboard", group: "story", label: "Storyboard", covers: "Visualise panels, location plates, picking the panel per shot", levels: ["view", "edit", "generate"], clientScoped: true },
  { key: "avatars", group: "story", label: "Avatars", covers: "Cast library, avatar images and turnaround sheet, assigned voice", levels: ["view", "edit", "generate", "delete"], clientScoped: true },
  { key: "voices", group: "story", label: "Voices", covers: "Voice library, saved voices, cloning", levels: ["view", "edit", "generate", "delete"], clientScoped: true },
  { key: "canvases", group: "production", label: "Canvases", covers: "Create, rename, nodes, prompts, uploads, Drive import, restore versions, AI-written text nodes", levels: ["view", "edit", "generate", "delete"], clientScoped: true },
  { key: "image_generation", group: "production", label: "Image generation", covers: "Images, composites, compose", levels: ["generate", "approve"], clientScoped: true },
  { key: "video_generation", group: "production", label: "Video generation", covers: "Video, multishot, scene split, video prompts, video edit", levels: ["generate", "approve"], clientScoped: true },
  { key: "audio", group: "production", label: "Audio and lip-sync", covers: "Dubbing, voice change, lip-sync", levels: ["generate", "approve"], clientScoped: true },
  { key: "canvas_copilot", group: "production", label: "Canvas copilot", covers: "The AI chat that can add and change nodes", levels: ["generate"], clientScoped: true },
  { key: "video_editor", group: "production", label: "Video editor", covers: "Timeline, transcripts, renders, exports", levels: ["view", "edit", "generate", "share"], clientScoped: true },
  { key: "internal_review", group: "review", label: "Internal review", covers: "Review inbox and review mode", levels: ["view"], clientScoped: true },
  { key: "client_review", group: "review", label: "Client review", covers: "Cut upload, review links, client comments, team replies", levels: ["view", "edit", "share"], clientScoped: true },
  { key: "downloads", group: "review", label: "Downloads", covers: "Downloading files", levels: ["view", "share"], clientScoped: true, levelLabels: { view: "Approved finals", share: "Anything, drafts included" } },
  { key: "clients", group: "agency", label: "Clients", covers: "Create and archive clients", levels: ["edit", "delete"], clientScoped: false },
  { key: "team", group: "agency", label: "Team", covers: "Invite and remove people, change their ticks and clients", levels: ["view", "edit", "delete"], clientScoped: false },
  { key: "credits", group: "agency", label: "Credits and billing", covers: "Credit usage and costs", levels: ["view"], clientScoped: false },
] as const satisfies readonly AreaDef[];

type AreaUnion = (typeof AREAS)[number];
export type Area = AreaUnion["key"];

type KeyOf<A> = A extends { key: infer K extends string; levels: readonly (infer L extends string)[] }
  ? `${K}.${L}`
  : never;
export type PermissionKey = KeyOf<AreaUnion>;
export type ClientScopedKey = KeyOf<Extract<AreaUnion, { clientScoped: true }>>;
export type AgencyKey = Exclude<PermissionKey, ClientScopedKey>;

export const ALL_PERMISSION_KEYS: readonly PermissionKey[] = AREAS.flatMap((a) =>
  (a.levels as readonly Level[]).map((l) => `${a.key}.${l}` as PermissionKey),
);

const KEY_SET: ReadonlySet<string> = new Set(ALL_PERMISSION_KEYS);
const AREA_BY_KEY: ReadonlyMap<string, AreaDef> = new Map(AREAS.map((a) => [a.key, a as AreaDef]));

export function isPermissionKey(value: string): value is PermissionKey {
  return KEY_SET.has(value);
}

export function splitKey(key: PermissionKey): { area: Area; level: Level } {
  const dot = key.lastIndexOf(".");
  return { area: key.slice(0, dot) as Area, level: key.slice(dot + 1) as Level };
}

export function isClientScopedKey(key: PermissionKey): key is ClientScopedKey {
  return AREA_BY_KEY.get(splitKey(key).area)?.clientScoped === true;
}

export function areaHasLevel(area: Area, level: Level): boolean {
  return AREA_BY_KEY.get(area)?.levels.includes(level) ?? false;
}
