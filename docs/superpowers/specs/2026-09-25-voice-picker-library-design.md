# Voice picker with ElevenLabs Voice Library — design

*Recorded 2026-09-25. ADR: D283 in the roadmap §7. Builds on D282
(`2026-09-24-elevenlabs-voice-change-design.md`).*

## Problem

D282 shipped a plain shadcn `Select` over the account's voices: no search, no filters, a single
preview button for the already-selected voice, and it reads the whole list from the legacy
`GET /v1/voices`. The ElevenLabs account has 21 stock voices today; the public Voice Library has
~18,000 (6,800+ Hindi). Operators want to browse and audition voices the way ElevenLabs' own
Voice Library works.

## Facts checked against the live API (2026-09-25)

| Check | Result |
|---|---|
| `GET /v2/voices` (account) | 21 voices, all `premade`; `has_more: false`. Labels present: `gender`, `age`, `accent`, `language`, `use_case`, `descriptive`; plus `description`, `preview_url`. |
| `voice_type` = personal / saved / community / workspace / non-default | 0 each |
| `GET /v1/shared-voices` (Voice Library) | `total_count` 18,069; `language=hi` 6,837 |
| Speech-to-speech with a Library voice id, **not saved** | 200, audio returned |
| `POST /v1/voices/add/{public_owner_id}/{voice_id}` | 200, returns a new account `voice_id`; saved voice has `category: "professional"`, `sharing.status: "copied"`, `sharing.public_owner_id`, `sharing.original_voice_id` |
| Speech-to-speech with the saved voice id | 200 |
| `DELETE /v1/voices/{id}` | 200 (test voice removed) |
| `GET /v1/user/subscription` | 401 — the key lacks user-read permission; the app cannot read the plan tier |

The account is on the Free ElevenCreative plan with a pay-as-you-go ElevenAPI top-up; the test
voice had `free_users_allowed: true`. Voices with `free_users_allowed: false` may be refused —
the picker surfaces ElevenLabs' refusal (§4).

## API versions (current, per ElevenLabs docs)

| Purpose | Endpoint |
|---|---|
| Account voices, search, paging, single-voice lookup | `GET /v2/voices` (`search`, `sort`, `sort_direction`, `page_size` ≤ 100, `next_page_token`, `voice_ids`, `include_total_count`) — **replaces D282's `GET /v1/voices`** |
| Voice Library browse | `GET /v1/shared-voices` (`search`, `gender`, `age`, `accent`, `language`, `use_cases`, `category`, `featured`, `sort` ∈ `trending` / `cloned_by_count` / `usage_character_count_1y` / `created_date`, `page`, `page_size` ≤ 100) — only version |
| Save a Library voice | `POST /v1/voices/add/{public_user_id}/{voice_id}` body `{ new_name }` — only version |
| Voice change | `POST /v1/speech-to-speech/{voice_id}`, model `eleven_multilingual_sts_v2` — unchanged, current |

## Decisions

| Question | Decision |
|---|---|
| Which voices | **Both tabs now:** My voices + Voice Library. |
| Loading — My voices | **Load all** server-side (100 per page, following `next_page_token`), cache 5 min; search/filter/sort in the browser, instant. |
| Loading — Voice Library | **Infinite scroll**, 30 per page, ElevenLabs' server-side search and filters. |
| Picking a Library voice | **Save it to the account** (`/v1/voices/add`), then select the returned account `voice_id`. |
| Voices with a custom rate ("credit multiplier") | **Show with an "N×" badge and bill with the multiplier** — subject to the verification in §3; fallback is hiding them. |
| Layout | **Rich dropdown** (popover) from the Voice field — not a dialog. |

## 1. Server

### 1.1 `GET /api/elevenlabs/voices`

Query: `source=account|library` (default `account`), `search`, `gender`, `age`, `accent`,
`language`, `useCase`, `sort`, `cursor`.

