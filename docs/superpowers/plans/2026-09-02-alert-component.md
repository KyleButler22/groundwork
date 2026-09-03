# Shared Alert Component Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace 7 hand-rolled alert-style messages across the app with one shared `Alert.vue` component (success/error/info variants, optional dismiss, borderless tinted treatment).

**Architecture:** One new presentational component with no store access of its own (`variant`, `dismissible`, `icon` props; a default slot for content; a `dismiss` emit) — six existing view/component files then each replace their own hand-rolled markup with a call to it.

**Tech Stack:** Vue 3 `<script setup>`, `@lucide/vue` icons, Tailwind v4 utility classes against the existing design tokens.

## Global Constraints

- No new dependencies.
- Typecheck (`npm run typecheck`) must stay clean after every task.
- No new colors — `success`/`error` reuse `--color-train`/`--color-warn` exactly as today; `info` reuses `--color-panel` and `--color-ink-soft`, both already-existing tokens.
- `Alert.vue` itself is presentational with real conditional rendering but no business logic — per this project's established convention, it gets manual/live verification, not a component test file (the same treatment `Skeleton.vue`/`ProgressionLadder.vue` got).
- The dismiss button uses a real `min-h-11 min-w-11` (44px) tap target around a smaller visible icon — matching this app's existing convention (the promotion banner's own current dismiss button already does exactly this) — not just a small clickable circle.
- Migrating a call site must not change its underlying condition/logic (`v-if="store.error"` stays exactly that) — only the markup rendering the message changes.

---

### Task 1: The `Alert` component

**Files:**
- Create: `src/components/shared/Alert.vue`

**Interfaces:**
- Produces: `Alert` component. Props: `variant: 'success' | 'error' | 'info'` (required), `dismissible?: boolean` (default `false`), `icon?: Component` (optional, a Lucide component reference). Emits: `dismiss` (no payload). Default slot: message content. Tasks 2-7 all consume this.

- [ ] **Step 1: Create the component**

Create `src/components/shared/Alert.vue`:

```vue
<script setup lang="ts">
import { AlertCircle, CheckCircle2, Info, X } from '@lucide/vue'
import { computed, type Component } from 'vue'

const props = withDefaults(
  defineProps<{
    variant: 'success' | 'error' | 'info'
    dismissible?: boolean
    icon?: Component
  }>(),
  { dismissible: false, icon: undefined },
)

defineEmits<{ dismiss: [] }>()

// One default icon per variant so every alert reads as one consistent
// family at a glance; a call site overrides it via the `icon` prop only
// when the message itself is more specific than its variant (e.g. a
// "confirmation email sent" success uses MailCheck, not a generic check).
const DEFAULT_ICON: Record<'success' | 'error' | 'info', Component> = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
}

const resolvedIcon = computed(() => props.icon ?? DEFAULT_ICON[props.variant])
</script>

<template>
  <div
    class="flex items-start gap-3 rounded-xl px-4 py-3.5"
    :class="{
      'bg-train-wash': variant === 'success',
      'bg-warn-wash': variant === 'error',
      'bg-panel': variant === 'info',
    }"
  >
    <div
      class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
      :class="{
        'bg-train/20 text-train': variant === 'success',
        'bg-warn/20 text-warn': variant === 'error',
        'bg-ink-soft/20 text-ink-soft': variant === 'info',
      }"
    >
      <component :is="resolvedIcon" :size="16" :stroke-width="2" aria-hidden="true" />
    </div>
    <div class="flex-1 pt-0.5 text-sm text-ink">
      <slot />
    </div>
    <button
      v-if="dismissible"
      type="button"
      class="flex min-h-11 min-w-11 shrink-0 items-center justify-center text-muted transition-colors hover:text-ink"
      aria-label="Dismiss"
      @click="$emit('dismiss')"
    >
      <X :size="16" :stroke-width="2" aria-hidden="true" />
    </button>
  </div>
</template>
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 3: Manual verification**

You very likely do NOT have working browser/visual-rendering tools in this environment. Do not claim you observed any of the three variants rendering, the icon badges, or the dismiss button — that would be fabricated. Instead, re-read the file and confirm it matches this step's code exactly, and state in your report that live visual verification of all three variants (including `info`, which was decided during brainstorming but never actually shown to the user as a mockup, unlike `success`/`error`) is deferred to the controller.

- [ ] **Step 4: Commit**

```bash
git add src/components/shared/Alert.vue
git commit -m "Add shared Alert component"
```

---

### Task 2: Migrate Dashboard (promotion banner + Today nudge)

**Files:**
- Modify: `src/views/DashboardView.vue`

**Interfaces:**
- Consumes: `Alert` (Task 1).

- [ ] **Step 1: Add the import**

`src/views/DashboardView.vue` currently starts:

```ts
<script setup lang="ts">
import { ChevronRight, X } from '@lucide/vue'
import { computed, onMounted, ref, watch } from 'vue'

