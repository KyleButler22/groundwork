# Shared Alert component — design

## Context

Prompted by two screenshots: Groundwork's own new "closest to leveling up" nudge on Today (plain muted text, no container at all), and a reference image (cssscript.com) of alert/toast components — a soft-tinted rounded box, a solid colored left accent bar, a circular icon badge, message text, and a circular dismiss button, in several semantic colors. The ask: make Groundwork's alert-style messages look like that, consistently, everywhere one appears — not just the one screenshotted.

## Inventory (verified against the actual current code, not assumed)

Seven real "alert" spots exist today, each hand-rolled with its own markup, no shared component:

| Spot | File | Current treatment |
|---|---|---|
| Promotion banner | `DashboardView.vue`, `WorkoutsView.vue` | `border-train bg-train-wash text-train`, dismiss ✕, wrapped in `<Transition name="promo">` |
| Today's-nudge | `DashboardView.vue` | plain `<p class="text-muted">`, no container |
| Intake submit error | `IntakeView.vue` | `border-warn bg-warn-wash text-warn` |
| Profile auth error | `ProfileView.vue` | `border-warn bg-warn-wash text-warn` |
| Meals generation error | `MealsView.vue` (×2 template branches) | `border-warn bg-warn-wash text-warn` |
| Profile "confirmation sent" | `ProfileView.vue` | `border-nutri bg-nutri-wash text-nutri` + `MailCheck` icon already |
| Pregnancy/postpartum notice | `StepLimitations.vue` | `border-warn bg-warn-wash text-warn` |

Explicitly out of scope: `MealsView.vue`'s `store.warnings` list — a checklist of items in a plain neutral box (`border-rule bg-surface text-muted`), structurally a list, not a single message. Left as-is.

Two real gaps this surfaced: Profile's confirmation message is colored `nutri` for no semantic reason (it's not nutrition-related, `nutri` was just reached for), and the pregnancy notice is colored `warn` even though it's a heads-up, not an error.

## Decisions (settled during brainstorming)

- **One shared component**, not a per-site CSS recipe — `src/components/shared/Alert.vue`, matching where `Skeleton.vue`/`Spinner.vue` already live.
- **Three variants**: `success` (reuses `--color-train`/`--color-train-wash`, unchanged), `error` (reuses `--color-warn`/`--color-warn-wash`, unchanged), `info` (new — but introduces no new color: reuses `--color-panel` for the wash and `--color-ink-soft` for the icon badge, the same "one step off surface" role a wash plays for the other two). `info` exists specifically to fix the two gaps above (confirmation message, pregnancy notice) rather than mis-coloring them.
- **Visual treatment**: borderless. Tinted background, no border at all, a circular translucent icon badge, message text, an optional circular dismiss button. Chosen over two other real candidates considered (a left accent bar + solid icon badge, closer to the reference literally; and a full-border evolution of what's already shipped) as the calmest, least "boxed-warning" look of the three.
- **Icons**: real Lucide icons by default, one per variant — `CheckCircle2` (success), `AlertCircle` (error), `Info` (info) — not emoji, so the component reads as one consistent family regardless of which variant is showing. An `icon` prop overrides the default per call site for messages more specific than their variant (the Today nudge keeps its 🎯; Profile's confirmation keeps `MailCheck`).
- **Dismissibility is an explicit per-instance prop**, not inferred from variant — the pregnancy notice is info-toned but must never be dismissible (it should track the underlying condition, not a user's click), which a variant-based rule would get wrong.
- **Content is a slot**, not a string prop — the promotion banner needs to render a `<ul>` of multiple messages, not a single line; a slot handles both that and every single-string case without a second prop for "is this rich content."

## Component design

### `src/components/shared/Alert.vue` (new)

```ts
withDefaults(defineProps<{
  variant: 'success' | 'error' | 'info'
  dismissible?: boolean
  icon?: Component // optional override; Lucide component reference, e.g. MailCheck
}>(), {
  dismissible: false,
  icon: undefined,
})
defineEmits<{ dismiss: [] }>()
```

Structure: a `flex items-start gap-3` container, `rounded-xl` + `px-4 py-3.5`, background `bg-train-wash`/`bg-warn-wash`/`bg-panel` per variant; a `shrink-0` circular icon badge (`w-7 h-7 rounded-full`) with background `bg-train/20`/`bg-warn/20`/`bg-ink-soft/20` per variant and the resolved icon (prop override or the variant default) centered inside at `:size="16" :stroke-width="2"`, coloured `text-train`/`text-warn`/`text-ink-soft` to match; a `flex-1 text-sm text-ink pt-0.5` slot for message content; and — only when `dismissible` — a `shrink-0` circular dismiss button (`w-5 h-5 rounded-full`, a Lucide `X` at `:size="14" :stroke-width="2"`, `text-muted` resting / `text-ink` hover) emitting `dismiss`.

No store access, no transition logic of its own — a caller that needs the promotion banner's existing fade/slide keeps wrapping `<Alert>` in its own `<Transition name="promo">` exactly as today; `Transition` composes around whatever's inside it regardless of what that is.

### Call-site migration (all 7 spots, each replacing its current hand-rolled markup)

| Spot | `variant` | `dismissible` | `icon` override | Content |
|---|---|---|---|---|
| Promotion banner (Dashboard + Workouts) | `success` | `true` | — | existing `<ul>` of messages, via the default slot |
| Today's-nudge | `success` | `false` | 🎯 (kept as inline content, not a Lucide icon — see note) | "One more good **X** session to level up" |
| Intake submit error | `error` | `false` | — | `store.submitError` |
| Profile auth error | `error` | `false` | — | `session.authError` |
| Meals generation error (×2) | `error` | `false` | — | `store.error` |
| Profile confirmation sent | `info` | `false` | `MailCheck` | existing sign-up/reset copy |
| Pregnancy/postpartum notice | `info` | `false` | — | existing copy |

Note on the Today nudge's 🎯: the `icon` prop is typed for a Lucide component reference (rendered inside the circular badge), not arbitrary content — 🎯 is emoji, not a component, so it stays inline in the slot content itself (`🎯 One more good...`) rather than being forced through the `icon` prop, and that row's badge renders the default `CheckCircle2` for `success`. This keeps the prop's type honest instead of widening it to `Component | string` for one call site.

## Testing approach

`Alert.vue` is a presentational component with real conditional rendering (variant → class/icon mapping, dismissible → button presence, icon-prop override) but no business logic — matching this project's established convention, it gets manual/live verification (all three variants, with and without the icon override, with and without dismissible) rather than a component-test file, the same treatment `Skeleton.vue`/`ProgressionLadder.vue` got. The 7 call-site migrations are template-only changes to existing views with existing store-driven conditions already covered by that view's own existing tests where they exist (e.g. none of these views currently have dedicated `.spec.ts` files exercising the error-message branches specifically, so this doesn't remove any coverage that existed before).

## Out of scope for this pass

- `MealsView.vue`'s `store.warnings` list — stays a plain list, not migrated to `Alert`.
- Any change to the promotion banner's fade/slide `<Transition>` wiring, or to any store's error/warning state shape — this is a presentation-layer swap only.
- A 4th "warning/caution" variant distinct from `error` — considered and explicitly declined in favor of folding the pregnancy notice into `info` instead, to avoid a color this app doesn't otherwise use anywhere.
