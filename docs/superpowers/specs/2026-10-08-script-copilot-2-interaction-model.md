# Script copilot · spec 2 — the interaction model, from 28 real outlines

**8 October 2026 · product input (the *what*) · feeds [spec 2](2026-10-08-script-copilot-2-generate-design.md) §5–§6**
Branch: `worktree-script-copilot`. Parent spec: [2026-10-07-script-copilot-design.md](2026-10-07-script-copilot-design.md) §5.
Source: `docs/sample-scripts/Jackfruit365_Reel_Script_Outlines_Oct26-Mar27.docx.md`, all 28 reels,
the plan table (§1) and the House spec (§2). Reel numbers are cited as R01–R28. "House spec" means
§2 of that document, whose rules now live in the brand KB.

---

## 0. What this is, and the finding

The demo starts from the seeded Reel 01. This document is what the copilot does for every other
reel: what it already knows, what it must ask, what it proposes, where research comes in, and in
what order, before it writes.

It was derived by listing every way the 28 outlines differ (§1), seeing which differences decide
others (§2), and keeping as questions only the ones nothing else decides (§3).

**The finding.** The parent spec's three questions (occasion, persona, angle) are close but cut in
the wrong place in four ways:

1. **Format must be asked.** It is not inferable from the occasion: Diabetes Awareness Month got a
   UGC option reel (R07) and a UGC review-first reel (R08); New Year got a Founder-led reel (R14)
   and a UGC option reel (R15). Whether the review comes first is tied to no occasion at all
   (Christmas R12 has it mid-reel; a weekend breakfast R10 has it first). And format changes the
   rest of the conversation: a Founder-led reel has no persona to pick and no review.
2. **"Occasion" is really "occasion or theme".** 13 of the 28 reels have no dated occasion
   (R03, R10, R11, R13, R17–R20, R22, R24, R26–R28). Their plan column holds a theme instead:
   FAQ, habit tips, myth-busting, on the road, family.
3. **Persona is asked only for UGC, and it settles the region.** The regional kit, the language
   lilt and the dishes follow from the persona's home, not from the plan's coarse region label.
4. **The meal moment belongs inside the angle, not after it.** Within one region the reels split:
   South reels put the flour in breakfast batter (R01, R10, R12) or in a bowl of curd at lunch
   (R04, R11, R18, R21). That one choice moves the time of day, the setting, the dishes and the
   spoon count, so each proposed angle has to say which it is.

The model below is therefore: **one question on what the reel is (format and occasion or theme),
one on who leads (UGC only), three proposed angles (with Market Research), one confirmation, then
the draft.**

---

## 1. Dimension inventory

Source key: **KB** = a House spec rule, now in the brand KB, the same for every reel. **Plan** = set
by the content calendar (the plan table, §1 of the outline document). **Team** = chosen per reel by
the writer. **Follows** = decided by another dimension (§2 says which).

