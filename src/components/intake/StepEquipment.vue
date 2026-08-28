<script setup lang="ts">
import { onMounted, ref } from 'vue'

import { db } from '@/lib/db'
import { useIntakeStore } from '@/stores/intake'
import type { Equipment } from '@/types/domain'

const store = useIntakeStore()
const equipment = ref<Equipment[]>([])
const loading = ref(true)

onMounted(async () => {
  equipment.value = await db.equipment.toArray()
  loading.value = false
})

function toggle(slug: string) {
  const i = store.answers.ownedEquipmentSlugs.indexOf(slug)
  if (i === -1) store.answers.ownedEquipmentSlugs.push(slug)
  else store.answers.ownedEquipmentSlugs.splice(i, 1)
}
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-2xl font-semibold text-ink">What you have</h1>
      <p class="mt-1 text-sm text-muted">
        Select everything you have access to — a chair or step at home counts. This decides which exercises we can
        actually give you.
      </p>
    </div>

    <p v-if="loading" class="text-sm text-muted">Loading equipment list…</p>
    <div v-else class="grid grid-cols-2 gap-2">
      <button
        v-for="item in equipment"
        :key="item.slug"
        type="button"
        class="min-h-11 rounded-md border px-3 py-2 text-left text-sm"
        :class="
          store.answers.ownedEquipmentSlugs.includes(item.slug) ? 'border-train bg-train-wash text-train' : 'border-rule text-ink'
        "
        @click="toggle(item.slug)"
      >
        {{ item.name }}
      </button>
    </div>

    <p class="text-xs text-muted">
      Nothing selected is fine — most exercises here need no equipment at all, and you can update this any time.
    </p>
  </div>
</template>
