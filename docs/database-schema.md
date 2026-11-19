# Database schema map

Generated from migrations up to **0066** (`supabase/migrations/0001_init.sql` … `0066_billing_payments.sql`). Two files share the number 0062 (`0062_client_review_versions.sql` from staging and `0062_permission_based_access.sql`); they touch different tables and both are applied.
It shows the state after every migration has run: later `alter`/`drop`/`create or replace` are folded in.

- **Access.** The code reads and writes through the service-role client (`createServerSupabase`, `src/lib/supabase/server.ts`), which bypasses RLS. The browser client is used only for Realtime on the tables marked *Realtime* below; their `org isolation` select policy is what lets it receive rows, and since 0065 it lets a person read only the rows of clients they may see (credit transactions: owners only).
- **Tenancy.** `org_id` is on the tables marked so. The others belong to an agency through `client_id → clients.org_id` (or `canvas_id → canvases.org_id`), and the code scopes by client.
- **RLS.** On for every table. "Service role only" means RLS on and no policies (default deny, 0017).
- **Keep it current.** A change that adds a migration updates this file in the same commit (and `docs/auth-production-migration.md`). `src/lib/db/schema-map.test.ts` fails when a table or view has no heading here, or when the "up to" number above is not the last migration.
- Columns list skips `created_at`/`updated_at` unless they mean something. `→` is a foreign key; `cascade` / `set null` is its `on delete`.