| # | Dimension | Values across the 28 (reels) | Source |
|---|---|---|---|
| 1 | **Format** | UGC: R01, R04, R05, R12, R16, R19, R21, R25. UGC review first: R08, R10, R11, R17, R18, R26, R27. UGC option: R03, R07, R15, R22, R24. Founder-led: R02, R06, R09, R14, R20, R23, R28. Founder-led option: R13. | Plan |
| 2 | **Review placement** | Right after the hook, card at 3–13 s: the 7 review-first reels. Mid-reel, after STEP: R01, R03, R04, R05, R07, R12, R15, R16, R22, R24, R25. Later: R19 (after Q3), R21 (after BODY). None: all 8 Founder-led reels (R28: "James reads no customer quotes"). | Follows (format; later placements follow the angle) |
| 3 | **Occasion or theme** | Dated festival: R01 Navratri/Golu, R04 Kerala Piravi, R05 Diwali week, R12 Christmas, R16 Lohri/Sankranti/Pongal. Dated special day: R02 World Food Day, R06 World Diabetes Day, R14 New Year, R23 National Science Day, R25 Women's Day. Period or season: R07, R08 Diabetes Awareness Month, R09 awareness follow-up, R15 New Year week one, R21 Kerala jackfruit season. Everyday or family: R10, R11, R17, R26, R27. Content theme: R13 make-ahead breakfast, R18 habit tips, R19 FAQ, R20 myth-busting, R28 series wrap. On the road: R03, R22, R24. | Plan |
| 4 | **Post date** | On the day: R01, R02, R04, R06, R23. Just before or after: R05 (Sat before Diwali Sun), R12 (Thu 24 Dec for a Christmas-morning reel), R14 (Sat 2 Jan), R25 (Fri ahead of 8 Mar). A window: R16 (13–15 Jan). Every reel without a dated day posts on a Thursday (R03, R07–R11, R15, R17–R22, R24, R26–R28), except R13 (Tue). "Confirm in a Panchang": R01, R16. | Plan; follows from occasion |
| 5 | **Region (plan label)** | South: R01, R04, R10, R11, R12, R18, R21. North and West: R05, R08, R15, R17, R19, R22, R24–R27. Pan-India: R02, R03, R06, R07, R09, R13, R14, R16, R20, R23, R28. Every Founder-led reel is Pan-India. | Plan; sometimes follows from occasion (§2) |
| 6 | **Home: city and community** | Chennai R01; Thrissur R04, R21; Bengaluru R07, R10; Madurai R11; Kottayam, Syrian Christian R12; Hyderabad R18; Delhi R05, R25 (and R24's couple); Pune R08 (and R03's hotel); Mumbai R17; Lucknow R19; Surat R26; Ludhiana R27; Chandigarh R15; Nagpur R22; Punjab, Gujarat and Tamil Nadu together R16. Founder-led: the studio set, with B-roll kitchens (Delhi and South R02; six cities R28). | Follows (persona) |
| 7 | **Lead** | James: all Founder-led. UGC, from the House spec's recurring cast: Meenakshi R01 (and R16), Saraswathi R04, Neha R05, Rhea R07, Hemant R08, Shobha R10, Lakshmi R11, Mary R12, Arvind R03, Karan R15, Sneha R17, Venkat R18, Shabana R19, Rajan R21 (Saraswathi reacts to the review), Smita R22, Neeraj R24, Sunita R25, Mukesh R26, Harpreet R27. Core age 40–65; under 30 only in option reels (R07 Rhea 27, R15 Karan 29). | Team (the House spec's cast table already maps personas to reels, so for this plan it was a planning choice) |
| 8 | **Supporting cast and relationship** | Spouse: R01, R04, R08, R11, R12, R17, R18, R24, R26. Parent and adult child: R05 (mother visiting), R15 (mother, background), R25 (son). Extended family: R10, R12, R21, R27 (three generations). Neighbour: R19 (speaks), R21. A stranger with one line: R22 co-passenger, R24 waiter; silent: R03 waiter. By video call: R03 wife, R18 son, R26 mother. Nobody: R07. Three families: R16. Founder-led: nobody, or hands-only B-roll (R02, R13, R28). Children in the background only: R10, R27. | Team, proposed with the angle (it is usually the PAYOFF moment, §2) |
| 9 | **Setting and time of day** | Home kitchen or dining table in most UGC reels; courtyard R16, R21; shared aangan R19; hotel R03; train R22; dhaba R24; rented flat R07. Morning R01, R07, R10, R12, R17, R24; late morning R05; lunch R03, R04, R11, R18, R21, R22, R27; evening R08, R15. Founder-led: one fixed kitchen-style set, leaf green wall, "same styling and set as earlier reels" (R09, R13, R14, R20, R23, R28). | Follows (home, occasion, meal moment); Founder-led set is fixed |
| 10 | **Meal moment** | Breakfast: R01, R07, R10, R12, R13, R24. Lunch: R03, R04, R05, R11, R17 (dabba), R18, R21, R22, R27. Dinner: R08, R15 (before it). A roti meal, time unstated: R19, R25, R26. Everyday meals the day after: R16. None or several: R02, R06, R09, R14, R20, R23, R28. | Team, inside the angle; bounded by the KB's meal-timing rule |
| 11 | **Product use** | Batter: R01 dosa, R10 idli, R12 appam (to be confirmed). Curd beside the rice plate: R04, R11, R18, R21 (and R16's Tamil kitchen). Atta: R05, R08, R17, R19, R25, R26, R27 (and R16's Punjab and Gujarat kitchens; shown top-down in Founder-led R02, R06, R14, R20, R23, R28). Salted lassi: R03, R24. Curd cup: R22. Greek yogurt: R07. Curd and chaas shake: R15. Oats in curd: R13. None shown: R09. Spoons counted per person eating: R01 (2), R04 (2), R10 (2), R12 (4), R24 (2). | Follows (region and meal moment, by KB rules) |
| 12 | **Review theme** | Busy week R01; on a trip R03, R22; everyday ease R04; pack beside the atta R05; quick breakfast R07; reading the label R08; family breakfast unchanged R10; delivery R11, R26; traditions R12; curd or buttermilk R15; any family's kitchen R16; rushed morning R17; a habit tip R18; daily use R19; the whole family's meals R21, R27; away from home R24; nothing extra for the cook R25. | Follows (angle); must exist in the real review pool (open question 2) |
| 13 | **Proof lines used** | Claim card: all 28. Usage line: all but R09 (R18 rewrites it as "Tip 2: One level tablespoon"). Diet line: R01, R02, R05, R08, R14, R17–R19, R21, R26–R28. Ingredient line, full or short, VO or on screen: R02, R03, R06–R08, R10, R11, R13–R15, R17, R19–R22, R24, R26, R27. Study named: R01, R02, R06, R08, R09, R14, R18–R20, R23, R28. Origin ("Made in Kerala"): R04, R12, R21, every Kerala home. Outside the locked table: "Naturally high in soluble fibre" R06, R09; "Patented" R23; the study's design and size spoken in full R06, R23. | KB lines; which ones follows (format, home, angle) |
| 14 | **Disclaimers** | D1, D2, D4: all 28. D3: the 11 reels that name the study (row 13). | Follows (proof) |
| 15 | **Beat structure** | Always 9 rows, HOOK first, OUTRO last. UGC mid-review: HOOK INTRO STORY STEP REVIEW BODY PAYOFF PROOF OUTRO (R01, R03–R05, R07, R12, R15, R16, R22, R24, R25). Review first: HOOK REVIEW INTRO STORY STEP BODY PAYOFF PROOF OUTRO (R08, R10, R11, R17, R26, R27; R18 swaps STORY and INTRO). Theme-shaped UGC: R19 (HOOK STORY Q1 Q2 Q3 REVIEW PAYOFF PROOF OUTRO), R21 (adds TIP, drops PAYOFF). Founder-led: own middle labels (WHAT IT IS R02, R06; THE LIMITS or HONEST LINE R06, R09, R23; FOR FAMILIES R06, R20; PLACEBO, PUBLISHED, PATENTED R23). | KB (nine beats) plus follows (format, angle) |
| 16 | **Who speaks** | UGC: the lead, first person, English with the home's lilt (Tamil R01, R03, R11; Malayalam R04; Marathi R08, R17, R22; Telugu R18; Gujarati words R26; Punjabi R15, R27). Exceptions: R16 has a female narrator, not a persona; one-line extras R19, R22, R24. Founder-led: James; B-roll has no speakers. | Follows (format, persona) |
| 17 | **CTA and outro** | "Available on Amazon": default. "…where you can read the reviews": the 7 review-first reels. Festival greeting in the outro: R05, R12, R16, R25. Founder-led adds a CTA beat before the outro: "tomorrow, add one tablespoon" R02, "share it with your family" R06, R20, "make one tonight" R13, "start with one meal" R14, "at the door" R28. | KB (review-first outro) plus follows (format, occasion) |
| 18 | **Length, aspect, production** | 9:16; every outro ends at 50–52 s; AI-generated label; light warm acoustic music. | KB |
| 19 | **Watch-outs** | Every UGC reel: the persona says nothing about health. Then per combination: date checks R01, R16, R23, R25; product-use confirmations R03, R10, R12, R13, R15, R22; claim checks R04, R09, R12, R21, R23; brand and logo risks R03, R07, R15, R17, R22, R24; cultural and word checks R01, R04, R12, R21, R26; safety R22, R24; children R06, R10, R27. | Follows (all choices, against KB rules) |
| 20 | **Title and hook** | The title is the hook's on-screen line or close to it: R01, R03, R05, R08, R20, R28. Hook kinds: the occasion (R01, R04, R06, R12, R14, R16, R21, R23, R25), a situation (R03, R07, R10, R15, R17, R22, R24, R27), a prop (R08 label, R11 and R26 parcel, R18 tied spoon), a question (R09, R19, R20). | Follows (angle) |

