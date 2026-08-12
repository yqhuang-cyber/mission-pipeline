<script setup lang="ts">
import {
  parseV04Content,
  type V04Component,
  type V04ScriptStep,
  V04_SCHEMA_FIELDS,
} from '~/utils/parseV04'

const props = defineProps<{
  open: boolean
  title: string
  description?: string
  content: string
}>()

const emit = defineEmits<{ close: [] }>()

const phases = computed(() => parseV04Content(props.content || ''))
const activeStepId = ref('')
const articleRef = ref<HTMLElement | null>(null)

/** Same order & names as mission_spec_schema / meta model */
const FIELD_COLS = V04_SCHEMA_FIELDS

const activeStep = computed<V04ScriptStep | null>(() => {
  for (const p of phases.value) {
    const s = p.steps.find((x) => x.id === activeStepId.value)
    if (s) return s
  }
  return phases.value[0]?.steps[0] || null
})

watch(
  () => props.open,
  (v) => {
    if (v) {
      activeStepId.value = phases.value[0]?.steps[0]?.id || ''
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
  },
)

watch(
  phases,
  (p) => {
    if (!activeStepId.value && p[0]?.steps[0]) {
      activeStepId.value = p[0].steps[0]!.id
    }
  },
  { immediate: true },
)

onUnmounted(() => {
  document.body.style.overflow = ''
})

function selectStep(id: string) {
  activeStepId.value = id
  nextTick(() => {
    articleRef.value?.scrollTo({ top: 0 })
  })
}

function short(s: string, n = 120) {
  const t = (s || '').replace(/\s+/g, ' ').trim()
  if (!t) return '—'
  return t.length > n ? `${t.slice(0, n)}…` : t
}

const LEGACY_ALIASES: Record<string, string[]> = {
  'Script Step': ['script_step'],
  Component: ['Component 序号'],
  'Kai Feedback Script - Correct': ['Kai Feedback (Correct)'],
  'Kai Feedback Script - Wrong': ['Kai Feedback (Wrong)'],
  'Knowledge point': ['Knowledge Point'],
}

function field(comp: V04Component, key: string): string {
  if (key === 'Display Text') {
    const dt = (comp.displayText || '').trim()
    if (dt) return dt
  }
  const direct = comp.fields[key]
  if (direct != null && direct !== '' && !/见上方/.test(direct)) return direct
  for (const alt of LEGACY_ALIASES[key] || []) {
    const v = comp.fields[alt]
    if (v != null && v !== '') return v
  }
  if (key === 'Component' && comp.cmp) {
    return comp.name ? `${comp.cmp} · ${comp.name}` : comp.cmp
  }
  return ''
}

function cellPreview(comp: V04Component, key: string, phaseFallback: string): string {
  let raw = field(comp, key)
  if (key === 'Phase' && !raw) raw = phaseFallback
  const n =
    key === 'Display Text' || key.includes('Script') || key === 'Knowledge point'
      ? 140
      : 72
  return short(raw, n)
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close')
}

onMounted(() => window.addEventListener('keydown', onKey))
onUnmounted(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="overlay" @click.self="emit('close')">
      <div class="modal" role="dialog" aria-modal="true" :aria-label="title">
        <header class="modal-head">
          <div>
            <p class="eyebrow">v0.4 · 13 fields (mission_spec_schema)</p>
            <h2>{{ title }}</h2>
            <p v-if="description" class="muted">{{ description }}</p>
          </div>
          <button class="close" type="button" @click="emit('close')">关闭 Esc</button>
        </header>

        <div class="modal-body">
          <aside class="toc">
            <p class="toc-title">目录</p>
            <nav v-if="phases.length">
              <div v-for="phase in phases" :key="phase.id" class="toc-phase">
                <p class="phase-label">{{ phase.title }}</p>
                <ul>
                  <li v-for="step in phase.steps" :key="step.id">
                    <button
                      type="button"
                      class="toc-step-btn"
                      :class="{ active: activeStepId === step.id }"
                      @click="selectStep(step.id)"
                    >
                      {{ step.index }}. {{ step.name }}
                      <span class="count">{{ step.components.length }} cmp</span>
                    </button>
                  </li>
                </ul>
              </div>
            </nav>
            <p v-else class="muted small">未能解析 Phase / script_step</p>
          </aside>

          <article ref="articleRef" class="article">
            <template v-if="activeStep">
              <h3>
                Script Step {{ activeStep.index }}. {{ activeStep.name }}
                <span class="badge">{{ activeStep.phase }}</span>
              </h3>
              <p v-if="activeStep.purpose" class="purpose muted">
                {{ activeStep.purpose }}
              </p>

              <div class="table-wrap">
                <table class="cmp-table">
                  <thead>
                    <tr>
                      <th class="sticky-id">#</th>
                      <th v-for="col in FIELD_COLS" :key="col">{{ col }}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="c in activeStep.components" :key="c.id">
                      <td class="mono sticky-id">{{ c.id }}</td>
                      <td
                        v-for="col in FIELD_COLS"
                        :key="col"
                        class="pre"
                      >
                        {{ cellPreview(c, col, activeStep.phase) }}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <details
                v-for="c in activeStep.components"
                :key="`d-${c.id}`"
                class="detail"
              >
                <summary>
                  {{ c.id }} · {{ field(c, 'Component') || c.cmp }} — 完整 13 字段
                </summary>
                <div class="detail-grid">
                  <div class="span-2">
                    <h4>Display Text</h4>
                    <pre>{{ field(c, 'Display Text') || '—' }}</pre>
                  </div>
                  <div class="span-2">
                    <h4>Fields（与 mission_spec_schema 同序）</h4>
                    <table class="fields">
                      <tbody>
                        <tr v-for="col in FIELD_COLS" :key="col">
                          <th>{{ col }}</th>
                          <td class="pre">
                            <pre
                              v-if="col === 'Display Text'"
                              class="inline-pre"
                            >{{ field(c, col) || '—' }}</pre>
                            <template v-else>
                              {{
                                col === 'Phase' && !field(c, 'Phase')
                                  ? activeStep.phase
                                  : field(c, col) || '—'
                              }}
                            </template>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </details>
            </template>
            <p v-else class="muted">暂无内容</p>
          </article>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: rgba(28, 25, 21, 0.45);
  backdrop-filter: blur(4px);
  display: grid;
  place-items: center;
  padding: 1.25rem;
}
.modal {
  width: min(96vw, 1400px);
  height: min(92vh, 960px);
  background: #fffaf2;
  border: 1px solid var(--line);
  border-radius: 0.85rem;
  box-shadow: 0 24px 80px rgba(28, 25, 21, 0.22);
  display: grid;
  grid-template-rows: auto 1fr;
  overflow: hidden;
}
.modal-head {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  align-items: flex-start;
  padding: 1rem 1.25rem;
  border-bottom: 1px solid var(--line);
}
.eyebrow {
  margin: 0;
  font-size: 0.72rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--muted);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.modal-head h2 {
  margin: 0.2rem 0 0.15rem;
  font-size: 1.35rem;
}
.modal-body {
  display: grid;
  grid-template-columns: 260px 1fr;
  min-height: 0;
}
.toc {
  border-right: 1px solid var(--line);
  overflow: auto;
  padding: 0.85rem 0.75rem;
  background: #f3ebe0;
}
.toc-title {
  margin: 0 0 0.6rem;
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--muted);
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
.phase-label {
  margin: 0.55rem 0 0.25rem;
  font-weight: 700;
  font-size: 0.9rem;
}
.toc ul {
  list-style: none;
  margin: 0;
  padding: 0;
}
.toc-step-btn {
  display: flex;
  justify-content: space-between;
  gap: 0.35rem;
  width: 100%;
  text-align: left;
  border: none;
  background: transparent;
  padding: 0.35rem 0.45rem;
  border-radius: 0.35rem;
  cursor: pointer;
  color: var(--muted);
  font: inherit;
  font-size: 0.82rem;
}
.toc-step-btn:hover,
.toc-step-btn.active {
  background: rgba(15, 107, 92, 0.12);
  color: var(--brand-ink);
}
.count {
  flex-shrink: 0;
  font-size: 0.7rem;
  opacity: 0.75;
}
.article {
  overflow: auto;
  padding: 1.1rem 1.25rem 2rem;
}
.article h3 {
  margin: 0 0 0.4rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}
.badge {
  font-size: 0.75rem;
  padding: 0.1rem 0.45rem;
  border-radius: 999px;
  background: var(--bg-accent);
  font-weight: 600;
}
.purpose {
  margin: 0 0 0.85rem;
}
.table-wrap {
  overflow: auto;
  border: 1px solid var(--line);
  border-radius: 0.45rem;
  margin-bottom: 1rem;
}
.cmp-table {
  border-collapse: collapse;
  font-size: 0.78rem;
  min-width: 1600px;
  width: 100%;
}
.cmp-table th,
.cmp-table td {
  border-bottom: 1px solid var(--line);
  border-right: 1px solid var(--line);
  padding: 0.45rem 0.5rem;
  vertical-align: top;
  text-align: left;
}
.cmp-table th {
  background: #efe6d8;
  position: sticky;
  top: 0;
  z-index: 1;
  white-space: nowrap;
}
.cmp-table tr:last-child td {
  border-bottom: none;
}
.sticky-id {
  position: sticky;
  left: 0;
  z-index: 2;
  background: #f7f0e4;
  min-width: 3rem;
}
.cmp-table th.sticky-id {
  z-index: 3;
  background: #efe6d8;
}
.pre {
  white-space: pre-wrap;
  word-break: break-word;
  max-width: 200px;
  line-height: 1.4;
}
.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.small {
  font-size: 0.75rem;
}
.detail {
  margin-top: 0.55rem;
  border: 1px solid var(--line);
  border-radius: 0.4rem;
  padding: 0.35rem 0.65rem;
  background: #faf4ea;
}
.detail summary {
  cursor: pointer;
  font-weight: 600;
  font-size: 0.88rem;
  padding: 0.35rem 0;
}
.detail-grid {
  display: grid;
  gap: 0.75rem;
  padding: 0.4rem 0 0.7rem;
}
.span-2 {
  grid-column: 1 / -1;
}
.detail h4 {
  margin: 0 0 0.35rem;
  font-size: 0.85rem;
}
.detail pre,
.inline-pre {
  margin: 0;
  padding: 0.55rem 0.7rem;
  background: #2a2621;
  color: #f4efe6;
  border-radius: 0.35rem;
  white-space: pre-wrap;
  font-size: 0.8rem;
}
.fields {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.82rem;
}
.fields th,
.fields td {
  border: 1px solid var(--line);
  padding: 0.35rem 0.5rem;
  vertical-align: top;
}
.fields th {
  width: 14rem;
  background: #efe6d8;
  text-align: left;
  white-space: nowrap;
}
@media (max-width: 800px) {
  .modal-body {
    grid-template-columns: 1fr;
  }
  .toc {
    max-height: 180px;
    border-right: none;
    border-bottom: 1px solid var(--line);
  }
}
</style>
