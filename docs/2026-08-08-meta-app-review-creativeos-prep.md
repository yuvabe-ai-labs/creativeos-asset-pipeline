# Meta App Review — CreativeOS prep checklist

Personal reference. Things CreativeOS/engineering needs to have ready before submitting
for App Review — not the business-side list (that's separate, for the CEO / Business
Verification).

## Build / product

- [ ] CreativeOS deployed somewhere reachable from the internet (not localhost) — the
      testing-instructions field requires a real URL reviewers can open.
- [ ] A working demo/test CreativeOS login (email + password) that can reach the publish
      feature — reviewers log into our app first, not Facebook, since there's no public
      signup.
- [ ] That test account has a client + a Post node set up, with a Facebook Page already
      connectable, so the flow is actually reachable end to end.
- [ ] App icon — JPG/GIF/PNG, will be cropped to square, under 5MB.

## Content to write

- [ ] Step-by-step testing instructions (exact clicks: log in → open client → open Post
      node → Publish to Social → Connect Facebook → select Page → caption → Publish).
      Must explicitly confirm Facebook Login is used for the connect step.
- [ ] Screencast: a real person walking through connect → post/schedule, start to finish.
- [ ] One written use-case description per permission, explaining why the app needs it:
  - `pages_show_list`
  - `pages_read_engagement`
  - `pages_manage_posts`
  - `instagram_basic`
  - `instagram_content_publish`
- [ ] Answers ready for Meta's data-handling questions: what's stored (Page name, post
      content, images, captions), how long, who can access it.

## Pages that need to exist publicly

- [ ] CreativeOS landing page (if none exists yet) to host the two below.
- [ ] Privacy Policy — names "CreativeOS" specifically, describes how Meta API data is
      handled, publicly reachable, no login wall.
- [ ] Terms & Conditions — same accessibility requirement.

## Basic Settings fields to fill in (developers.facebook.com, app Basic Settings page)

- [ ] Privacy policy URL
- [ ] Terms of Service URL
- [ ] Category
- [ ] Contact email
- [ ] App icon upload
- [ ] Testing instructions section:
  - "Where can we find the app?" → the live URL
  - Access instructions (see above)
  - "Is Facebook Login integrated?" → **Yes**
  - Access codes / test credentials → the demo CreativeOS login
  - Payment gift codes → mark **not applicable** (web app, no app-store distribution)
  - Geo-restriction bypass → mark **not applicable** (no geo-blocking)

## Not on this list

Business Verification documents, legal business name decision, business address/phone —
that's the CEO's list, tracked separately.