**What the inventory shows.** Only five things are ever chosen: format, occasion or theme (with its
date), the lead, the angle, and inside the angle the meal moment and the supporting cast. Everything
else is a KB rule or follows from those.

---

## 2. Dependencies

| Driver | Decides | Grounded in |
|---|---|---|
| **Format** | Who the cast is (persona or James); set (home or the fixed studio set); whether there is a review and where; the beat pattern; the outro line; how heavily proof is used (Founder-led names the study in all but R13) | Rows 1, 2, 9, 13, 15, 17; R28 "James reads no customer quotes" |
| **Option modifier** | Audience (younger, or away from home); a setting outside the home; product use from the curd family only (curd, yogurt, lassi, chaas, soup); a brand-confirmation watch-out | House spec "Away from home and younger viewers"; R03, R07, R13, R15, R22, R24 |
| **Occasion** | Post date; sometimes region and community (Navratri → a South Golu, because it is a fasting period in the North, outline §4; Kerala Piravi → Kerala R04; Christmas → a Syrian Christian home R12; three harvest festivals → three regions R16); festival props (Golu steps R01, diyas R05, star lantern R12, kites and bonfire R16, wall calendar R14); the festival-food rule, so the flour stays in everyday food (R01 breakfast, R05 lunch phulkas, R16 cut to "Everyday" kitchens); an outro greeting (R05, R12, R16, R25); occasion watch-outs (R01 onion and garlic off screen, R05 no firecrackers, R06 Children's Day) | Rows 3, 4, 17, 19; House spec "Festivals" |
| **Persona (home)** | Regional kit: table, kitchen, wardrobe; language lilt and local words; the Origin line for Kerala homes (R04, R12, R21); community markers (R12: no bindi, cross pendant) | Rows 6, 13, 16; House spec "Regional kits", "Dress, home and words" |
| **Region + meal moment** | Product use: South breakfast → batter; South lunch → curd beside rice; North and West lunch or dinner → atta; away or younger → lassi, curd, yogurt | House spec "Regional rules", "Meal timing"; row 11 |
| **Meal moment** | Time of day, dishes, setting (R05 "keep the scene in late-morning lunch prep"; R24 "a paratha with curd is a breakfast stop") | Rows 9, 10 |
| **Cast at the table + batter** | The spoon count said in the STEP line (R01 "Two of us at breakfast, so two spoons"; R12 "Four spoons in all") | Row 11; outline §3 "Usage methods" |
| **Angle** | Hook and title; STORY and PAYOFF; review theme; the supporting cast's role (R19 neighbour, R22 co-passenger, R25 son); sometimes the beat labels (R18 tips, R19 Q1–Q3, R21 TIP); proof emphasis (R08, R19 are about reading, so the study is named) | Rows 8, 12, 13, 15, 20 |
| **Proof choice** | D3 on or off | Row 14 |
| **Product use** | Confirmation watch-outs (R10 idli batter method, R12 appam, R13 oats, R15 protein shake, R03 and R22 travel pack) | Row 19; outline §3 |

The supporting cast is chosen for the PAYOFF. In 16 of the 20 UGC reels the PAYOFF is a moment with
the second person: the husband eyeing the rice pot (R11), the son serving the mother (R25), the
curious uncle (R22) and waiter (R24), the neighbour's "worth a try" (R19), the call home (R03, R18,
R26). So the second person comes with the angle, not with the persona question.