import Skeleton from '@/components/shared/Skeleton.vue'
```

Add the new import alongside `Skeleton`, and drop `X` from the lucide import (it was only used by the promotion banner's dismiss button, which `Alert` now renders internally):

```ts
<script setup lang="ts">
import { ChevronRight } from '@lucide/vue'
import { computed, onMounted, ref, watch } from 'vue'

import Alert from '@/components/shared/Alert.vue'
import Skeleton from '@/components/shared/Skeleton.vue'
```

- [ ] **Step 2: Replace the Today nudge**

Replace:

```html
    <p v-if="closestToPromotion" class="mt-1 text-sm text-muted">
      🎯 One more good <span class="font-medium text-ink">{{ closestToPromotion.patternName }}</span> session to level up
    </p>
```

with:

```html
    <Alert v-if="closestToPromotion" variant="success" class="mt-1">
      🎯 One more good <span class="font-medium">{{ closestToPromotion.patternName }}</span> session to level up
    </Alert>
```

(The inner `<span>` drops its own `text-ink` — `Alert`'s slot content is already `text-ink`, so the `<span>` only needs `font-medium` to still stand out.)

- [ ] **Step 3: Replace the promotion banner**

Replace:

```html
          <Transition name="promo">
            <div
              v-if="planStore.promotionMessages.length"
              class="mt-3 flex items-start justify-between gap-2 rounded-xl border border-train bg-train-wash px-3 py-2 text-xs text-train"
            >
              <ul class="space-y-1">
                <li v-for="(message, i) in planStore.promotionMessages" :key="i">{{ message }}</li>
              </ul>
              <button
                type="button"
                class="flex min-h-11 min-w-11 shrink-0 items-center justify-center text-train/70 transition-colors hover:text-train"
                aria-label="Dismiss"
                @click="planStore.dismissPromotionMessages()"
              >
                <X :size="16" :stroke-width="2" aria-hidden="true" />
              </button>
            </div>
          </Transition>
```

with:

```html
          <Transition name="promo">
            <Alert
              v-if="planStore.promotionMessages.length"
              variant="success"
              dismissible
              class="mt-3"
              @dismiss="planStore.dismissPromotionMessages()"
            >
              <ul class="space-y-1">
                <li v-for="(message, i) in planStore.promotionMessages" :key="i">{{ message }}</li>
              </ul>
            </Alert>
          </Transition>
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 5: Manual verification**

You very likely do NOT have working browser/visual-rendering tools in this environment. Do not claim you observed either alert rendering — that would be fabricated. Instead, re-read the modified file and confirm both replacements match this step's code exactly, and state in your report that live visual verification (including that the `<Transition name="promo">` fade/slide still works with `Alert` inside it instead of a bare `<div>`) is deferred to the controller.

- [ ] **Step 6: Commit**

```bash
git add src/views/DashboardView.vue
git commit -m "Migrate Dashboard's promotion banner and Today nudge to Alert"
```

---

### Task 3: Migrate Workouts (promotion banner)

**Files:**
- Modify: `src/views/WorkoutsView.vue`

**Interfaces:**
- Consumes: `Alert` (Task 1).

- [ ] **Step 1: Add the import**

`src/views/WorkoutsView.vue` currently starts:

```ts
<script setup lang="ts">
import { ChevronRight, X } from '@lucide/vue'
import { computed, onMounted, ref } from 'vue'

import Skeleton from '@/components/shared/Skeleton.vue'
```

