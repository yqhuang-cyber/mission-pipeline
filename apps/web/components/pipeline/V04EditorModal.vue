<script setup lang="ts">
type N3Row = {
  Phase: string
  'Script Step': string
  Step: string
  Component: string
  DisplayText: string
  'Display Image': string
  'Video Play': string
  'Kai Script 1': string
  'Kai Script 2': string
  'Kai Feedback Script - Correct': string
  'Kai Feedback Script - Wrong': string
  'Transition Script': string
  'Knowledge point': string
}

type EditRow = {
  missionStepId: string
  cmpId: string
  phaseKey: 'P1' | 'P2' | 'P3' | 'P4'
  row: N3Row
}

const EDITABLE_KEYS: (keyof N3Row)[] = [
  'Step',
  'Display Image',
  'Video Play',
  'Kai Script 1',
  'Kai Script 2',
  'Kai Feedback Script - Correct',
  'Kai Feedback Script - Wrong',
  'Transition Script',
  'Knowledge point',
]

const props = defineProps<{
  open: boolean
  missionId: string
}>()

const emit = defineEmits<{
  close: []
  saved: []
}>()

const { api } = useApi()

const loading = ref(false)
const saving = ref(false)
const error = ref('')
const dirty = ref(false)
const editable = ref(false)
const missionName = ref('')
const rows = ref<EditRow[]>([])
const selectedIdx = ref(0)
const phaseFilter = ref<'ALL' | 'P1' | 'P2' | 'P3' | 'P4'>('ALL')

const filtered = computed(() => {
  if (phaseFilter.value === 'ALL') return rows.value
  return rows.value.filter((r) => r.phaseKey === phaseFilter.value)
})

const current = computed(() => filtered.value[selectedIdx.value] || null)

async function load() {
  loading.value = true
  error.value = ''
  try {
    const data = await api<{
      missionName: string
      editable: boolean
      rows: EditRow[]
    }>(`/api/missions/${props.missionId}/artifacts/N3/structured`)
    missionName.value = data.missionName
    editable.value = data.editable
    rows.value = data.rows.map((r) => ({
      ...r,
      row: { ...r.row },
    }))
    selectedIdx.value = 0
    phaseFilter.value = 'ALL'
    dirty.value = false
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    loading.value = false
  }
}

watch(
  () => props.open,
  (v) => {
    if (v) void load()
  },
)

watch(phaseFilter, () => {
  selectedIdx.value = 0
})

function markDirty() {
  dirty.value = true
}

async function saveDraft() {
  if (!editable.value) return
  saving.value = true
  error.value = ''
  try {
    await api(`/api/missions/${props.missionId}/artifacts/N3/structured`, {
      method: 'PUT',
      body: JSON.stringify({
        rows: rows.value.map((r) => ({
          missionStepId: r.missionStepId,
          cmpId: r.cmpId,
          phaseKey: r.phaseKey,
          row: r.row,
        })),
      }),
    })
    dirty.value = false
    emit('saved')
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    saving.value = false
  }
}

function requestClose() {
  if (dirty.value && !confirm('有未暂存修改，确定关闭？')) return
  emit('close')
}

