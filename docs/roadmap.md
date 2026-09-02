# What to build next

Nine feature ideas from live 2026 fitness-app research, checked against what Groundwork already has (so nothing here duplicates a shipped feature) and ranked by leverage — how much each one gets from work that's already done, not just raw impact.

Also published as a formatted artifact: https://claude.ai/code/artifact/17ab036a-3f33-4a55-9808-190a4e4cd66b — treat this file as current if the two ever diverge, same convention as the other docs in this folder.

**Methodology:** live web research across calisthenics-specific apps, general strength/nutrition apps, and the retention research behind them (September 2026) — every finding then checked against Groundwork's actual schema and shipped UI, not left as a generic wishlist.

## Ranked by leverage

### 1. A visual skill map for progressions — ✅ Shipped

Dedicated calisthenics apps (Calistack, Calistree, Simple Calisthenics) treat this as their whole pitch: a node graph of every movement, each one Locked → Unlocked → Ongoing → Mastered, mapping the real path to a planche, front lever, or muscle-up.

Groundwork already modeled this on the backend — `movement_patterns` → `progression_edges` → per-level exercises is the same ladder these apps draw on screen. It previously only drove which session a user got; there was no way to see the ladder at all. This was the single highest-leverage item on the list: real differentiation, built mostly on data that already existed.

**What actually shipped** (see `docs/superpowers/specs/2026-09-02-progression-map-design.md`) is a deliberately simpler 3-state version of the 4-state framing above — completed / current / locked, derived purely from a user's current position with no promotion history kept. `user_exercise_levels` only stores where you are right now, not a record of every rung you've ever reached, so a genuine 4th "Mastered, permanently" state would need a real schema addition (a "highest ever reached" watermark) rather than being free from data that already exists. That trade-off was made explicitly, not discovered late — see the spec's "Out of scope for this pass" section — and can be revisited if losing a completed mark on a regression ever feels wrong in practice.

- **Effort:** Medium
- **Sources:** [Simple Calisthenics](https://www.simple-calisthenics.com/features/calisthenics-skill-tree), [Gymnase Tips](https://www.gymnasetips.com/best-calisthenics-app/)

### 2. A trophy case for the moments already being detected

Badges and milestones are one of the best-evidenced retention levers in the research — recognizing a specific win is what makes a habit stick. Groundwork's promotion engine already fires a real event the moment someone genuinely levels up on a movement; today that event shows once as a banner and is gone for good.

Keeping a permanent, browsable record of every promotion — first pull-up, first strict dip, whatever it is — turns a signal Groundwork already computes into something a user can go back and look at.

- **Effort:** Low–Medium
- **Source:** [Yu-kai Chou, gamification in fitness](https://yukaichou.com/gamification-analysis/top-10-gamification-in-fitness/)

### 3. Actual demo clips on exercises

Every competing app leans on this — Calistree alone cites 1,100+ movements each with a short reference clip. Groundwork's exercise table already has a `demoUrl` column and hand-written coaching cues; the column is just empty. This is closer to a content pass than an engineering project.

- **Effort:** Low (schema exists) → Medium (full library)
- **Sources:** [Calistack](https://play.google.com/store/apps/details?id=com.cali.stack), [Titan's Grip](https://www.titans-grip.com/blog/best-calisthenics-app-2026/)

### 4. A daily readiness check-in, no hardware required

Whoop and Oura's whole business is one number — a recovery/readiness score blended from HRV, resting heart rate, and sleep — that quietly tells you how hard to push today. Groundwork has none of that hardware, and shouldn't chase it.

But the useful part of the idea doesn't need sensors: two questions after waking up (slept okay? sore anywhere?) feeding straight into the promotion/regression engine that already exists, so a rough night can hold a session steady instead of pushing a promotion a body isn't actually ready for.

- **Effort:** Medium
- **Sources:** [Readiness Score Explained](https://livity-app.com/en/blog/readiness-score-explained), [Whoop vs. Oura vs. Garmin](https://www.athletedata.health/guides/whoop-vs-oura-vs-garmin)

### 5. Apple Health / Google Fit sync

Called out flatly in the research as no longer optional — Apple Watch alone is roughly 30% of the smartwatch market. Worth flagging honestly: HealthKit is native-only, closed to a web app. This becomes buildable the moment Capacitor wraps Groundwork natively (already planned for this project, see the mobile-forward constraints note) — not before.

- **Effort:** Medium–High, blocked on Capacitor
- **Source:** [9to5Mac, Google Health ↔ Apple Health sync](https://9to5mac.com/2026/08/03/google-health-adds-two-way-apple-health-syncing-on-iphone/)

## Worth a real decision, not just a feature

### Should Groundwork ever log food, not just plan it?

Every nutrition app in the research — MyFitnessPal, Cronometer — is built around the opposite of what Groundwork does. They're reactive: log what you actually ate, often via barcode scan, after the fact. (One real data point from the research: MyFitnessPal moved barcode scanning behind its paywall in 2024; Cronometer kept it free and scores higher on measured accuracy.) Groundwork is prescriptive: it generates the week's meals for you up front.

Adding real logging isn't a feature bolted onto the generator — it's a second product sitting next to it, with its own food database, its own barcode API, and a completely different daily habit to design for. **This is a "which product are we" question before it's a feature request** — worth answering on purpose rather than drifting into it one barcode scanner at a time.

## Bigger swings, for later

Real, well-evidenced ideas that need genuinely new infrastructure rather than an addition to what's already built — good candidates once the ranked list above is through.

- **A social layer** (friends, activity feed, leaderboards) — the best-evidenced retention lever in the whole research pass: apps with social streaks average 34% longer streaks, and Fitbit's leaderboard alone drove a 15% lift in daily engagement. But it's a new subsystem, not a screen — a social graph, sharing surfaces, and a real privacy/moderation surface that doesn't exist anywhere in Groundwork today.
- **Camera-based AI form checking** — the most visible fitness-AI trend of 2026 (Gymscore, Zing Coach, BioCoach), and bodyweight movements are arguably the best-suited category for it: a phone propped against a wall is enough. Real engineering lift to do credibly. A natural experiment once #3's demo clips exist to design the comparison against.

---

*Compiled September 2026 from live web research, cross-referenced against Groundwork's actual schema and shipped UI.*