---

## 3. The interaction model

### 3.0 For the demo: four pieces, any skippable *(decided 8 Oct 2026; governs §3.2)*

Before writing, a script needs four **pieces**. The copilot asks for each one the person has not
given, in this order, and the person may skip any of them, or all of them ("take the narrative and
generate the rest"), in which case the copilot proposes every missing piece itself.

| # | Piece | What it decides | If skipped |
|---|---|---|---|
| 1 | **Format** (offered from the client's library: UGC, UGC review first, Founder-led; option as a tick; or the person's words) | Beat sequence; review or none, and where; whether a lead is needed; the outro line; what angles look like | Inferred from the narrative |
| 2 | **Occasion or theme**, with date | Date window, festival props and customs, the research topic | Proposed from the narrative or the season |
| 3 | **Lead** (UGC only; Founder-led is James) | Region, kitchen kit, dishes, accent, wardrobe | Proposed from the client's Avatars and the region |
| 4 | **Narrative** (the angle) | Situation, meal moment and product use, supporting cast, review theme, hook and title | Three proposed, from pieces 1–3 and Market Research |

Everything else is derived, never asked: aspect, length, production, locked lines, disclaimers,
kit, beat lengths (formats, slots and tools §2). Pieces can come in any order or all at once.
Every path ends on the confirmation card (§3.5), which marks each piece as **given** or
**proposed**. After the draft, fill to final (§3.6a) still asks for what only the person can
supply.

§3.2's question table below is the same content, read as questions; where they differ, this
section wins.

### 3.1 What the copilot states first

When a new script opens, the copilot says in two or three lines what it is working from, so the
person does not re-state it:

- **The client's rules** from the brand KB: locked claim and proof lines, the four disclaimers and
  when each applies, the never-list, the regional rules and kits, the review rules, the recurring
  cast, and the AI-generated label.
- **The format the client uses**: 9:16, 45 to 55 seconds timed to about 50, nine beats, the claim
  card held 3 seconds.
- **The formats seen in the client's scripts**: for Jackfruit365, UGC, UGC review first, UGC option,
  Founder-led, Founder-led option.

It then asks the first question.

### 3.2 The questions, in order

| # | Question | Asked when | Why nothing else answers it |
|---|---|---|---|
| **1** | **What is this reel?** The format and the occasion or theme, with the post date if the person has one. | Always, unless the first message says it ("Reel 04, Kerala Piravi, UGC") | It is the plan's row (§1 rows 1, 3, 4). The same occasion went to different formats (R07, R08; R14, R15), review-first is tied to no occasion, and 13 reels have a theme, not an occasion. It also decides whether question 2 exists. |
| **2** | **Who leads?** The copilot offers the recurring personas who fit, and "cast it for me". | UGC only. Founder-led skips it: the cast is James. | Several personas fit any one occasion and region (South alone has Meenakshi, Shobha, Lakshmi, Venkat and Sridevi, Rajan and Saraswathi, Mary and Thomas). The choice fixes the home, so the kit, the language and the dishes. |
| **3** | **Which angle?** The copilot proposes three. The person picks one, blends two, or writes their own. | Always | The angle is the reel's idea. It is the one thing the outlines show the team inventing per reel (rows 8, 10, 12, 20). |

Rules on the questions:

- **Never ask what the person has already said** (spec 2 open question 4, option b).
- **If only the occasion is given**, the copilot asks for the format and says which format the
  client's past scripts used for similar topics (proof and study topics went to Founder-led:
  R06, R09, R20, R23; family moments to UGC).