Add the new import, and drop `X` (only used by this banner's dismiss button):

```ts
<script setup lang="ts">
import { ChevronRight } from '@lucide/vue'
import { computed, onMounted, ref } from 'vue'

import Alert from '@/components/shared/Alert.vue'
import Skeleton from '@/components/shared/Skeleton.vue'
```

- [ ] **Step 2: Replace the promotion banner**

Replace:

```html
      <Transition name="promo">
        <div v-if="planStore.promotionMessages.length" class="mt-4 flex items-start justify-between gap-2 rounded-xl border border-train bg-train-wash px-3 py-2 text-xs text-train">
          <ul class="space-y-1">
            <li v-for="(message, i) in planStore.promotionMessages" :key="i">{{ message }}</li>
          </ul>
          <button
            type="button"
            class="flex min-h-11 min-w-11 shrink-0 items-center justify-center text-train/70 transition-colors hover:text-train"
            aria-label="Dismiss"
            @click="planStore.dismissPromotionMessages()"
          >
            <X :size="16" :stroke-width="2" aria-hidden="true" />
          </button>
        </div>
      </Transition>
```

with:

```html
      <Transition name="promo">
        <Alert
          v-if="planStore.promotionMessages.length"
          variant="success"
          dismissible
          class="mt-4"
          @dismiss="planStore.dismissPromotionMessages()"
        >
          <ul class="space-y-1">
            <li v-for="(message, i) in planStore.promotionMessages" :key="i">{{ message }}</li>
          </ul>
        </Alert>
      </Transition>
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 4: Manual verification**

Same deferral as Task 2 — no fabricated observation. Re-read the file, confirm the replacement matches exactly, note live verification (including the `<Transition>` still working) is deferred to the controller.

- [ ] **Step 5: Commit**

```bash
git add src/views/WorkoutsView.vue
git commit -m "Migrate Workouts' promotion banner to Alert"
```

---

### Task 4: Migrate Intake (submit error)

**Files:**
- Modify: `src/views/IntakeView.vue`

**Interfaces:**
- Consumes: `Alert` (Task 1).

- [ ] **Step 1: Add the import**

`src/views/IntakeView.vue` currently starts:

```ts
<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'

import { LOCAL_DEV_USER_ID } from '@/lib/localUser'
```

Add the new import as the first line after the `<script setup lang="ts">` tag's existing `vue`/`vue-router` imports:

```ts
<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'

import Alert from '@/components/shared/Alert.vue'
import { LOCAL_DEV_USER_ID } from '@/lib/localUser'
```

- [ ] **Step 2: Replace the error message**

Replace:

```html
      <p v-if="store.submitError" class="mt-4 rounded-xl border border-warn bg-warn-wash px-3 py-2 text-sm text-warn">
        {{ store.submitError }}
      </p>
```

with:

```html
      <Alert v-if="store.submitError" variant="error" class="mt-4">
        {{ store.submitError }}
      </Alert>
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 4: Manual verification**

Same deferral pattern as prior tasks — re-read, confirm exact match, defer live rendering to the controller.

- [ ] **Step 5: Commit**

```bash
git add src/views/IntakeView.vue
git commit -m "Migrate Intake's submit error to Alert"
```

---

### Task 5: Migrate Profile (auth error + confirmation sent)

**Files:**
- Modify: `src/views/ProfileView.vue`

**Interfaces:**
- Consumes: `Alert` (Task 1).

- [ ] **Step 1: Add the import**

`src/views/ProfileView.vue` currently starts:

```ts
<script setup lang="ts">
import { CircleUser, Eye, EyeOff, ListChecks, Lock, LogOut, Mail, MailCheck, Monitor, Moon, Sun } from '@lucide/vue'
import { computed, ref } from 'vue'

import Spinner from '@/components/shared/Spinner.vue'
```

Add the new import alongside `Spinner` (`MailCheck` stays in the lucide import — it's now passed to `Alert`'s `icon` prop instead of rendered directly, but it's still imported and used):

```ts
<script setup lang="ts">
import { CircleUser, Eye, EyeOff, ListChecks, Lock, LogOut, Mail, MailCheck, Monitor, Moon, Sun } from '@lucide/vue'
import { computed, ref } from 'vue'

import Alert from '@/components/shared/Alert.vue'
import Spinner from '@/components/shared/Spinner.vue'
```

- [ ] **Step 2: Replace the confirmation-sent message**

Replace:

```html
        <p v-if="confirmationSent" class="mt-4 flex items-start gap-2 rounded-xl border border-nutri bg-nutri-wash px-3 py-2 text-sm text-nutri">
          <MailCheck :size="18" :stroke-width="1.75" class="mt-0.5 shrink-0" aria-hidden="true" />
          <span v-if="confirmationSent === 'sign_up'">Account created: check {{ email || 'your email' }} for a confirmation link before signing in.</span>
          <span v-else>If an account exists for that email, a password reset link is on its way.</span>
        </p>
```

with:

```html
        <Alert v-if="confirmationSent" variant="info" :icon="MailCheck" class="mt-4">
          <span v-if="confirmationSent === 'sign_up'">Account created: check {{ email || 'your email' }} for a confirmation link before signing in.</span>
          <span v-else>If an account exists for that email, a password reset link is on its way.</span>
        </Alert>
```

- [ ] **Step 3: Replace the auth error**

Replace:

```html
          <p v-if="session.authError" class="rounded-xl border border-warn bg-warn-wash px-3 py-2 text-sm text-warn">{{ session.authError }}</p>
```

with:

```html
          <Alert v-if="session.authError" variant="error">{{ session.authError }}</Alert>
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 5: Manual verification**

Same deferral pattern — re-read, confirm exact match for both replacements, defer live rendering (including that `MailCheck` genuinely renders inside the icon badge via the `icon` prop) to the controller.

- [ ] **Step 6: Commit**

```bash
git add src/views/ProfileView.vue
git commit -m "Migrate Profile's auth error and confirmation message to Alert"
```

---

### Task 6: Migrate Meals (generation error, two call sites)

**Files:**
- Modify: `src/views/MealsView.vue`

**Interfaces:**
- Consumes: `Alert` (Task 1).

**Note:** this file has the identical `store.error` markup in two different template branches (the no-plan-yet state and the has-plan state) — both get the same replacement.

- [ ] **Step 1: Add the import**

`src/views/MealsView.vue` currently starts:

```ts
<script setup lang="ts">
import { ChevronRight, Lock, LockOpen } from '@lucide/vue'
import { computed, onMounted } from 'vue'

import Skeleton from '@/components/shared/Skeleton.vue'
```

Add the new import alongside `Skeleton`:

```ts
<script setup lang="ts">
import { ChevronRight, Lock, LockOpen } from '@lucide/vue'
import { computed, onMounted } from 'vue'

import Alert from '@/components/shared/Alert.vue'
import Skeleton from '@/components/shared/Skeleton.vue'
```

- [ ] **Step 2: Replace both error messages**

This exact line appears twice in the file — once in the `!store.hasPlan` branch, once in the has-plan branch. Replace **both** occurrences of:

```html
      <p v-if="store.error" class="mt-3 rounded-xl border border-warn bg-warn-wash px-3 py-2 text-sm text-warn">{{ store.error }}</p>
```

with:

```html
      <Alert v-if="store.error" variant="error" class="mt-3">{{ store.error }}</Alert>
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 4: Manual verification**

Same deferral pattern — re-read the file and confirm **both** occurrences were replaced (search the file for `border-warn` to confirm none remain), defer live rendering to the controller.

- [ ] **Step 5: Commit**

```bash
git add src/views/MealsView.vue
git commit -m "Migrate Meals' generation error to Alert"
```

---

### Task 7: Migrate the pregnancy/postpartum notice

**Files:**
- Modify: `src/components/intake/StepLimitations.vue`

**Interfaces:**
- Consumes: `Alert` (Task 1).

- [ ] **Step 1: Add the import**

`src/components/intake/StepLimitations.vue` currently starts:

```ts
<script setup lang="ts">
import { onMounted, ref } from 'vue'

import Spinner from '@/components/shared/Spinner.vue'
```

Add the new import alongside `Spinner`:

```ts
<script setup lang="ts">
import { onMounted, ref } from 'vue'

import Alert from '@/components/shared/Alert.vue'
import Spinner from '@/components/shared/Spinner.vue'
```

- [ ] **Step 2: Replace the notice**

Replace:

```html
    <p v-if="store.answers.isPregnantOrPostpartum" class="rounded-xl border border-warn bg-warn-wash px-3 py-2 text-sm text-warn">
      This app's plans aren't built for pregnancy or early postpartum training — please talk to your doctor or a
      pelvic-floor specialist about what's appropriate right now.
    </p>
```

with:

```html
    <Alert v-if="store.answers.isPregnantOrPostpartum" variant="info">
      This app's plans aren't built for pregnancy or early postpartum training — please talk to your doctor or a
      pelvic-floor specialist about what's appropriate right now.
    </Alert>
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 4: Manual verification**

Same deferral pattern — re-read, confirm exact match, defer live rendering to the controller.

- [ ] **Step 5: Commit**

```bash
git add src/components/intake/StepLimitations.vue
git commit -m "Migrate the pregnancy/postpartum notice to Alert"
```

---

## Final verification (after all 7 tasks)

- [ ] Run `npx vitest run` — expect the same test count as before this branch, none broken (this plan touches no test-covered logic, only presentation).
- [ ] Run `npm run build` — expect a clean production build.
- [ ] Live, on the controller's side: visit each of the 7 migrated spots with real triggering data/state (a real promotion event, a seeded `closestToPromotion` candidate, a real submit/auth/generation error, the confirmation-sent state, the pregnancy checkbox) and confirm each renders the correct variant's color, the correct icon (including `MailCheck` on Profile's confirmation and the 🎯 emoji still showing inline on the Today nudge), dismissibility exactly where specified (promotion banners only), and that both `<Transition name="promo">` wrappers still animate correctly with `Alert` inside them instead of a bare `div`. Specifically confirm the `info` variant looks good — it was never shown as a mockup during brainstorming, only decided in text, so this is its first real visual check. Revert any temporary seeded data afterward, confirmed empty again.