function onKey(e: KeyboardEvent) {
  if (props.open && e.key === 'Escape') requestClose()
}
onMounted(() => window.addEventListener('keydown', onKey))
onUnmounted(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="overlay" @click.self="requestClose">
      <div class="modal" role="dialog" aria-modal="true">
        <header class="head">
          <div>
            <p class="eyebrow">v0.4 Editor</p>
            <h2>{{ missionName || 'Component content' }}</h2>
            <p class="muted small">
              {{
                editable
                  ? '可改 DisplayText 与文案字段；点「暂存」写入 Artifact（不 Approve）'
                  : '当前不可编辑（需 N3 awaiting_review）'
              }}
            </p>
          </div>
          <div class="head-actions">
            <button type="button" @click="requestClose">关闭</button>
            <button
              type="button"
              class="primary"
              :disabled="!editable || saving || !dirty"
              @click="saveDraft"
            >
              {{ saving ? '暂存中…' : '暂存' }}
            </button>
          </div>
        </header>

        <p v-if="error" class="err">{{ error }}</p>
        <p v-if="loading" class="muted pad">加载中…</p>

        <div v-else class="body">
          <aside class="toc">
            <div class="phase-tabs">
              <button
                v-for="p in (['ALL', 'P1', 'P2', 'P3', 'P4'] as const)"
                :key="p"
                type="button"
                class="phase-tab"
                :class="{ on: phaseFilter === p }"
                @click="phaseFilter = p"
              >
                {{ p === 'ALL' ? '全部' : p }}
              </button>
            </div>
            <p class="toc-title">mission_step · {{ filtered.length }}</p>
            <button
              v-for="(r, i) in filtered"
              :key="r.missionStepId + r.cmpId"
              type="button"
              class="toc-item"
              :class="{ active: i === selectedIdx }"
              @click="selectedIdx = i"
            >
              <span class="mono">{{ r.phaseKey }}</span>
              {{ r.missionStepId }} · {{ r.cmpId }}
            </button>
          </aside>

          <section v-if="current" class="editor">
            <h3>
              mission_step {{ current.missionStepId }}
              <span class="muted small">{{ current.row.Component }}</span>
            </h3>

            <div class="ro-grid">
              <label>
                <span class="muted small">Phase（只读）</span>
                <input :value="current.row.Phase" disabled />
              </label>
              <label>
                <span class="muted small">Script Step（只读）</span>
                <input :value="current.row['Script Step']" disabled />
              </label>
              <label>
                <span class="muted small">Component（只读）</span>
                <input :value="current.row.Component" disabled />
              </label>
            </div>

            <label class="field">
              <span class="muted small">DisplayText</span>
              <textarea
                v-model="current.row.DisplayText"
                rows="8"
                class="mono"
                :disabled="!editable"
                @input="markDirty"
              />
            </label>

            <label
              v-for="key in EDITABLE_KEYS"
              :key="key"
              class="field"
            >
              <span class="muted small">{{ key }}</span>
              <textarea
                v-model="current.row[key]"
                :rows="key === 'Step' || key.includes('Image') || key.includes('Video') ? 2 : 3"
                :disabled="!editable"
                @input="markDirty"
              />
            </label>
          </section>
          <p v-else class="muted pad">无 mission_step</p>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  z-index: 80;
  background: #0e1f1a73;
  backdrop-filter: blur(4px);
  display: grid;
  place-items: center;
  padding: 1rem;
}
.modal {
  width: min(1100px, 96vw);
  max-height: min(92vh, 920px);
  background: var(--mp-surface);
  color: var(--mp-text);
  border-radius: var(--mp-radius-card);
  border: 1px solid var(--mp-divider);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: var(--mp-shadow-pop);
}
.head {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  padding: 1rem 1.1rem;
  border-bottom: 1px solid var(--border, #ddd);
}
.eyebrow {
  margin: 0;
  font-size: 0.75rem;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--muted, #666);
}
.head h2 {
  margin: 0.15rem 0;
  font-size: 1.25rem;
}
.head-actions {
  display: flex;
  gap: 0.5rem;
  align-items: flex-start;
}
.primary {
  background: var(--accent, #2563eb);
  color: #fff;
  border: none;
  border-radius: 8px;
  padding: 0.45rem 0.9rem;
  cursor: pointer;
}
.primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.body {
  display: grid;
  grid-template-columns: 240px 1fr;
  min-height: 0;
  flex: 1;
  overflow: hidden;
}
.toc {
  border-right: 1px solid var(--border, #ddd);
  overflow: auto;
  padding: 0.75rem;
}
.phase-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
  margin-bottom: 0.6rem;
}
.phase-tab {
  font-size: 0.75rem;
  padding: 0.2rem 0.45rem;
  border-radius: 999px;
  border: 1px solid var(--border, #ddd);
  background: transparent;
  cursor: pointer;
}
.phase-tab.on {
  background: color-mix(in srgb, var(--accent, #2563eb) 15%, transparent);
  border-color: var(--accent, #2563eb);
}
.toc-title {
  font-size: 0.75rem;
  color: var(--muted, #666);
  margin: 0 0 0.4rem;
}
.toc-item {
  display: block;
  width: 100%;
  text-align: left;
  padding: 0.4rem 0.45rem;
  margin-bottom: 0.2rem;
  border: none;
  border-radius: 6px;
  background: transparent;
  cursor: pointer;
  font-size: 0.82rem;
}
.toc-item.active {
  background: color-mix(in srgb, var(--accent, #2563eb) 12%, transparent);
}
.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.78rem;
  margin-right: 0.25rem;
}
.editor {
  overflow: auto;
  padding: 1rem 1.1rem 1.5rem;
}
.editor h3 {
  margin: 0 0 0.75rem;
}
.ro-grid {
  display: grid;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
}
.ro-grid label,
.field {
  display: grid;
  gap: 0.25rem;
  margin-bottom: 0.65rem;
}
input,
textarea {
  width: 100%;
  border: 1px solid var(--border, #ddd);
  border-radius: 6px;
  padding: 0.4rem 0.5rem;
  font: inherit;
}
input:disabled,
textarea:disabled {
  opacity: 0.7;
  background: #f6f6f6;
}
.err {
  color: #b91c1c;
  padding: 0 1rem;
}
.pad {
  padding: 1rem;
}
.muted {
  color: var(--muted, #666);
}
.small {
  font-size: 0.85rem;
}
</style>