- **If the person says "cast it for me"**, questions 2 and 3 merge: each proposed angle carries its
  own lead and supporting cast.
- **Region is never asked.** It comes from the plan if the person gives it, from the occasion when
  the occasion fixes it (R01, R04, R12), or from the persona's home.

Order: question 1 decides whether question 2 exists and what kind of angles question 3 offers.
Question 2 comes before 3 because each angle is built from the persona's home and household.
Question 3 is last because Market Research needs the occasion and the region to look anything up.

### 3.3 What each proposed angle is built from

Each of the three options is one or two sentences, followed by what that option commits to, so
the person picks with the consequences in view:

| Part of an option | UGC | Founder-led |
|---|---|---|
| The situation | A human moment at the occasion: "nine nights of guests, and the kitchen doesn't close" (R01) | A topic type: how-to (R02, R13), what it is and where the claim comes from (R06), the study (R09, R23), a habit (R14), a myth (R20), a series wrap (R28) |
| Meal moment and product use | Named, by the KB's region and meal-timing rules (breakfast batter or lunch curd in the South) | Which uses the B-roll shows (atta only, or atta, batter and curd as in R02, R20, R28) |
| Supporting cast | Who else is there and what they do at the PAYOFF | B-roll hands only, or none |
| Review theme | The kind of review to find (row 12) | None |
| Proof emphasis | Whether the study is named (so D3), whether Origin applies | Usually the study named; which explainer beats |
| Hook line | The proposed title | The proposed title |