Contents: [Agencies & people](#agencies--people) · [Clients & brand KB](#clients--brand-kb) · [Canvases, nodes, versions](#canvases-nodes-versions) · [Scripts](#scripts) · [Generation & credits](#generation--credits) · [Review & sharing](#review--sharing) · [Avatars & voices](#avatars--voices) · [Market](#market) · [Admin & audit](#admin--audit) · [Media caches](#media-caches) · [Views](#views) · [Functions](#functions) · [Types, Realtime, storage](#types-realtime-storage) · [Known leftovers](#known-leftovers)

---

## Agencies & people

### organizations
An agency (tenant). *0012*
- `id` uuid PK · `name` text · `slug` text unique · `monthly_credit_limit` numeric (null = unlimited; ×1000 in 0019)
- `invite_window_start` timestamptz, `invite_window_count` int default 0: the 50-a-day invite send counter (0063, `take_invite_send`)
- RLS: service role only.

### profiles
Display name per login. *0012*
- `user_id` uuid PK → auth.users cascade · `display_name` text
- RLS: service role only.

### org_memberships
A login's membership in one agency, with agency-level permissions. *0012, 0062*
- PK `(user_id, org_id)` · `user_id` → auth.users cascade · `org_id` → organizations cascade
- `org_role` text check owner/senior/designer (legacy, kept in step until dropped, D510) · `joined_at`
- `is_owner` bool · `permissions` text[] check ⊆ generate/approve/share/delete/invite · `access_given_at` (null = waiting) · `invited_by` → auth.users set null
- Unique: `org_memberships_one_org_per_user (user_id)` (one agency per login, D508) · `org_memberships_one_owner (org_id) where is_owner`
- Indexes: `org_id`, `invited_by`
- RLS: select `own membership` (`user_id = auth.uid()`, 0018); used by `auth_org_ids()`.
- Triggers: `org_memberships_last_owner` (0012, org_role based) · `org_memberships_cascade_permissions` (after update of permissions → every `membership_clients` row of the person) · `org_memberships_keep_owner` (constraint trigger, deferred: an agency can't lose its owner)

### membership_clients
Which clients a member is on, with the effective permissions there (many-to-many person ↔ client). *0062*
- PK `(user_id, org_id, client_id)` · `permissions` text[] check ⊆ the five · `added_by` → auth.users set null · `added_at`
- FK `(user_id, org_id)` → org_memberships cascade · FK `(client_id, org_id)` → clients(id, org_id) cascade (no cross-agency rows)
- Indexes: `client_id`, `added_by`
- RLS: service role only.
- Trigger `membership_clients_prepare` (before insert): refuses an owner, copies the person's agency-level permissions.

### org_invitations
An invite link, sent from inside a client (owner invites have no client). *0062*
- `id` uuid PK · `org_id` → organizations cascade · `client_id` uuid · `email` text · `as_owner` bool · `token` text unique · `invited_by` → auth.users set null · `expires_at` (now + 7 days) · `accepted_at` · `revoked_at`
- FK `(client_id, org_id)` → clients(id, org_id) cascade · check `(client_id is null) = as_owner`
- Unique (open = not accepted, not revoked): `(org_id, lower(email))` · `(org_id) where as_owner`
- Indexes: `(org_id, created_at)`, `client_id`, `invited_by`
- RLS: service role only. Resend replaces `token` and moves `created_at`.

---

## Clients & brand KB

### clients
A brand an agency works for. *0001* · org_id
- `id` uuid PK · `slug` text unique · `name` text · `logo_url` text · `kb_status` text check pending/in_review/ready · `active_kb_version_id` → client_kb_versions set null · `archived_at` · `website_url` · `drive_root_folder_id` text · `org_id` → organizations (not null) · `brand_details` jsonb default `{}` (0027)
- Unique: `slug`; `clients_id_org_unique (id, org_id)` (target of the composite FKs, 0062)
- Indexes: `archived_at`, `org_id`
- RLS: service role only.

### client_kb_documents
Uploaded brand documents (pdf/docx/pptx/md/txt). *0002*
- `id` uuid PK · `client_id` → clients cascade · `filename` · `file_ext` · `storage_url` · `size_bytes` bigint
- Index: `client_id` · RLS: service role only.

### client_kb_versions
Each extracted Brand KB (full JSON). *0002*
- `id` uuid PK · `client_id` → clients cascade · `output` jsonb · `model_used` · `doc_ids_used` uuid[] · `fill_rate` float · `note`
- Index: `client_id` · RLS: service role only.
- Written field-by-field through `set_kb_field`, `set_kb_image_analysis`, `save_kb_output_keep_image_analysis`.

### client_kb_jobs
A background KB build (research + extract). *0008* · org_id · *Realtime*
- `id` uuid PK · `client_id` → clients cascade · `status` client_kb_job_status · `phase_message` · `website_url` · `doc_ids_used` uuid[] · `trigger_run_id` · `version_id` → client_kb_versions set null · `error` · `org_id` → organizations (not null, 0014)
- Indexes: `(client_id, status)`, `org_id`, `version_id` (0063); unique `(client_id) where status` is live (one running job per client)
- RLS: select `org isolation`, limited to the reader's clients (`auth_client_ids()`, 0065).

### client_brand_images
Brand images and videos: uploads plus imports from website/Instagram/Facebook. *0003, 0044–0046*
- `id` uuid PK · `client_id` → clients cascade · `filename` · `file_ext` · `storage_url` · `size_bytes`
- `source` check upload/website/instagram/facebook · `media_type` check image/video · `thumbnail_url` · `source_url` · `posted_at` · `source_ref` · `sort_at` generated `coalesce(posted_at, created_at)` · `width`, `height` int > 0
- Indexes: `client_id`; unique `(client_id, source_ref) where source_ref is not null`; `(client_id, sort_at desc, id desc) where source <> 'upload'`
- RLS: service role only.

### client_brand_image_cards
One AI analysis card per brand image. *0048, 0049*
- `image_id` uuid PK → client_brand_images cascade · `client_id` → clients cascade · `version` int · `model` · `format` text · `purpose` text · `card` jsonb
- Indexes: `(client_id, format)`, `(client_id, purpose)` · RLS: service role only.

### client_brand_assets
Brand kit files: logos, backgrounds, products. *0027_brand_kit*
- `id` uuid PK · `client_id` → clients cascade · `category` check logo/background/product · `name` · `storage_url` · `position` int
- Index: `(client_id, category)` · RLS: service role only.

---

## Canvases, nodes, versions

### canvases
A client's node canvas. *0001* · org_id
- `id` uuid PK · `client_id` → clients cascade · `slug` · `name` · `viewport` jsonb · `org_id` → organizations (not null, 0014)
- Edit lock (0010): `editing_session_id` uuid · `editing_name` · `editing_heartbeat_at` (see `acquire_canvas_lock`)
- `source_script_id` → client_scripts set null, unique where not null (0056: one canvas per script)
- Unique `(client_id, slug)` · Indexes: `client_id`, `org_id`
- RLS: select `org isolation`, limited to the reader's clients (`auth_client_ids()`, 0065). `updated_at` is bumped by triggers on nodes, edges and node_versions.

### nodes
A node on a canvas; `type` is the node kind (`image-gen`, `video-gen`, `editor`, `dubbing`, …). *0001*
- `id` uuid PK · `canvas_id` → canvases cascade · `type` text · `position` jsonb · `data` jsonb · `active_version_id` → node_versions set null
- Indexes: `canvas_id`, `active_version_id` (0063) · RLS: service role only.
- Triggers: `nodes_touch_canvas` · `nodes_keep_canvas` (a node can't move to another canvas, 0062)

### node_versions
Each run/output of a node, with its approval state. *0001* · org_id · *Realtime*
- `id` uuid PK · `node_id` → nodes cascade · `inputs_used`, `params_used` jsonb · `model_used` · `output` jsonb · `generated_output` jsonb (0005) · `error`
- Legacy text: `decision`, `note`, `operator` (fallback maker name), `approved_by` (never read)
- Approval (0009/0030/0032): `approval_status` check pending/approved/changes_requested · `approved_at` · `approved_by_user_id`, `operator_user_id` → auth.users set null · `approved_seen_at`
- `org_id` → organizations (nullable; filled by trigger) · `updated_at` (0034)
- Indexes: `node_id`, `(org_id, approval_status)`, `operator_user_id where not null`
- RLS: select `org isolation`, limited to the reader's clients (`auth_client_ids()`, 0065).
- Triggers: `node_versions_touch_canvas` · `node_versions_set_org_id` (before insert)

### edges
A connection between two nodes on the same canvas. *0001*
- `id` uuid PK · `canvas_id` → canvases cascade · `source_node_id`, `target_node_id` → nodes cascade · `source_handle`, `target_handle`
- Indexes: `canvas_id`, `source_node_id`, `target_node_id` (0059) · RLS: service role only.
- Triggers: `edges_touch_canvas` · `edges_keep_canvas` (both ends on the edge's canvas, 0062)

### editor_edits
The Rough Cut Editor document for an editor node. *0059* · org_id
- `node_id` uuid PK → nodes cascade · `canvas_id` → canvases cascade · `org_id` → organizations (filled by trigger) · `doc` jsonb
- Indexes: `canvas_id`, `org_id` (0063) · RLS: service role only. Trigger `editor_edits_set_org_id`.

---

## Scripts

### client_scripts
A video script moving through generate → visualise → in_review → approved. *0051, 0052*
- `id` uuid PK · `client_id` → clients cascade · `stage` check generate/visualise/in_review/approved · `doc` jsonb (null only in generate) · `brief`, `notes` jsonb · `doc_version` int · `approved_at` · `archived_at` · `created_by` → auth.users set null
- Index: `(client_id, archived_at, stage)` · RLS: service role only.

### client_script_messages
The script chat (user and assistant turns). *0052, 0061*
- `id` uuid PK · `seq` bigint identity · `script_id` → client_scripts cascade · `client_id` → clients cascade · `role` check user/assistant · `content` · `card` jsonb · `suggestions` jsonb · `created_by` → auth.users set null
- Indexes: `(script_id, seq)`, `client_id` (0063) · RLS: service role only.

### script_panel_takes
Each storyboard panel image drawn for a shot. *0053*
- `id` uuid PK · `client_id` → clients cascade · `script_id` → client_scripts cascade · `shot_id` text · `generation_id` → generations set null · `status` check running/succeeded/failed · `url` · `width`, `height` · `prompt` · `prompt_edited` bool · `shot_key` · `faces` jsonb · `error` · `created_by`
- Indexes: `(script_id, shot_id, created_at desc)`, `client_id` (0063) · RLS: service role only.

### script_panel_picks
The chosen take per shot. *0053*
- PK `(script_id, shot_id)` · `script_id` → client_scripts cascade · `take_id` → script_panel_takes cascade · `picked_at`
- Index: `take_id` (0063) · RLS: service role only.

---

## Generation & credits

### generations
One AI generation job (image/video/prompt/…), owned by a node, an avatar or a script. *0007* · org_id · *Realtime*
- `id` uuid PK · `node_id` → nodes cascade (nullable, 0042) · `avatar_id` → client_avatars cascade · `script_id` → client_scripts cascade · check at least one of the three
- `type` · `status` (running/succeeded/failed) · `provider_job_id` · `model_used` · `params_snapshot`, `inputs_snapshot`, `tokens_used`, `meta` jsonb · `error`
- `cost_usd` numeric (renamed from credits_consumed, 0019) · `credits_charged` numeric · `output_snapshot` text (0016)
- `version_id` → node_versions (no on delete action) · `user_id` uuid (no FK) · `org_id` → organizations (not null) · `client_id` → clients (no on delete action, 0016)
- Indexes: `node_id`, `status`, `version_id`, `org_id`, `client_id`, `avatar_id`, `script_id`
- RLS: select `org isolation`, limited to the reader's clients (`auth_client_ids()`, 0065).

### credit_transactions
The credit ledger: reservation, consumption, refund, adjustment. *0019* · org_id · *Realtime*
- `id` uuid PK · `org_id` → organizations · `generation_id` → generations set null (nullable, 0028) · `amount` numeric · `type` check
- Indexes: `org_id`, `generation_id`, `(org_id, created_at)`
- RLS: select owners of the agency only (0065). Written by `reserve_credits` and the server.

### billing_payments
One row per Razorpay order for the test top-up (D514). *0066* · org_id
- `id` uuid PK · `org_id` → organizations cascade · `razorpay_order_id` text unique · `razorpay_payment_id` text unique (set when paid) · `amount_paise` integer > 0 · `credits` integer > 0 · `status` check created/paid (default created) · `created_by` → auth.users set null · `created_at` · `paid_at`
- Indexes: `org_id`
- RLS: select `owners read`, owners of the agency only. Written by the server (service role) and `record_razorpay_payment`.

### background_jobs
Generic background job rows (kind + input/result), one live job per `lock_key`. *0044* · org_id
- `id` uuid PK · `org_id` → organizations · `client_id` → clients cascade · `kind` · `status` check queued/running/succeeded/failed · `phase_message` · `input`, `result` jsonb · `error` · `lock_key` · `trigger_run_id` · `created_by` → auth.users set null · `started_at` · `finished_at`
- Indexes: `(client_id, kind, created_at desc)`, `org_id` (0063); unique `(lock_key)` where queued/running
- RLS: service role only.

---

## Review & sharing

### node_version_decisions
Every approve / request-changes decision on a version (history; the version keeps the latest). *0033* · org_id
- `id` uuid PK · `version_id` → node_versions cascade · `org_id` → organizations · `status` check approved/changes_requested · `note` · `decided_by_user_id` → auth.users set null · `decided_at`
- Indexes: `(version_id, decided_at desc)`, `org_id` (0063) · RLS: select `org isolation`, limited to the reader's clients (`auth_client_ids()`, 0065).

### node_version_annotations
Painted marks attached to a decision (image or video frame). *0035–0037* · org_id
- `id` uuid PK · `decision_id` → node_version_decisions cascade · `org_id` → organizations · `seq` int · `kind` check image/video-frame · `timecode_ms` (video only) · `mask_path` · `note` · `bounds` jsonb · `frame_path` (unused since D249, always null)
- Unique `(decision_id, seq)` · RLS: select `org isolation`, limited to the reader's clients (`auth_client_ids()`, 0065).

### canvas_reviews
A share link for one video node, for client comments. *0047* · org_id
- `id` uuid PK · `canvas_id` → canvases cascade · `node_id` → nodes cascade, unique · `org_id` → organizations (filled by trigger) · `video_path` (nullable since `0062_client_review_versions`; the cut lives on the version, kept unread for one release) · `share_token` unique · `created_by` uuid (no FK)
- Index: `canvas_id` (0063) · RLS: service role only. Trigger `canvas_reviews_set_org_id`.
- One Client review node per canvas from `0062_client_review_versions` (D495): trigger `refuse_second_client_review_node` on `nodes` refuses a new second one; canvases that already had several keep them.

### canvas_review_versions
Each uploaded cut of a client review, with its own link, comments and download switch (D495–D499). *`0062_client_review_versions`*
- `id` uuid PK · `review_id` → canvas_reviews cascade · `version_no` ≥ 1 · `video_path` · `title` (1–200, null = the node's title) · `allow_download` bool default true · `legacy_link` bool (a v1 moved from a pre-version review keeps its old link) · `created_by` uuid · `created_at`
- Unique `(review_id, version_no)` · RLS: service role only.

### canvas_review_comments
Timecoded comments on a canvas review. *0047*
- `id` uuid PK · `review_id` → canvas_reviews cascade · `version_id` → canvas_review_versions cascade, not null (`0062_client_review_versions`) · `author_name` (1–60) · `body` (1–2000) · `timecode_ms` ≥ 0 · `edited_by_name`
- Indexes: `(review_id, created_at)`, `(version_id, created_at)` · RLS: service role only.

### script_reviews
A script's share link (one per script). *0054*
- `id` uuid PK · `script_id` → client_scripts cascade, unique · `client_id` → clients cascade · `share_token` unique · `created_by` → auth.users set null
- Index: `client_id` (0063) · RLS: service role only.

### script_review_versions
Each shared snapshot of a script (numbered). *0054*
- `id` uuid PK · `review_id` → script_reviews cascade · `number` ≥ 1 · `scope` check script/avatars/panels · `doc`, `visuals` jsonb · `shared_by` → auth.users set null
- Unique `(review_id, number)` · RLS: service role only.

### script_review_comments
Threaded comments on a part of a shared script version. *0054*
- `id` uuid PK · `review_id` → script_reviews cascade · `version_id` → script_review_versions cascade · `part_kind` check context/shot/panel/cast/view · `part_id` · `part_view` front/left/right/back · `parent_id` → self cascade · `author_kind` client/team · `author_name` · `author_user_id` → auth.users set null · `body` · `edited_by_name` · `resolved_at` · `resolved_by_name`
- Checks tie `part_id` to non-context and `part_view` to `view`
- Indexes: `(review_id, created_at)`, `version_id`, `parent_id` (0063) · RLS: service role only.

### script_review_events
The script's review timeline (moved to review, shared, approved, …). *0054*
- `id` uuid PK · `script_id` → client_scripts cascade · `kind` check moved_to_review/moved_back/shared/approved/reopened · `version_number` · `actor_kind` client/team · `actor_name` · `detail` jsonb
- Index: `(script_id, created_at)` · RLS: service role only.

---

## Avatars & voices

### client_avatars
A brand's avatar (character): likeness, sheet, voice. *0041, 0053*
- `id` uuid PK · `client_id` → clients cascade · `name` · `story` · `person_type` generic/specific · `likeness_consent_by` → auth.users set null · `likeness_consent_at` · `front`, `sheet`, `sheet_views`, `voice`, `voice_sample` jsonb · `sheet_stale` bool · `status` draft/ready · `archived_at` · `created_by`
- Index: `(client_id, archived_at)` · RLS: service role only.

### client_voices
Voices saved to a client (library or clone). *0043*
- `id` uuid PK · `client_id` → clients cascade · `elevenlabs_voice_id` · `name` · `source` library/clone · `created_by`
- Unique `(client_id, elevenlabs_voice_id)` · Index: `elevenlabs_voice_id` · RLS: service role only.

---

## Market

### moodboards
A client's board; `custom` boards plus one `direct` and one `adjacent` system board. *0026, 0034*
- `id` uuid PK · `client_id` → clients cascade · `name` · `board_type` custom/direct/adjacent
- Index: `client_id`; unique `(client_id, board_type) where board_type <> 'custom'` · RLS: service role only.

### moodboard_items
An image/video/link on a board, with its archived copy. *0026, 0034, 0039, 0040* · org_id · *Realtime*
- `id` uuid PK · `moodboard_id` → moodboards cascade · `image_url` · `source_url` · `position` · `added_at` · `kind` check image/gif/video/youtube/instagram/tiktok/link/pinterest · `note` · `added_by` → auth.users set null · `thumbnail_url`
- Archive: `media_url` · `media_bytes` · `media_type` · `archive_status` pending/downloading/ready/failed/skipped · `archive_error` · `archive_attempts` · `archive_started_at` · `archived_at`
- `org_id` → organizations (filled by trigger)
- Indexes: `moodboard_id`, `org_id`, `archive_status` where pending/failed/downloading
- RLS: select `org isolation`, limited to the reader's clients (`auth_client_ids()`, 0065). Trigger `moodboard_items_set_org_id`.

### signals
A named market signal grouping board items. *0034_market_signals*
- `id` uuid PK · `client_id` → clients cascade · `name` · `tags` text[] · `description` · `created_by` → auth.users set null
- Index: `client_id` · RLS: service role only.

### signal_items
Items in a signal (many-to-many signal ↔ moodboard item). *0034_market_signals*
- PK `(signal_id, item_id)` · `signal_id` → signals cascade · `item_id` → moodboard_items cascade · `position`
- Index: `item_id` · RLS: service role only.

### tracked_handles
Instagram handles a client follows for performance. *0038*
- `id` uuid PK · `client_id` → clients cascade · `platform` (instagram only) · `handle` · `added_at`
- Unique `(client_id, platform, handle)` · Index `(client_id, added_at)` · RLS: service role only.

### account_snapshots
Follower/post counts per handle over time. *0038*
- `id` uuid PK · `client_id` → clients cascade · `platform` · `handle` · `followers_count`, `follows_count`, `posts_count` · `raw` jsonb · `captured_at`
- Index `(client_id, platform, handle, captured_at desc)` · RLS: service role only.

### tracked_posts
Posts seen on tracked handles, with their latest counts. *0038*
- `id` uuid PK · `client_id` → clients cascade · `platform` · `handle` · `short_code` · `post_type` image/video/carousel · `caption` · `post_url` · `likes_count` (null = hidden) · `comments_count` · `video_view_count` · `posted_at` · `thumbnail_url` · `first_seen_at` · `last_seen_at`
- Unique `(client_id, platform, short_code)` · Index `(client_id, handle, posted_at desc)` · RLS: service role only.

---

## Admin & audit

### impersonation_audit_log
Super-admin sessions and actions taken in an agency (also Admin changes). *0027_impersonation, 0062*
- `id` uuid PK · `operator_id` → auth.users · `target_org_id` → organizations · `event_type` check session_started/elevated_mode_entered/write_action/session_ended/admin_action · `detail` jsonb · `occurred_at`
- Indexes: `operator_id`, `target_org_id` · RLS: service role only.

---

## Media caches

Global caches keyed by media URL, with no client or agency on the row.

### media_facts
Measured duration and stream facts of a media URL. *0059*
- `url` text PK · `duration_seconds` · `video` jsonb `{fps, frames, width, height}` · `audio` jsonb `{channels, sampleRate}` · `measured_at`
- RLS: service role only.

### media_transcripts
Word-level transcript of a media URL (Auto captions). *0060*
- `url` text PK · `language` · `words` jsonb · `engine` · `model` · `duration_seconds`
- RLS: service role only.

---

## Views

All three are service role only since 0063 (revoked from anon and authenticated, `security_invoker = true`). Before 0063 they were readable with the anon key across agencies.

### review_queue_items
Active image/video versions with their client, canvas and approval fields. *0031, redefined 0032*
- Joins `nodes` (type in image-gen, video-gen) → active `node_versions` → `canvases` → `clients`.
- Columns: org_id, client_id/name/slug, canvas_id/name/slug, node_id, node_type, node_title (`data->>'title'`), version_id, output, approval_status, note, operator_user_id, operator, created_at, approved_at, approved_by_user_id, approved_seen_at
- Read by `src/lib/db/review.ts` and `org_review_counts`.

### org_credit_usage
Credits used this UTC month per agency (`sum(amount)` of credit_transactions). *0019*
- Read by `getOrgCreditUsage` (`src/lib/db/organizations.ts`).

### stuck_reservations
Reservations older than 50 minutes with no consumption or refund. *0021, redefined 0028, 0055*
- Columns: generation_id, org_id · Read by `trigger/reconcile-stuck-generations.ts`.

---

## Functions

"Invoker" functions keep Postgres's default execute grant, but run with the caller's rights, so for anon/authenticated the tables' RLS stops any write. The 0062/0063 functions are `security definer set search_path = public` and executable by `service_role` only unless noted.

### RPCs (called with `.rpc`)
| Function | Args → returns | Rights | Migration |
|---|---|---|---|
| `acquire_canvas_lock` | canvas_id, session_id, name, stale_seconds → bool | invoker | 0010 |
| `reserve_credits` | org_id, generation_id, amount → bool (locks the org row, checks the monthly limit, inserts a reservation) | invoker | 0020 |
| `org_monthly_credit_history` | org_id, months=6 → (month, credits_used), zero-filled | invoker | 0023, 0024 |
| `org_daily_credit_history` | org_id, days=30 → (day, credits_used) | invoker | 0025 |
| `org_yearly_credit_history` | org_id, years=5 → (year, credits_used) | invoker | 0025 |
| `org_credit_breakdown_by_type` | org_id, month_start, month_end → (type, credits) | invoker | 0023 |
| `org_credit_breakdown_by_model` | org_id, month_start, month_end → (model, credits) | invoker | 0023 |
| `org_review_counts` | org_id → (client_id, canvas_id, pending) | invoker; service role only (0063) | 0031 |
| `set_kb_image_analysis` | version_id, value → void | invoker | 0048 |
| `save_kb_output_keep_image_analysis` | version_id, output → void | invoker | 0050 |
| `set_kb_field` | version_id, path text[], value → void | invoker | 0050 |
| `script_review_move` | script_id, client_id, from, to, kind, actor_name → bool | invoker | 0054 |
| `script_review_share` | review_id, expected_latest, scope, doc, visuals, changes, shared_by, actor_name → jsonb | invoker | 0054 |
| `script_review_approve` | review_id, version_number, actor_name → text (any scope since 0058) | invoker | 0054, 0058 |
| `delete_client_script` | client_id, script_id → text (`deleted`/`not_found`/`has_canvas`/`shared`/`drawing`) | invoker | 0057 |
| `editor_generation_lock` | node_id → text (`editor`/`dub`/null) | invoker | 0059 |
| `get_membership_access` | user_id → (org_id, org_name, is_owner, access_given_at, permissions, clients jsonb) | definer, service role | 0062 |
| `transfer_agency_owner` | org_id, new_owner → void | definer, service role | 0062 |
| `create_agency_with_owner_invite` | name, slug, owner_email, token, by → uuid | definer, service role | 0062 |
| `accept_invitation` | token, user_id, display_name → (org_id, client_id, as_owner, invited_by) | definer, service role | 0062 |
| `list_agency_people` | org_id → people rows (name, email, status, permissions, invited client, client_ids) | definer, service role | 0062 |
| `find_user_by_email` | email → (user_id, org_id) | definer, service role | 0062 |
| `take_invite_send` | org_id, limit → bool | definer, service role | 0063 |
| `record_razorpay_payment` | order_id, payment_id → bool (locks the order, marks it paid, writes a negative `adjustment` once; false when missing or already paid) | definer, service role | 0066 |

### Used by RLS
- `auth_org_ids()` → setof uuid: the caller's agencies. Definer; executable by `authenticated` and `service_role` (0062).
- `auth_client_ids()` → setof uuid: the clients the caller may see: every client of an agency they own, and the clients they are on once access is given (0065). Every `org isolation` policy is `org_id in (select auth_org_ids()) and <the row's client> in (select auth_client_ids())`; `credit_transactions` instead needs an owner membership of the row's agency.
- `node_client_id(node)`, `version_client_id(version)`, `decision_client_id(decision)`, `moodboard_client_id(moodboard)`, `generation_client_id(node, avatar, script)` → uuid: the client a row belongs to, for rows that hold no client id (0065). Definer (the parent tables are closed to the browser), primary-key reads; executable by `authenticated` and `service_role`.

### Trigger functions
| Function | Trigger(s) | Migration |
|---|---|---|
| `touch_canvas_updated_at` | `nodes_touch_canvas`, `edges_touch_canvas` | 0008 |
| `touch_canvas_via_node` | `node_versions_touch_canvas` | 0008 |
| `enforce_last_owner` | `org_memberships_last_owner` (org_role) | 0012 |
| `set_node_version_org_id` | `node_versions_set_org_id` | 0030 |
| `set_moodboard_item_org_id` | `moodboard_items_set_org_id` | 0040 |
| `set_canvas_review_org_id` | `canvas_reviews_set_org_id` | 0047 |
| `set_editor_edit_org_id` | `editor_edits_set_org_id` | 0059 |
| `cascade_membership_permissions` (definer) | `org_memberships_cascade_permissions` | 0062 |
| `enforce_agency_keeps_owner` (definer) | `org_memberships_keep_owner` (deferred constraint trigger) | 0062 |
| `prepare_membership_client` (definer) | `membership_clients_prepare` | 0062 |
| `keep_node_on_its_canvas` | `nodes_keep_canvas` | 0062 |
| `keep_edge_on_its_canvas` (definer) | `edges_keep_canvas` | 0062 |

Dropped: `org_review_counts_for_types` (created 0062, dropped 0063).

---

## Types, Realtime, storage

- **Enum** `client_kb_job_status`: queued, researching, extracting, finalizing, succeeded, failed (0008).
- **Realtime publication** `supabase_realtime`: `client_kb_jobs` (0008), `generations` (0014), `credit_transactions` (0022), `node_versions` (0030), `moodboard_items` (0040). One channel per screen, filtered client-side (performance rule 3).
- **Storage bucket** `node-files` (public, 0004), legacy: nothing in the app uploads to it any more. Its `storage.objects` policies: `Public read node-files` (select, checks only `bucket_id`) stays, because old rows can still hold its public URLs. The insert and delete policies checked only `bucket_id` with no role, so the anon key could upload and delete; 0064 drops both, so writes are service role only (the one left is `removeObject` deleting an old supabase.co URL, `src/lib/storage/index.ts`). Every other file lives in Google Cloud Storage (`src/lib/storage/gcs.ts`), outside the migrations.

## Known leftovers

Kept on purpose for now; don't build on them.

- Legacy columns: `node_versions.approved_by` (never read), `node_versions.operator` (still the fallback maker name) and `decision` (read by eval), `node_version_annotations.frame_path` (always null since D249), `org_memberships.org_role` with its `org_memberships_last_owner` trigger (until the drop in D510).
- `generations.version_id` → node_versions and `generations.client_id` → clients have no `on delete` action (the default, no action); left as they are. `generations.user_id` and `canvas_reviews.created_by` have no FK.
- `node_versions.org_id` and `moodboard_items.org_id` are nullable and filled by trigger.
- `NODE_FILE_BUCKET` (`src/lib/nodes/file-constants.ts`) names the legacy bucket and has no reader.
