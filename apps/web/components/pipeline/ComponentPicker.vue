<script setup lang="ts">
export type CatalogCmp = {
  id: string
  nameZh: string
  nameEn: string
  techClass: string
  keyFields: string
  previewImages: string[]
}

const props = defineProps<{
  modelValue: string
  options: CatalogCmp[]
  disabled?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [string]
  preview: [CatalogCmp]
}>()

const selected = computed(() =>
  props.options.find((o) => o.id === props.modelValue),
)

function onChange(e: Event) {
  const v = (e.target as HTMLSelectElement).value
  emit('update:modelValue', v)
}

function previewSelected() {
  if (selected.value) emit('preview', selected.value)
}
</script>

<template>
  <div class="picker">
    <select
      class="sel"
      :value="modelValue"
      :disabled="disabled"
      @change="onChange"
    >
      <option v-for="o in options" :key="o.id" :value="o.id">
        {{ o.id }} · {{ o.nameZh }}
      </option>
    </select>
    <button
      type="button"
      class="prev"
      title="预览 UI 原型"
      :disabled="disabled || !selected"
      @click="previewSelected"
    >
      预览
    </button>
  </div>
</template>

<style scoped>
.picker {
  display: flex;
  gap: 0.35rem;
  align-items: center;
  min-width: 0;
}
.sel {
  flex: 1;
  min-width: 0;
  font: inherit;
  font-size: 0.85rem;
  padding: 0.35rem 0.45rem;
  border: 1px solid var(--line);
  border-radius: 0.35rem;
  background: #fff;
  color: var(--ink);
}
.prev {
  flex-shrink: 0;
  font-size: 0.78rem;
  padding: 0.3rem 0.5rem;
}
</style>
