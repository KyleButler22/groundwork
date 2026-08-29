<script setup lang="ts">
/**
 * One simple line-art diagram per movement pattern (the 8 rows of
 * movement_patterns, supabase/seed/001_movement_library.sql) — a generic
 * silhouette of the movement CATEGORY (e.g. "a horizontal pushing
 * motion"), not a per-exercise how-to diagram. 60 exercises share these 8
 * drawings; illustrating each exercise's own specific form is real,
 * separate content-authoring work (on the scale of the recipe corpus),
 * not attempted here — ExerciseView's cues text carries the actual
 * per-exercise instruction, this is just a quick visual orientation.
 *
 * `stroke="currentColor"` + no fill, colored by the wrapping element's
 * text color class — same reason RecipeView's step-number circles don't
 * hardcode a color, so this reads correctly in both themes for free.
 */
defineProps<{ patternSlug: string | undefined }>()
</script>

<template>
  <svg viewBox="0 0 120 100" class="h-full w-full" aria-hidden="true">
    <line x1="10" y1="92" x2="110" y2="92" stroke="currentColor" stroke-width="2" opacity="0.3" />
    <g fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">
      <!-- horizontal push (e.g. push-up): low plank, one bent supporting arm -->
      <g v-if="patternSlug === 'horizontal_push'">
        <circle cx="22" cy="58" r="7" />
        <line x1="28" y1="60" x2="85" y2="72" />
        <line x1="85" y1="72" x2="105" y2="80" />
        <line x1="45" y1="63" x2="48" y2="88" />
      </g>

      <!-- vertical push (e.g. pike/overhead press): standing, arms pressing overhead -->
      <g v-else-if="patternSlug === 'vertical_push'">
        <circle cx="60" cy="20" r="7" />
        <line x1="60" y1="27" x2="58" y2="65" />
        <line x1="58" y1="32" x2="35" y2="10" />
        <line x1="58" y1="32" x2="81" y2="10" />
        <line x1="58" y1="65" x2="45" y2="92" />
        <line x1="58" y1="65" x2="71" y2="92" />
      </g>

      <!-- vertical pull (e.g. pull-up): hanging from a bar, elbows driving down -->
      <g v-else-if="patternSlug === 'vertical_pull'">
        <line x1="30" y1="12" x2="90" y2="12" stroke-width="4" />
        <line x1="38" y1="12" x2="55" y2="38" />
        <line x1="82" y1="12" x2="65" y2="38" />
        <circle cx="60" cy="46" r="7" />
        <line x1="60" y1="53" x2="60" y2="78" />
        <line x1="60" y1="78" x2="50" y2="98" />
        <line x1="60" y1="78" x2="70" y2="98" />
      </g>

      <!-- horizontal pull (e.g. row): bent over, elbow driving back -->
      <g v-else-if="patternSlug === 'horizontal_pull'">
        <circle cx="25" cy="40" r="7" />
        <line x1="31" y1="43" x2="75" y2="60" />
        <line x1="75" y1="60" x2="70" y2="92" />
        <line x1="50" y1="50" x2="68" y2="37" />
      </g>

      <!-- squat: knees bent, hips back, arms forward for balance -->
      <g v-else-if="patternSlug === 'squat'">
        <circle cx="60" cy="22" r="7" />
        <line x1="60" y1="29" x2="55" y2="55" />
        <line x1="58" y1="35" x2="32" y2="38" />
        <line x1="55" y1="55" x2="40" y2="72" />
        <line x1="55" y1="55" x2="75" y2="72" />
        <line x1="40" y1="72" x2="44" y2="92" />
        <line x1="75" y1="72" x2="68" y2="92" />
      </g>

      <!-- hinge (e.g. RDL / glute bridge setup): flat back, arms hanging -->
      <g v-else-if="patternSlug === 'hinge'">
        <circle cx="30" cy="35" r="7" />
        <line x1="36" y1="38" x2="75" y2="58" />
        <line x1="45" y1="45" x2="48" y2="75" />
        <line x1="75" y1="58" x2="78" y2="92" />
      </g>

      <!-- core (e.g. plank / hollow body): one dead-straight line -->
      <g v-else-if="patternSlug === 'core'">
        <circle cx="18" cy="52" r="7" />
        <line x1="24" y1="54" x2="95" y2="54" />
        <line x1="35" y1="54" x2="37" y2="85" />
        <line x1="95" y1="54" x2="108" y2="58" />
      </g>

      <!-- skill_handstand: inverted, hands on the floor -->
      <g v-else-if="patternSlug === 'skill_handstand'">
        <line x1="48" y1="90" x2="52" y2="50" />
        <line x1="72" y1="90" x2="68" y2="50" />
        <circle cx="60" cy="42" r="7" />
        <line x1="60" y1="35" x2="58" y2="12" />
        <line x1="58" y1="12" x2="56" y2="4" />
        <line x1="58" y1="12" x2="64" y2="4" />
      </g>

      <!-- Unknown/missing pattern — a plain figure, not a blank box. -->
      <g v-else>
        <circle cx="60" cy="30" r="7" />
        <line x1="60" y1="37" x2="60" y2="70" />
        <line x1="60" y1="45" x2="42" y2="55" />
        <line x1="60" y1="45" x2="78" y2="55" />
        <line x1="60" y1="70" x2="46" y2="92" />
        <line x1="60" y1="70" x2="74" y2="92" />
      </g>
    </g>
  </svg>
</template>
