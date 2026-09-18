# Adoption & behavioral-design strategy — "סיגמה" field flow, gaps, day log, digests

Date: 2026-09-18. Basis: `2026-09-17-kibbutz-cards-redesign-design.md` §5 (field flow + push pool), §7h (settings/gaps),
§7i (יומן היום), §7j (usage analytics), §7 (feedback); `2026-09-17-unified-inventory-design.md` §5 (alerts).
Audience: עידן (product owner), for the implementation chunks in the cards-redesign execution plan (§8).

---

## 1. Diagnosis — why reporting discipline fails today (behavioral, not technical)

The spec already names the technical symptom ("field workers forget to file visit summaries, stock reports are
unreliable"). The behavioral causes underneath, using Fogg's B=MAP (behavior = Motivation × Ability × Prompt —
[thebehavioralscientist.com](https://www.thebehavioralscientist.com/articles/fogg-behavior-model)) and Eyal's Hook
model (trigger → action → reward → investment —
[amplitude.com](https://amplitude.com/blog/the-hook-model)):

| Cause | Mechanism | What in the spec already addresses it |
|---|---|---|
| **No prompt at the moment of ability.** The technician's phone-in-pocket moment is at the kibbutz gate, not at a desk later. By the time he "remembers," the context (what he actually did) has decayed and ability has dropped (harder to reconstruct = higher friction = B=MAP fails on Ability). | Fogg: prompt must arrive when motivation+ability are highest, not on a fixed clock unrelated to context. | §5.1 arrival check-in fires the briefing at arrival, not at a fixed hour — the prompt rides the moment the worker is already there. |
| **No immediate reward, only downstream punishment risk.** Filing a summary today has zero visible payoff for the technician; the payoff (clean stock, no phone calls) accrues to עידן/עמיחי weeks later. Eyal: without a reward at the action, the loop never becomes a habit, it stays a chore. | §5.2's copy pool explicitly reframes the reward as *near-term relief* ("שקט נפשי", "לישון טוב") rather than a distant business outcome — this is the single most important design correction. |
| **Free text = high ability cost.** A blank "סטטוס ומשימות" textarea is a high-friction action (no scaffold, no memory aid) — Fogg's model predicts avoidance whenever ability is low, no matter how motivated the person is. | §7i יומן היום replaces the blank box with dictation/paste + AI structuring — ability cost collapses from "compose a report" to "talk for 30 seconds." |
| **No stock discipline because no linked accountability.** Free "adjust" fields let numbers drift without a trace back to a cause — nothing to trigger an honest recount. | Inventory spec §4b removes free adjust entirely; every stock change must resolve to visit/order/recount — this is a structural (not motivational) fix, the right layer for unreliable reporting per עידן's own framing ("ללא שיוך לעובד לאור פער ביכולת דיווח"). |
| **Threat-based nudges suppress the behavior they target.** A "the visit doesn't count without this" message triggers avoidance/shame, which in a 6-person trusted team damages the relationship faster than it fixes the report. | §5.2 D6 is explicit: positive-only, no threat line — correctly diagnosed already; the risk is in execution (see §3 below on tone drift over time). |
| **No feedback loop for the person doing the work.** Field workers cannot see their own gaps; only עמיחי's admin view showed missing days before this redesign — so the miss is invisible to the one person who could act on it fastest. | §7h פערים שלי gives אביאם/ניתאי their own gap list with a one-tap close action — moves the locus of correction from manager-nag to self-serve, which is both faster and less socially costly. |

**Net diagnosis:** the failure is not "people don't want to comply," it's a classic B=MAP triple-miss — wrong-time
prompt, high-ability-cost action, absent-or-negative reward. The spec's redesign already targets exactly these three
levers; the job below is to make sure execution (copy, cadence, thresholds) doesn't quietly reintroduce a threat
frame or notification fatigue, which is the most likely way this ships correctly and still fails in month 2.

---

## 2. Top 10 adoption levers, ranked

1. **Context-triggered prompt over clock-triggered prompt** (arrival check-in → 2h push, §5.1–5.2).
   *Mechanism:* Fogg's Prompt must coincide with peak Motivation/Ability; a person just leaving a kibbutz is at peak
   recall and lowest cost-to-report. *Evidence:* [Fogg Behavior Model](https://www.thebehavioralscientist.com/articles/fogg-behavior-model).
   *Maps to:* `field_checkins` + `visitCron` 15-min gate (spec §5.2). *Risk:* if check-in itself is skipped (worker
   forgets to tap "arrived"), the whole chain never fires — needs a fallback trigger (see §4 job list, "check-in").

2. **Reduce action cost to near-zero via dictation + AI splitting** (יומן היום, §7i).
   *Mechanism:* B=MAP — the intervention that reliably works is cutting Ability cost, not raising Motivation (people's
   motivation is already at the ceiling most days; forcing more of it is what fails). *Evidence:*
   [Tiny Habits / Fogg](https://www.easyhabits.io/blog/tiny-habits-bj-fogg) — "increasing ability is more effective and
   more sustainable than motivation campaigns." *Maps to:* free-text/voice → `parse-daylog` → editable per-kibbutz
   cards. *Risk:* if the AI's confidence is low often (jargon, kibbutz-name ambiguity), the "editable card" becomes a
   second form to fill, re-adding the friction it was meant to remove — the confidence threshold and unmatched-text
   handling need real fixtures, not just the 5 golden ones, before trusting it in month 1.

3. **Reward reframed as near-term personal relief, not distant business KPI** (positive push copy pool, §5.2).
   *Mechanism:* Hook model's Reward stage — an intermittent, personally-relevant payoff ("שקט נפשי", "אתה חופשי")
   sustains repeat behavior far better than an abstract organizational payoff. *Evidence:*
   [Amplitude — Hook Model](https://amplitude.com/blog/the-hook-model). *Maps to:* the 15-variant pool already written
   in the spec. *Risk:* **novelty decay** — Duolingo's own data shows copy needs continuous rotation/testing because a
   fixed pool eventually reads as noise (see lever 6). 15 variants for a person who checks in most workdays exhausts
   the pool in 3 weeks; needs either a larger pool or seasonal refresh, not a "ship and forget."

4. **Self-serve gap visibility instead of manager-issued nags** (פערים שלי, §7h).
   *Mechanism:* moves correction from external social pressure (which breeds resentment in a 6-person team where
   everyone already knows everyone) to self-monitoring, which BJ Fogg and habit research treat as more durable because
   it doesn't require someone else's ongoing effort. *Evidence:* [Fogg Behavior Model](https://www.thebehavioralscientist.com/articles/fogg-behavior-model)
   (autonomy sustains behavior after the prompt is removed). *Maps to:* `gapsFor()` per-person list + one-tap close
   action. *Risk:* if only עמיחי/עידן ever look at it and the field worker never opens ⚙️ הגדרות, the lever is inert —
   needs its own arrival-time surfacing (e.g., a badge on the bottom nav), not just a settings sub-page.

5. **Idempotent, capped nudges (no repeat threat escalation)** (`visitCron`, one nudge, no second — D6).
   *Mechanism:* frequency capping prevents opt-out; research shows users unsubscribe once frequency/relevance crosses
   a threshold. *Evidence:* practical cap is ~1 behavioral push/day, and 46% of users opt out after 2–5 low-relevance
   messages in a week — [MoEngage/industry synthesis](https://www.pushwoosh.com/blog/push-notification-best-practices/).
   *Maps to:* single 2h nudge already scoped as "one nudge, no second" (§9 D6). *Risk:* as more surfaces get their own
   pushes (gaps, stock digest, feedback receipts, weekly narrative) the *per-person total* daily push count needs a
   global cap — the spec scopes each feature's cadence individually but never sums them (addressed in §3 below).

6. **Copy variety keyed to a stable random seed (not per-send randomness)** (`hash(checkin id) mod N`, §5.2).
   *Mechanism:* Duolingo's notification system explicitly varies copy and matches emotional intensity to actual
   inactivity cost — pattern-breaking, non-generic messages outperform repeated identical ones.
   *Evidence:* [Duolingo notification teardown](https://www.digia.tech/post/duolingo-habit-forming-reminders-retention-architecture/).
   *Maps to:* the 15-variant pool, seeded by check-in id so a re-send to the same event stays consistent but different
   days differ. *Risk:* Duolingo's escalation model *increases* intensity with inactivity length — עידן explicitly
   rejected that ladder (positive-only). That's the right call for a 6-person trusted team (see §6), but it means this
   lever tops out lower than Duolingo's — don't try to import their escalation curve later "because it works for them."

7. **Structural removal of the free-adjust escape hatch** (inventory §4b: every stock change must resolve to
   visit/order/recount).
   *Mechanism:* this is not a nudge, it's a forcing function — Fogg's model still applies (it raises the *ability* to
   report honestly and *removes the ability* to skip accountability), and it doesn't depend on any single person's
   motivation on a given day. *Evidence:* general behavior-design principle that structural constraints outperform
   reminders when the failure mode is drift, not forgetting — same logic Slack/Linear apply by making certain states
   simply unreachable rather than warning against them ([Linear empty-state pattern discussion](https://usertourkit.com/blog/empty-states-that-convert-onboarding-design-patterns)).
   *Risk:* if "recount" becomes the default escape hatch for every discrepancy (because it's easier than tracing a
   real visit/order), it silently becomes the new free-adjust — the required note field only helps if someone reads
   the notes; the digest (§5.2 inventory) should flag repeated recounts on the same product as a signal, not just log them.

8. **Twice-daily digest for the manager instead of instant per-event pings** (inventory digest 12:00/17:00 to עמיחי).
   *Mechanism:* batching reduces notification fatigue for the *observer* role while `low_stock` alerts stay instant
   for the actionable case — separates "FYI" from "act now," which is the single biggest lever for opt-in survival.
   *Evidence:* [Braze — push best practices on batching vs. real-time](https://www.braze.com/resources/articles/push-notifications-best-practices).
   *Maps to:* `inventoryDigest` mode, `digestWindow()`. *Risk:* none major — this is well-designed already; the only
   gap is that the digest's tone must stay descriptive ("what moved") not evaluative ("who's behind") or it slides
   into the surveillance frame (§6).

9. **Weekly usage narrative in sentences, not a table** (§7j `usageNarrative`).
   *Mechanism:* Fogg/Eyal both note that *feedback to the person driving the system* (here, עידן) needs to be
   actionable and story-shaped to change what he does next, not just descriptive; a sentence like "ניתאי לא השתמש
   בעמוד המשימות כלל השבוע" prompts a specific 1:1 conversation instead of a dashboard stare. *Evidence:*
   [Fogg Behavior Model](https://www.thebehavioralscientist.com/articles/fogg-behavior-model) — prompts that specify
   the next action outperform raw data. *Risk:* this is the highest-risk feature in the whole spec for backfiring into
   surveillance — see §6. It must never be seen by the field workers themselves in its raw form, and framing matters
   enormously (§5 below).

10. **WhatsApp-adjacent voice-first input** (Web Speech API / Groq Whisper fallback, §7i, §7).
    *Mechanism:* meets Israeli field workers where their existing communication habit already is — voice notes are
    the default medium in Israeli workplace culture, so dictation-first input rides an existing habit rather than
    building a new one from scratch (lowest-resistance channel available). *Evidence:*
    [Times of Israel — WhatsApp as Israel's business platform](https://blogs.timesofisrael.com/how-whatsapp-became-israels-unofficial-business-platform/)
    (voice messages are the default relationship medium in Israeli business communication). *Risk:* if the in-app mic
    UX has any extra friction versus just voice-noting the office WhatsApp group (which is presumably still open on
    the same phone), field workers will default back to WhatsApp and the AI pipeline never gets fed — the entry point
    (📝 יומן היום button) needs to be at least as fast as opening WhatsApp, ideally reachable from the same
    lock-screen/notification tap as the reminder push itself.

---

## 3. Notification strategy

### 3.1 Per-person daily caps (across ALL surfaces combined — this is not in the spec today and should be added)

| Tier | Cap | Applies to |
|---|---|---|
| Transactional / self-triggered (fires because of something *this* person just did or didn't do) | up to 2/day | visit reminder (§5.2), personal gap nudge |
| Manager/owner digests | 2/day fixed times | inventory digest 12:00/17:00 (עמיחי only) |
| Weekly | 1/week | usage narrative (עידן only, Sunday 08:00) |
| Ad hoc (feedback receipt, low-stock instant) | uncapped but rare by construction (low_stock only fires when a threshold crosses) | — |

**Recommendation:** add one guard in `push-send`: before sending any of `visitCron`/`gapReminder`/`attendanceCron`,
check `push_log` for that person's total sends today and skip (log-only, retry next window) past **3 total
non-digest pushes/day**. This is currently missing — each cron mode is scoped independently in the spec, so a bad
day (missed check-in + missed attendance + an open gap) could stack 3+ pushes with no aggregate ceiling. Industry
guidance: practical ceiling ~1/day behavioral + 3/24h global cap
([Pushwoosh synthesis](https://www.pushwoosh.com/blog/push-notification-best-practices/)); a 6-person team can
tolerate slightly more because messages are individually relevant, but 3 is a sane top.

### 3.2 Quiet hours

- No push 21:00–06:30 Israel time for all cron modes except the immediate `low_stock` alert (which is genuinely
  time-sensitive for עמיחי and rare).
- `visitCron` already only fires from a same-day check-in — add an explicit end-of-day cutoff: if 2h-post-check-in
  would land after 20:00, send at check-in+2h capped at 20:00 rather than letting it slip to the next morning (which
  would read as a night-before scold).
- `attendanceCron`/`eod_hour` (§7h, user-configurable, default 19:00) stays user-controlled — good pattern, keep it.

### 3.3 Escalation ladder — self → gentle → owner visibility (never a threat)

This is the one place to be explicit that Duolingo's *escalating intensity* ladder is the wrong import (§2 lever 6).
Use an escalation of **audience and format**, not tone:

1. **Self, in-context** (0–2h): the arrival-briefing screen itself already shows "last visit" state — this is a
   silent, ambient reminder, no push needed.
2. **Self, gentle push** (2h, one shot): the rotating positive-copy pool (§5.2) — never repeated for the same
   check-in.
3. **Self, passive list** (next app open, any day): the gap sits in פערים שלי until closed — no push, just visible
   the next time the person opens settings/the app. This is the "gentle→visible" step the spec is missing today:
   currently a missed visit produces exactly one push and then relies on the person opening ⚙️ הגדרות on their own.
   **Recommendation:** surface an unobtrusive badge/count on the bottom-nav "עוד" tab whenever פערים שלי is
   non-empty, so the gap is visible without another push.
4. **Owner visibility, aggregated only** (weekly narrative, §7j): individual gaps never get pushed to עידן in
   real time — they only appear, in sentence form, in the Sunday digest, and only as a pattern ("לא השתמש כלל השבוע"),
   never as a single missed visit. This preserves the "never a threat" rule while still giving עידן eventual
   visibility — the aggregation window itself is the de-escalation mechanism.

No step should ever CC עמיחי/עידן on an individual missed visit in real time — that would turn the personal gap list
into a surveillance channel and defeat lever 4 above.

### 3.4 Copy guidelines

- Title always `📍 <קיבוץ/context> — ` prefix (day-log/gaps/recount can adapt the emoji: 📝 for day log, 📋 for gaps,
  🔢 for recount) + a short, non-imperative hook (≤ 5 words).
- Body: 1 sentence, present/near-future tense, names a *personal* payoff (time saved, mental quiet, pride, "מקצוען"),
  never a threat, never "עדיין לא", never "חייב". Keep ≤ 90 characters — pushes truncate on lock screens past that.
- `{param}` substitution only for kibbutz/product name — never the person's own name (reads as scolding when your own
  name is thrown back at you in a nag).
- Every push needs a same-tap action that *is* the fix (deep link straight into the form, never just "open app").
- One emoji max in the body, consistent with the existing pool's style.

### 3.5 Ten new Hebrew push variants (positive tone, matching §5.2's pool style)

**יומן היום (day-log) — reminder to use dictation for today's notes, sent once at a person's own `eod_hour` if the
day had a check-in but no יומן entry:**

| # | Title | Body |
|---|-------|------|
| 1 | **שתי דקות והיום סגור** | דבר לתוך הטלפון על היום — הבינה המלאכותית עושה את השאר, אתה רק מאשר 🎙️✨ |
| 2 | **תן לפה לעבוד במקום לאצבעות** | ספר מה קרה היום ב-2 משפטים — זה כל מה שצריך כדי שהיום ייכנס למערכת 🗣️📋 |
| 3 | **סוף יום, לא סוף כוח** | שיחה קצרה של דקה מתעדת את כל היום — תשאיר את זה מאחוריך ותנוח 🌙 |

**פערים (gaps) — the item sits open in the list, gentle nudge from the settings/gaps surface itself (not a push,
appears when the person opens the app and has an unclosed gap ≥ 2 days old):**

| # | Title | Body |
|---|-------|------|
| 4 | **כמה דברים קטנים מחכים לך** | 2 דקות בפערים האישיים שלך וזהו — הכל סגור ומסודר ✅ |
| 5 | **הרשימה שלך כמעט נקייה** | נשאר פריט אחד-שניים ברשימת הפערים — תגמור את זה ותתפנה לגמרי 🧹 |
| 6 | **סדר עושה שקט** | תסתכל רגע בפערים שלך — כל סגירה שם היא עוד דבר שיורד מהראש 🧠✔️ |

**ספירת מלאי מחדש (stock recount) — nudge to whoever reported a stock decrease/increase without a linked
visit/order after N hours, or a reminder when a recount note is missing:**

| # | Title | Body |
|---|-------|------|
| 7 | **כמעט שם עם המלאי** | נשאר רק להסביר בכמה מילים מה קרה עם הספירה — ואז הכל מתועד נכון 📦📝 |
| 8 | **המספרים שלך חשובים** | ספירה מדויקת עכשיו חוסכת בלבול לכולם בסוף החודש — תודה שאתה מדייק 🔢🙏 |
| 9 | **מלאי מדויק, ראש שקט** | הערה קצרה על הספירה ב{product} וסיימת — עוד רגע קטן שעושה סדר גדול 📦✅ |
| 10 | **אלוף הדיוק** | ספירה שמתועדת נכון היום = בלי הפתעות בהזמנה הבאה. תודה על תשומת הלב 🎯 |

Notes: (a) all use gender-neutral or male-default phrasing matching the existing pool (field team is currently
אביאם/ניתאי); (b) `{product}`/`{kibbutz}` substitution kept minimal per §3.4; (c) recommend hashing these into the
existing per-context pool rather than a separate array, so the same `hash(id) mod N` rotation mechanism in §5.2 is
reused unchanged.

---

## 4. Make the right thing the fastest thing — target tap count & time per job

| Job | Target taps (cold start) | Target time | What to cut |
|---|---|---|---|
| **Check-in** | 2 (open app → tap kibbutz button) | < 5 s | No confirmation dialog after picking a kibbutz — go straight to the briefing. Don't require picking from a scrollable list when "recently visited" already surfaces the 1–2 likely candidates at the top (§5.1 already orders this way — keep the top 3 as big buttons, everything else behind the search box, not a long list). |
| **Visit summary** | 2 from cold start via bottom-nav 📍 (per spec's own target), or 1 tap from a push/briefing deep link | < 90 s for a simple visit (this is the ceiling where dictation belongs) | Cut the modal-before-form step entirely — spec already commits to this ("arrival sheet/briefing is never a mandatory detour"), keep it that way through implementation; don't let review add a confirmation step "for safety." Where the day-log (§7i) exists, treat dictation as the *primary* entry, not an alternative — put 🎙 as the first, largest control on the form, not a secondary icon. |
| **Delivery certificate** | 1 (from the visit form, same screen, existing `certFromVisitForm()`) | < 20 s beyond the visit form itself (cert is a byproduct of the visit, not a separate task) | Nothing to cut — the spec already fuses cert-issuing into the visit flow; the only risk is that the cert gate (equipment supplied ⇒ cert required) surfaces as a blocking error rather than a forward flow. Frame the gate positively in copy: not "אי אפשר לשמור" but a single always-visible step "🚚 תעודת משלוח" that's just part of the form when products are checked. |
| **Stock report (recount)** | 3 (⋯ עוד → דווח שינוי → enter counted qty + note) | < 30 s | The two-branch dialog (ירידה/עלייה → visit/order/recount) is already minimal; the only cuttable friction is requiring a full sentence in the note — accept a short tag set (e.g. "נשבר", "אבד", "נמצא נוסף") as one-tap presets with free text optional, rather than mandating typed prose every time. |
| **Attendance** | 1 (היום card, one tap sets today's day-type) | < 5 s | Nothing to cut for the common case (spec's §7e phone layout already gets this to one tap); avoid adding a confirmation step even though it's a "commit" action — day-type is easily correctable, so optimize for speed over certainty. |

General cut across all five: **never insert an intermediate "are you sure" or "select mode" screen that exists only
for the app's convenience** — every extra screen is a full Fogg-Ability tax paid by a person who is standing in a
field, often one-handed, sometimes with gloves on.

---

## 5. Rollout plan — 6-person team, 2-week pilot

### 5.1 Scope
Pilot the field flow (check-in → briefing → visit → 2h reminder), personal gaps list, and day-log with the 2 field
workers (אביאם, ניתאי) first; עמיחי gets the inventory digest and feedback inbox from day 1; עידן gets the usage page
from day 1 (he needs it to run the pilot). Don't pilot the weekly narrative until week 2 (needs 7+ days of data to
say anything useful, and sending an empty/thin narrative in week 1 undercuts trust in the feature).

### 5.2 What to measure (via `usage_events`, §7j)
- **Activation:** % of workdays with a check-in, per person, days 1–14 (target: rising trend, not a single number).
- **Completion:** median minutes from check-in to a saved visit summary (this is the core metric — it should trend
  down as dictation replaces typing).
- **Reminder efficacy:** % of 2h pushes that result in a visit summary within 30 minutes of the push (vs. the
  self-corrected baseline where the person files before the push ever fires — the second number is the one that
  matters, since a shrinking "pushes needed" count IS the adoption signal, not a growing "push→action" conversion).
- **Day-log adoption:** % of visit summaries created via יומן היום/dictation vs. the manual form, and the AI's
  unmatched-text rate (should trend to zero as `parse_corrections` few-shot learning kicks in, per spec §7i).
- **Gap closure:** median time from a gap appearing in פערים שלי to being closed, and whether people close gaps
  proactively (before any push) vs. only after a nudge.
- **Dead ends** (already instrumented per spec: search-no-results, sheet-opened-and-dismissed) — these are the
  earliest signal that a UI decision (not a motivation problem) is causing a drop-off; check these daily in week 1.
- **Stock discipline:** count of `recount` movements vs. `visit_supply`/`order_delivery` movements — a high recount
  ratio signals the linked-accountability model (inventory §4b) still isn't catching real events, i.e. a process gap
  not a compliance gap.

### 5.3 Success thresholds (2-week pilot, before wider rollout / before removing training wheels)
- ≥ 90% of workdays have a check-in for both field workers by end of week 2 (up from whatever the current visit-log
  baseline is — pull that number first as day-0 baseline).
- Median check-in→saved-visit time ≤ 90 seconds by end of week 2.
- ≤ 1 reminder push needed per check-in on average by end of week 2 (i.e., most visits get filed before the 2h mark
  fires at all — the push becomes a safety net, not the primary driver).
- Zero pushes exceed the daily cap in §3.1 (verifies the guard works, not just the copy).
- At least one real recount is caught by the digest and confirmed correct by עמיחי (verifies inventory §4b end to
  end, not just that movements insert).

If check-in itself stays low (< 60%) despite everything else working, the diagnosis shifts — the arrival trigger
itself isn't landing, and the fix is UX (is the check-in button findable? is the value of checking in obvious before
they've experienced the briefing payoff once?), not more nudging.

### 5.4 Weekly narrative wording — motivate, don't police
The narrative goes to עידן only (per spec), but its downstream use (a conversation with a field worker) means the
wording sets the tone of that conversation. Guidelines:
- **Describe behavior, never rank people against each other.** "אביאם נכנס 5 מתוך 6 ימים" is fine; "אביאם היה הכי
  טוב השבוע" is not — the latter implicitly ranks ניתאי down in a 2-person field team, which in a 6-person company
  everyone will hear about.
- **Pair every gap-shaped sentence with an actionable, curious frame, not a verdict.** "ניתאי לא השתמש בעמוד המשימות
  כלל השבוע" is data; the narrative builder should avoid adjectives ("שוב לא", "עדיין לא") that imply a pattern of
  failure — let עידן supply that judgment in the 1:1, don't pre-bake it into the push he reads on a Sunday morning.
- **Lead with system health, not person health.** "עמוד המלאי לא נפתח על ידי אף אחד" and "החיפוש נכשל 3 פעמים" are
  the most valuable lines in the example set — they point at the *product*, not a person, and are the ones most
  likely to drive a fix rather than a confrontation. Weight the narrative builder to surface these first.
- **Never auto-forward or auto-quote the narrative to the person it's about.** It's עידן's tool for noticing, not a
  performance review artifact — if he wants to raise something, that's a human conversation, not this pushed text
  being screenshotted into a WhatsApp thread (a real risk given the team's WhatsApp-first habits, per §2 lever 10).

---

## 6. Things NOT to do

- **No public leaderboards or comparative rankings between אביאם and ניתאי**, ever, on any screen either of them can
  see. In a 3–4 person field team, a leaderboard adds formality without value and reliably demotivates the person not
  currently "winning" — [gamification research](https://dev.to/arthur_pandev/engineering-leaderboards-motivation-or-demotivation-how-to-set-them-up-right-3n35),
  and forced gamification in small, already-familiar teams performs worse than no gamification at all.
- **No points/badges/streaks tied to compliance metrics** (e.g., "7-day check-in streak 🔥"). Streak mechanics work
  for Duolingo because losing a streak has *no real-world cost* beyond the app itself; here, "breaking a streak"
  would map onto an actual missed workday, and loss-aversion pressure on a real obligation (not a language app) reads
  as guilt-tripping, exactly what §5.2/D6 already correctly ruled out for push copy — don't let it sneak back in
  through a gamified UI element instead of copy.
- **No real-time visibility of individual compliance to עידן/עמיחי.** The weekly aggregated narrative (§5.4) is the
  right altitude; a live dashboard row per person with red/green per day is surveillance dressed as analytics —
  research on employee monitoring is consistent that this erodes trust and can *increase* the very behavior it's
  meant to prevent (people start gaming the metric — e.g., checking in without ever really visiting — rather than
  doing the underlying work) — [CNBC/Toggl synthesis on monitoring backfire](https://toggl.com/blog/employee-surveillance),
  [worker resistance data](https://apploye.com/blog/employee-monitoring-negative-effects/) (54% would consider
  quitting over monitoring software; even in a very different labor context, the trust mechanism is the same one at
  play in a small owner-operator team where relationships are everything).
- **No escalating-intensity notification ladder** (à la Duolingo's angrier owl after N days). עידן's D6 decision
  (positive-only, one nudge) is correct for this context and should be treated as a hard constraint, not a "phase 1"
  compromise to revisit later — escalating tone is what turns a helpful tool into a nagging one in a team small
  enough that every person notices exactly when the tone shifts.
- **No public/shared "feedback inbox" visibility beyond עידן+עמיחי** (spec already scopes this correctly, §7 D7) —
  don't let a future "let the team see open bugs" idea attach names to complaints; anonymous-option only works if the
  non-anonymous ones aren't effectively public too.
- **No mandatory day-log/dictation entry that blocks other actions.** יומן היום must stay a faster *alternative* path
  to the same visit-summary destination, never a required daily check-off — turning a convenience feature into an
  obligation reintroduces exactly the friction it was built to remove.
- **No stacking every new nudge surface without the aggregate cap in §3.1.** Each individual feature (visit
  reminder, gap nudge, recount nudge, feedback receipt) is well-designed in isolation; shipped together without a
  person-level daily ceiling, they add up to notification fatigue that erodes opt-in rates fastest in exactly the
  people who most need the reminders (per push-notification research: 46% opt out after 2–5 low-relevance messages in
  a week — [Pushwoosh](https://www.pushwoosh.com/blog/push-notification-best-practices/)).

---

*Sources cited inline throughout; full list: [Fogg Behavior Model](https://www.thebehavioralscientist.com/articles/fogg-behavior-model),
[Tiny Habits](https://www.easyhabits.io/blog/tiny-habits-bj-fogg), [Amplitude Hook Model](https://amplitude.com/blog/the-hook-model),
[Duolingo notification teardown](https://www.digia.tech/post/duolingo-habit-forming-reminders-retention-architecture/),
[Duolingo streak psychology](https://medium.com/@deekshitha_seeramdas/the-psychology-of-the-streak-why-duolingo-wins-an-aspiring-pms-breakdown-d8839ad34f4d),
[Pushwoosh push best practices](https://www.pushwoosh.com/blog/push-notification-best-practices/),
[Braze push best practices](https://www.braze.com/resources/articles/push-notifications-best-practices),
[Jobber vs ServiceTitan adoption](https://fieldservicesoftware.io/jobber-vs-servicetitan/),
[Empty-state / onboarding patterns](https://usertourkit.com/blog/empty-states-that-convert-onboarding-design-patterns),
[Slack/Linear empty states](https://blog.logrocket.com/ux-design/empty-states-ux-examples/),
[Leaderboard demotivation](https://dev.to/arthur_pandev/engineering-leaderboards-motivation-or-demotivation-how-to-set-them-up-right-3n35),
[Employee surveillance backfire](https://toggl.com/blog/employee-surveillance), [CNBC](https://www.cnbc.com/2023/04/24/employee-surveillance-is-on-the-rise-that-could-backfire-on-employers.html),
[Employee monitoring negative effects](https://apploye.com/blog/employee-monitoring-negative-effects/),
[WhatsApp as Israel's business platform](https://blogs.timesofisrael.com/how-whatsapp-became-israels-unofficial-business-platform/).*