Options are built from the occasion, the persona's household and kit, the KB's product-use rules,
the format's beat pattern, and Market Research (§3.4). The three should differ in the situation,
and in the meal moment where the region allows it.

### 3.4 Market Research

**Where it runs:** at question 3, before the three angles are proposed. When and over which signals
stays spec 2's open question 5.

**What it contributes:** the situation and texture of an angle — what people in that region do and
post around this occasion or theme, at what time of day, in what setting. This matches how signals
already shape a script parse: where and when only (D255).

**What it never contributes:** claims, proof, health language, product uses or disclaimers. Those
come only from the KB, and the KB outranks any signal.

**What the person sees:** the card spec 2 §6 describes, naming the signals read and what each angle
took from them.

The outlines also lean on three sources that are not market signals: the real review pool, festival
dates, and the brand's usage confirmations. Market Research does not cover them (§5, questions 2,
3 and 5).

### 3.5 The confirmation

After the angle is picked, the copilot shows the brief it will write from, as one short card, and
asks one thing: write it, or change a line. The card lists:

- format, post date, occasion or theme, proposed title;
- region, home and kit;
- the cast, with the lead marked and each person's role;
- meal moment, product use and the spoon count;
- review theme and placement (UGC);
- the proof lines it will use, and so the disclaimers (D3 or not);
- the items to confirm. Each one must be resolved before Mark final (§3.6a); once confirmed it
  may stay in the script as a watch-out note (§1 row 19).

Nothing on the card is a new question; each line is already decided by §3.2 or §2. The card is
where the person catches a wrong inference before 50 seconds of script are written on it. The
confirmed brief is what the reel's own notes start from *(assumed — open question 7)*.

### 3.6 What it writes

The script in spec 1's shape (spec 2 §7), each part traced to its source:

| Part of the script | Comes from |
|---|---|
| Header | Question 1, the proposed title, the KB's length and aspect |
| Purpose | The picked angle |
| Cast | Question 2 and the angle's supporting cast, each described from the recurring cast and the kit's wardrobe |
| Setting and camera | Home and kit, occasion props, meal moment, the KB's light, props and camera rules |
| Shots | The format's beat pattern, filled from the angle; locked lines verbatim; the review beat as a placeholder with its theme **in the first draft only** (§3.6a fills it) |
| Disclaimers | The proof lines used |
| Watch-outs | The KB rules that apply to this combination, plus the items to confirm |

### 3.6a Fill to final *(added 8 Oct 2026, spec 2 open question 7)*

**Final means ready for the client to read.** So the draft from §3.6 is not the end of the
conversation. Once it is written, the copilot lists every piece that is not yet client-ready and
asks one targeted question per piece, until the list is empty. "Mark final" stays unavailable
while anything is on it.

What is on the list:

| Not yet client-ready | The question the copilot asks |
|---|---|
| A section that is missing or empty: header, Purpose, Character, Setting and camera, the shot table, Watch-outs | Asks for what it can't infer, or proposes the text to accept |
| Disclaimers, when one applies | Proposes the disclaimers the KB says apply; when none applies, the script says so explicitly |
| A shot with no beat, length or visual | Proposes it |
| A shot whose VO or on-screen text is empty (every row in all 28 outlines has both) | Proposes the line or the card |
| A placeholder, such as the review beat's "[real review, verbatim]" | "Paste the cleared Amazon review for this theme" (open question 2) |
| A date or custom to confirm, such as a festival day | "Confirm Sun 11 Oct is the first day of Navratri" (open question 3) |
| A proof line that is not cleared | "Is this line cleared?" or swap for a locked line (open question 4) |
| A product use the brand has not confirmed | "Confirm the brand is happy with this use" (open question 5) |

