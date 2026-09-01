<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import { useIntakeStore } from '@/stores/intake'
import { cmToFeetInches, feetInchesToCm, kgToLb, lbToKg } from '@/lib/intake/units'

const store = useIntakeStore()

// The store always holds metric (docs/intake.md: "imperial units are an
// input-layer concern only and should never reach the database"), but
// the feet/inches inputs are NOT a two-way computed binding through it —
// that was the original design, and it meant editing JUST the feet value
// still round-tripped the INCHES value through cm and back too, which
// could visibly shift it from whatever was actually typed (worse before
// units.ts's own carry-bug fix, but still true after it: any cm rounding
// is still a re-derivation, not an echo of the input). These two hold
// exactly what the person typed; heightCm is derived FROM them, one-way,
// never the reverse — except the one deliberate exception below, when
// units are switched TO imperial and there's a metric value already
// entered to convert as a starting point.
const initialHeight = store.answers.heightCm ? cmToFeetInches(store.answers.heightCm) : { feet: null, inches: null }
const heightFeet = ref<number | null>(initialHeight.feet)
const heightInches = ref<number | null>(initialHeight.inches)

watch([heightFeet, heightInches], ([feet, inches]) => {
  store.answers.heightCm = feet !== null ? Math.round(feetInchesToCm(feet, inches ?? 0)) : null
})

// The one point these DO get overwritten from heightCm: switching units
// mid-flow, so flipping to imperial after entering a metric value shows
// its equivalent rather than a blank pair of inputs. Metric needs no
// equivalent handling the other way — its input already binds directly
// to store.answers.heightCm, which the watch above keeps current.
watch(
  () => store.answers.units,
  (units) => {
    if (units !== 'imperial') return
    const converted = store.answers.heightCm ? cmToFeetInches(store.answers.heightCm) : { feet: null, inches: null }
    heightFeet.value = converted.feet
    heightInches.value = converted.inches
  },
)

const weightLb = computed({
  get: () => (store.answers.weightKg ? Math.round(kgToLb(store.answers.weightKg)) : null),
  set: (lb) => {
    store.answers.weightKg = lb !== null ? Math.round(lbToKg(lb) * 10) / 10 : null
  },
})

const currentYear = new Date().getFullYear()
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-2xl font-semibold text-ink">About you</h1>
      <p class="mt-1 text-sm text-muted">
        Used to estimate your metabolic rate — never shown to anyone else.
      </p>
    </div>

    <fieldset class="flex gap-2" aria-label="Units">
      <button
        v-for="u in (['metric', 'imperial'] as const)"
        :key="u"
        type="button"
        class="min-h-11 flex-1 rounded-full border px-3 text-sm capitalize transition-colors"
        :class="store.answers.units === u ? 'border-train bg-train-wash text-train' : 'border-rule text-muted hover:border-ink-soft hover:text-ink'"
        @click="store.answers.units = u"
      >
        {{ u }}
      </button>
    </fieldset>

    <label class="block">
      <span class="text-sm font-medium text-ink">Birth year</span>
      <input
        v-model.number="store.answers.birthYear"
        type="number"
        inputmode="numeric"
        :placeholder="String(currentYear - 30)"
        :max="currentYear"
        :min="currentYear - 100"
        class="mt-1 min-h-11 w-full rounded-xl border border-rule px-3 text-ink"
      />
    </label>

    <fieldset>
      <legend class="text-sm font-medium text-ink">Sex at birth</legend>
      <p class="mt-0.5 text-xs text-muted">Used only to estimate metabolic rate — this stays private.</p>
      <div class="mt-2 flex gap-2">
        <button
          v-for="opt in (['female', 'male', 'unspecified'] as const)"
          :key="opt"
          type="button"
          class="min-h-11 flex-1 rounded-full border px-3 text-sm capitalize transition-colors"
          :class="store.answers.sexAtBirth === opt ? 'border-train bg-train-wash text-train' : 'border-rule text-muted hover:border-ink-soft hover:text-ink'"
          @click="store.answers.sexAtBirth = opt"
        >
          {{ opt === 'unspecified' ? 'Prefer not to say' : opt }}
        </button>
      </div>
    </fieldset>

    <label v-if="store.answers.units === 'metric'" class="block">
      <span class="text-sm font-medium text-ink">Height (cm)</span>
      <input
        v-model.number="store.answers.heightCm"
        type="number"
        inputmode="numeric"
        placeholder="178"
        class="mt-1 min-h-11 w-full rounded-xl border border-rule px-3 text-ink"
      />
    </label>
    <div v-else class="flex gap-3">
      <label class="block flex-1">
        <span class="text-sm font-medium text-ink">Height (ft)</span>
        <input v-model.number="heightFeet" type="number" inputmode="numeric" placeholder="5" class="mt-1 min-h-11 w-full rounded-xl border border-rule px-3 text-ink" />
      </label>
      <label class="block flex-1">
        <span class="text-sm font-medium text-ink">(in)</span>
        <input v-model.number="heightInches" type="number" inputmode="numeric" placeholder="10" class="mt-1 min-h-11 w-full rounded-xl border border-rule px-3 text-ink" />
      </label>
    </div>

    <label class="block">
      <span class="text-sm font-medium text-ink">Current weight ({{ store.answers.units === 'metric' ? 'kg' : 'lb' }})</span>
      <input
        v-if="store.answers.units === 'metric'"
        v-model.number="store.answers.weightKg"
        type="number"
        inputmode="decimal"
        placeholder="75"
        class="mt-1 min-h-11 w-full rounded-xl border border-rule px-3 text-ink"
      />
      <input
        v-else
        v-model.number="weightLb"
        type="number"
        inputmode="numeric"
        placeholder="165"
        class="mt-1 min-h-11 w-full rounded-xl border border-rule px-3 text-ink"
      />
    </label>

    <p class="text-xs leading-relaxed text-muted">
      This app gives general fitness guidance, not medical advice. If you have a health condition, are pregnant, or are
      under 18, talk to a doctor before starting a new training or nutrition plan.
    </p>
  </div>
</template>
