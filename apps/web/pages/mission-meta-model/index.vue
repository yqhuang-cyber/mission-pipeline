<script setup lang="ts">
import { renderArtifactMarkdown } from '~/utils/renderMarkdown'

const { api } = useApi()

const { data, pending, error, refresh } = await useAsyncData(
  'mission-phase-step-meta-model',
  () =>
    api<{ file: string; markdown: string }>(
      '/api/master/mission-phase-step-meta-model',
    ),
)

const html = computed(() =>
  data.value?.markdown ? renderArtifactMarkdown(data.value.markdown) : '',
)
</script>

<template>
  <div class="page">
    <div class="head">
      <div>
        <p class="eyebrow muted mono">Master data</p>
        <h1>MissionMetaModel</h1>
        <p class="muted mono">
          {{ data?.file || 'mission_phase_step_meta_model.md' }}
        </p>
      </div>
      <div class="head-actions">
        <NuxtLink class="btn" to="/missions">← Missions</NuxtLink>
        <button type="button" class="btn" @click="refresh()">刷新</button>
      </div>
    </div>

    <p v-if="pending" class="muted">加载中…</p>
    <p v-else-if="error" class="err">{{ error.message || error }}</p>
    <article v-else class="card md" v-html="html" />
  </div>
</template>

<style scoped>
.head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
  margin-bottom: 1.25rem;
}
.head-actions {
  display: flex;
  gap: 0.5rem;
  flex-shrink: 0;
}
.eyebrow {
  margin: 0 0 0.25rem;
  font-size: 0.8rem;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
h1 {
  margin: 0 0 0.35rem;
  font-size: 1.85rem;
}
.err {
  color: var(--danger);
}
.md {
  max-width: 52rem;
  line-height: 1.55;
  overflow-x: auto;
}
.md :deep(h1),
.md :deep(h2),
.md :deep(h3) {
  scroll-margin-top: 4.5rem;
}
.md :deep(h1) {
  font-size: 1.5rem;
}
.md :deep(h2) {
  font-size: 1.25rem;
  margin-top: 1.75rem;
  border-bottom: 1px solid var(--line);
  padding-bottom: 0.35rem;
}
.md :deep(h3) {
  font-size: 1.05rem;
  margin-top: 1.25rem;
}
.md :deep(table) {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.92rem;
  margin: 0.75rem 0 1rem;
}
.md :deep(th),
.md :deep(td) {
  border: 1px solid var(--line);
  padding: 0.4rem 0.55rem;
  vertical-align: top;
  text-align: left;
}
.md :deep(th) {
  background: rgba(15, 107, 92, 0.06);
}
.md :deep(pre) {
  background: #1c1915;
  color: #f3efe6;
  padding: 0.85rem 1rem;
  border-radius: 0.5rem;
  overflow-x: auto;
  font-size: 0.85rem;
}
.md :deep(code) {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.88em;
}
.md :deep(:not(pre) > code) {
  background: rgba(28, 25, 21, 0.06);
  padding: 0.1em 0.35em;
  border-radius: 0.25rem;
}
.md :deep(blockquote) {
  margin: 0.75rem 0;
  padding: 0.35rem 0.9rem;
  border-left: 3px solid var(--brand);
  color: var(--muted);
}
</style>