The list lives with the script, so a person who comes back later sees what is still open
*(assumed — open question 7: the reel's own notes hold the brief and the open items)*.

### 3.7 How the format changes the flow

| Format | Question 2 | Angles offer | Fixed by the format |
|---|---|---|---|
| **UGC** | Asked | Situations, each with a meal moment and supporting cast | Review mid-reel after STEP; outro "Available on Amazon" |
| **UGC review first** | Asked | Situations whose hook sets up a review: a parcel (R11, R26), a label (R08), a tied spoon (R18) | Review card right after the hook; outro "…where you can read the reviews". The copilot notes that the reel depends on one real review (outline §3 "Review pool"). |
| **UGC option** | Asked, offering away-from-home or younger personas (Arvind, Rhea, Karan, Smita, Neeraj and Pooja) | Away-from-home or younger situations | Product use from the curd family only; a watch-out to confirm the use with the brand |
| **Founder-led** | Skipped: James | Topic types, each with its own middle beats | Studio set; no review; a CTA beat before the outro; usually the study, so D3 |
| **Founder-led option** | Skipped: James | Topic types for younger or away-from-home viewers (R13: overnight oats) | As Founder-led, with the option's product-use limit and hands-only B-roll |

Reels with several homes (R16 three families, R28 six kitchens) need a kit per segment, and R16 needs
a lead chosen among three families (open question 6).

---

## 4. Worked examples

### 4.1 Reel 01 · UGC · South · Navratri

**Opening.** The copilot states the KB rules and the format (§3.1).

**Question 1.** The person: "A Navratri reel, UGC." The copilot proposes Sun 11 Oct, the first day,
to be confirmed in a Panchang. Because Navratri is a fasting period in the North (outline §4), it
proposes a South Golu, so the region follows from the occasion. Not review first, so the review
goes mid-reel.

**Question 2.** It offers the South personas from the cast who could keep Golu, noting the
outline's own caveat that Golu is "kept in many Tamil, Telugu and Kannada homes, not all":
Meenakshi (Chennai), Shobha (Bengaluru), Venkat and Sridevi (Hyderabad). The person picks
Meenakshi. Home: Chennai, the Tamil Nadu kit (kuthuvilakku, iron tawa, Golu steps in Navratri;
cotton saree, silk and zari for festive hosting); a Tamil lilt.

**Question 3.** Market Research runs on Navratri and the South. Three angles, of which only (A) is
in the outline; (B) and (C) are built from the same parts to show the spread:

- **(A) "Nine nights of guests, and the kitchen doesn't close."** First Golu morning; breakfast is
  dosa and sambar; the flour goes into the batter. Husband at the table. Review: fitting the habit
  into a busy week. Study named.
- (B) Lunch on a Golu day: the guests get sundal, the family gets its everyday rice with a bowl of
  curd. *(illustrative)*
- (C) Getting the Golu steps ready while breakfast batter waits: the routine that does not move for
  a festival. *(illustrative)*

**Confirmation and draft.** Picking (A) produces the real outline's parts:

| Answer | Produces in Reel 01 |
|---|---|
| Navratri | Date Sun 11 Oct; Golu of five or seven steps with marapachi bommai; sundal, no mithai; onion and garlic off screen; Panchang watch-out |
| UGC, not review first | The UGC beat pattern; REVIEW at 25–33 s after STEP; outro "Available on Amazon" |
| Meenakshi, Chennai | Cast description from the recurring cast; kuthuvilakku, iron dosa tawa; "Easy, amused English with a Tamil lilt" |
| Angle (A) | Hook "Golu starts today"; INTRO "festival week is busy"; review theme "fitting the habit into a busy week"; PAYOFF lighting the lamp, the silk saree waiting for the evening |
| Breakfast → dosa batter (KB) | STEP "One level tablespoon… Two of us at breakfast, so two spoons"; BODY dosas, sambar, chutney, podi |
| Husband at the table | Second cast member, in a veshti; on screen in STORY and PAYOFF; the spoon count of two |
| Study named (the angle's proof) | PROOF "Clinically tested. Nutrition & Diabetes, 2021", so D3 with D1, D2, D4 |
| KB rules | Claim card, usage and diet lines verbatim; "Meenakshi never says her family's sugar is in check" |

### 4.2 Reel 06 · Founder-led · Pan-India · World Diabetes Day

**Opening.** As above, plus: the Founder-led cast is James, labelled as an AI avatar, no white coat;
the set is the kitchen-style set with the leaf green wall.

**Question 1.** The person: "World Diabetes Day, from James." Format Founder-led, date Sat 14 Nov,
region Pan-India. **Question 2 is skipped.**

**Question 3.** Market Research runs on World Diabetes Day. The three angles are three topic types;
the series itself used all three (R06, then R09 and R20):

- **(A) What it is, how it's used, and where the claim comes from. No scare, no hype.** (R06)
- (B) The study in plain words: what randomised, double-blind and placebo-controlled mean. (R09)
- (C) "Do I have to give up roti or rice?" (R20)

**Confirmation and draft.** Picking (A):

| Answer | Produces in Reel 06 |
|---|---|
| World Diabetes Day | Hook "Today is World Diabetes Day"; watch-out "14 Nov is also Children's Day. Don't tie the reel to children" |
| Founder-led | James alone at the counter; static camera, slow push-in on the claim card; no review; outro "Available on Amazon" |
| Angle (A) | Middle beats WHAT IT IS, STEP, WHY NO CHANGE, HONEST LINE, FOR FAMILIES; CTA "Share it with your family" |
| Pan-India, roti and rice | INTRO cut to rice and rotis on steel plates; STEP shows the atta |
| Study named | PROOF with the study's design and the journal; D3 with D1, D2, D4 |
| KB rules | Ingredient and usage lines verbatim; HONEST LINE "Individual results may vary" from D1; "No result numbers on screen"; "No white coat, stethoscope or lab backdrop" |
| Not from the KB | "Naturally high in soluble fibre" and "40 people with type 2 diabetes" are not in the locked table (open question 4) |

---

## 5. Gaps and open questions

Things in the outlines the model cannot produce from the KB, the plan and the answers.

1. **Where does the reel plan live?** The plan holds each reel's format, occasion, date, region and often its lead (§1 rows 1, 3–5, 7), plus series balance ("every month has an Avatar reel, a UGC reel and an occasion reel"). (a) The person states the slot in the chat each time. (b) A client reel plan the copilot reads. (c) The plan pasted into the brand KB. *Recommendation: (a) now; (b) with the series level (parent open question 2).*

2. **How does the copilot know a review exists for a theme?** The House spec says "if none exists for a theme, swap the theme or hold the reel", and 20 reels need one. (a) Placeholder and theme only; the team checks. (b) A client pool of cleared reviews the copilot proposes themes from. (c) The team pastes the cleared review before angles. *Recommendation: (a) for the demo, (b) after.*

3. **Who checks festival dates and customs?** Dates disagree across sources (R16) and need a Panchang (R01); customs such as onion and garlic off screen (R01) are in no KB. (a) The copilot proposes them and writes a "confirm" watch-out. (b) Dates come only from the plan. (c) A date-check tool. *Recommendation: (a).*

4. **May the copilot use proof lines outside the locked table?** R06 and R09 use "Naturally high in soluble fibre", R23 "Patented", R06 and R23 the study's size. (a) Locked lines only. (b) Allowed, with a "to clear" watch-out. (c) The KB gets a list of cleared but unlocked lines. *Recommendation: (c), so legal decides once.*

5. **May the copilot propose product uses the brand has not confirmed?** Appam batter (R12), oats (R13), a protein shake (R15), a travel pack (R03, R22); and the brand's FAQ on reducing rice sits badly with "No change to your diet" (outline §3). (a) Only uses the KB names. (b) Others, with a "confirm with the brand" watch-out, as the outlines do. *Recommendation: (a) once the KB holds the usage guide; (b) until then.*

6. **Who is the lead in a reel with several households or a narrator?** R16 has three families and a female narrator who is no persona; Bhavna reacts to the review. (a) The person who reacts to the review. (b) The copilot asks. (c) A narrator is a voice-only cast member and the lead. *Recommendation: (b).*

7. **What do a reel's own notes hold?** (a) The confirmed brief (§3.5) and the items to confirm. (b) Only what the person adds. *Recommendation: (a), so the reel keeps why it was written this way.*

8. **Where do formats come from for a client with no scripts yet?** (a) The copilot asks for the format in the person's words. (b) The client's formats are written into the brand KB. *Recommendation: (b), since question 1 depends on them.*