- **account** → `GET /v2/voices?page_size=100&include_total_count=false`, following
  `next_page_token` until done; cached 5 min in-process (replaces D282's `/v1/voices` cache).
  Returns the whole list; `search`/filters are ignored server-side for this source (the browser
  filters). `nextCursor: null`.
- **library** → `GET /v1/shared-voices?page_size=30&page={cursor ?? 0}` plus `search`, `gender`,
  `age`, `accent`, `language`, `use_cases`, `sort`. `nextCursor` = `page + 1` when `has_more`,
  else `null`. Each page cached 60 s keyed by the full query.
- Response (both): `{ voices: PickerVoice[], nextCursor: string | null }`.

```ts
type PickerVoice = {
  voiceId: string;                 // account voice_id, or the Library voice_id
  source: "account" | "library";
  name: string;
  description: string | null;
  previewUrl: string | null;
  labels: { gender?: string; age?: string; accent?: string; language?: string; useCase?: string; descriptive?: string };
  category: string;                // premade / cloned / generated / professional / famous / high_quality
  priceMultiplier: number;         // ≥ 1; from ElevenLabs `rate` (see §3); 1 when absent
  publicOwnerId?: string;          // library only — needed to save
};
```

Auth and errors as in D282: `resolveCallerContextOrNull()` → 401; missing key → 503 with
`VOICE_NOT_SET_UP_MESSAGE`; ElevenLabs failure → 502 with its status/message.

### 1.2 `GET /api/elevenlabs/voices/[voiceId]`

Single-voice lookup for the node: `GET /v2/voices?voice_ids={id}`. Returns
`{ voice: PickerVoice }` or 404 `"That voice is no longer on the ElevenLabs account."`. Used by
the focus view for the trigger label, the "Unavailable voice" state and the estimate's
multiplier — so the node never depends on which page of a list is loaded. Cached 5 min per id.

### 1.3 `POST /api/elevenlabs/voices/save`

Body `{ publicOwnerId, voiceId, name }` (zod). Calls
`POST /v1/voices/add/{publicOwnerId}/{voiceId}` with `{ new_name: name }`. Returns
`{ voice: PickerVoice }` (looked up via 1.2 so it carries the account id and multiplier) and
invalidates the account-list cache. ElevenLabs refusal → 4xx passed through with ElevenLabs'
message (e.g. a voice not allowed for the plan). If the voice was already saved
(`is_added_by_user` on the library row), the route resolves the existing account copy instead of
adding a duplicate: it looks for an account voice whose `sharing.original_voice_id` equals
`voiceId`.

### 1.4 `video-generate` route

Replace the D282 full-list check (`getVoicesCached()` + `find`) with the single-voice lookup
(1.2's server function): missing → 400 as today; resolves `voiceName` and `priceMultiplier`.
Reserve `videoCost + voiceChangeCost(duration) × priceMultiplier`. `VoicePayload` gains
`priceMultiplier`; the task passes it through into `meta.voice`; `VoiceMeta` gains
`priceMultiplier` (default 1 when absent, for versions written before D283).

### 1.5 `completeGeneration`

Settle `voiceChangeCost(duration) × meta.voice.priceMultiplier` when `status === "applied"`.

## 2. UI — the Voice dropdown

Replaces `video-gen-voice-select.tsx`. Per `docs/component-structure.md`, sub-components stay in
`src/components/nodes/` prefixed with the parent's name (no subfolder):
`video-gen-voice-picker.tsx` (parent: trigger + popover shell), `video-gen-voice-picker-filters.tsx`,
`video-gen-voice-picker-list.tsx`, `video-gen-voice-picker-row.tsx`.

- **Trigger** (in `video-gen-voice-picker.tsx`): shadcn `Button` (outline) showing the selected
  voice's name + up to two labels, or "Original (no change)" / "Unavailable voice" /
  "Loading voice…"; a separate `icon-sm` play `Button` beside it. `PopoverTrigger` with `render`.
- **Popover** (in `video-gen-voice-picker.tsx`): `PopoverContent` ~440 × 540 px, `align="start"`.
  1. Search — `InputGroup` + `InputGroupInput` + `InputGroupAddon` (search icon) +
     `InputGroupButton` (clear). Debounced 300 ms.
  2. `Tabs`: **My voices** · **Voice Library**.
  3. Filters (`video-gen-voice-picker-filters.tsx`) — `Select`s: Gender, Age, Accent, Language, Use case,
     Sort. My voices: options derived from the loaded voices' labels; sort Name / Newest.
     Library: fixed option lists (ElevenLabs values), sort Trending / Most used / Newest.
     "Clear filters" appears when any filter is set.
  4. List (`video-gen-voice-picker-list.tsx`) in `ScrollArea`: first row **Original (no change)**;
     then rows (`video-gen-voice-picker-row.tsx`): play/pause `Button`, name, up to two label `Badge`s, one-line
     description, `N×` `Badge` when `priceMultiplier > 1`, ✓ when selected. Library tab appends
     `InfiniteScrollSentinel` (moved from `src/components/review/` to
     `src/components/shared/infinite-scroll-sentinel.tsx`; review imports updated).
  5. States: skeleton rows (`Skeleton`) while loading; "No voices match" + Clear filters; error
     line + Retry `Button`; D282's blocked reason (audio off / mock) disables the trigger.
- **Preview**: one `HTMLAudioElement` owned by the hook; playing a row stops the previous one;
  closing the popover or unmounting stops playback. The icon reflects playing/paused.
- **Selecting**: a My voices row → `onChange(voiceId)`, popover closes. A Library row → row
  spinner, `POST …/save`, then `onChange(savedVoiceId)`; on refusal the row shows ElevenLabs'
  message and the node is unchanged.
- **Keyboard**: rows are `Button`s in a roving list — ↑/↓ move, Enter selects, Space toggles the
  row's preview. Play buttons have `aria-label="Play preview of {name}"`.
- **Hook** (`src/hooks/use-voice-browser.ts`): tab, search, filters, account list, library pages
  + cursor, loading/error per tab, preview state. Replaces `use-elevenlabs-voices.ts`.
- **Selected voice** (`src/hooks/use-selected-voice.ts`): calls 1.2 for `data.voiceId`; feeds the
  trigger label, `resolveEffectiveVoiceId` (now: null when blocked or when the lookup returned
  404; kept while loading or on a lookup error, as in D282) and the estimate's multiplier.
- **Pure helpers** (`src/lib/elevenlabs/voice-filters.ts`): `filterAccountVoices(voices,
  { search, gender, age, accent, language, useCase })`, `sortAccountVoices`, `labelOptions(voices)`
  — unit-tested.

## 3. Price multiplier — verification first

The docs describe `rate` on Library voices as the credit multiplier (legacy custom rates; new
shares can't set one) and `fiat_rate` as USD per 1,000 credits. They do not say whether a saved
copy still reports it through `/v2/voices`. The saved test voice's `sharing` object includes
`public_owner_id` and `original_voice_id`; whether it includes `rate` was not captured.

**Checked live 2026-09-25:** "David - Movie Trailer Narrator" (`rate: 2`, `fiat_rate: 0.2`,
`free_users_allowed: false`) saved via `/v1/voices/add`, read back via `/v2/voices?voice_ids=` —
the saved copy reports `sharing.rate: 2` and `sharing.fiat_rate: 0.2` (then deleted). So:

- `priceMultiplier` = `rate` for Library rows, `sharing.rate` for account voices; `1` when absent
  or `< 1`.
- The Library tab passes `include_custom_rates=true` so these voices are listed, with the badge.
- Note: the saved copy's `voice_id` may equal the Library `voice_id`; always use the id the save
  call returns.

## 4. Errors

| Failure | Result |
|---|---|
| Account list or library page fails | Error line + Retry in that tab; the other tab and "Original" still work |
| Save refused by ElevenLabs | Row shows ElevenLabs' message; node unchanged |
| Selected voice lookup 404 | Trigger reads "Unavailable voice"; request and estimate drop the voice |
| Selected voice lookup errors | Voice kept (as D282); the generate route gives its own 400 if it's truly gone |
| Preview URL missing / fails to play | Play button disabled / silently stops |

## 5. Testing

- Unit: `voice-filters.ts`; `PickerVoice` mapping for both sources (fixtures shaped like the
  live responses above); library cursor math; save route (added, already-saved, refused);
  single-voice route (found, 404); `video-generate` route reserves with the multiplier;
  `completeGeneration` settles with it (and treats a missing multiplier as 1);
  `resolveEffectiveVoiceId` with the lookup states.
- Existing D282 tests updated for `/v2/voices`.
- Manual: browse both tabs, filter Hindi + female, scroll past 100 Library voices, preview two
  rows (only one plays), pick a Library voice (appears under My voices), generate with it.

## Non-goals

Creating or cloning voices in CreativeOS; bookmarks/favourites; a default voice per client;
"similar voices"; showing voice owner avatars or social links.
