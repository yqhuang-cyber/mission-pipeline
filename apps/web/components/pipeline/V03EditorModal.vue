<script setup lang="ts">
import type { CatalogCmp } from './ComponentPicker.vue'

type EditComponent = {
  id: string
  role: 'primary' | 'secondary'
  outline: string
  keyFields: string
}

type EditStep = {
  phase: 'P1' | 'P2' | 'P3' | 'P4'
  scriptStep: number
  name: string
  purpose: string
  components: EditComponent[]
}

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
const steps = ref<EditStep[]>([])
const selectedIdx = ref(0)
const catalog = ref<CatalogCmp[]>([])
const phaseAllowed = ref<Record<string, string[]>>({})

const previewOpen = ref(false)
const previewTitle = ref('')
const previewImages = ref<string[]>([])

const current = computed(() => steps.value[selectedIdx.value] || null)

const allowedOptions = computed(() => {
  const phase = current.value?.phase
  if (!phase) return catalog.value
  const allowed = new Set(phaseAllowed.value[phase] || [])
  const list = catalog.value.filter((c) => allowed.has(c.id))
  // keep current selections visible even if somehow off-list
  for (const c of current.value?.components || []) {
    if (!list.some((x) => x.id === c.id)) {
      const found = catalog.value.find((x) => x.id === c.id)
      if (found) list.push(found)
    }
  }
  return list
})

function keyFieldsOf(id: string) {
  return catalog.value.find((c) => c.id === id)?.keyFields || 'display text / assets'
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    const [master, structured] = await Promise.all([
      api<{
        components: CatalogCmp[]
        phaseAllowed: Record<string, string[]>
      }>('/api/master/components'),
      api<{
        missionName: string
        editable: boolean
        steps: EditStep[]
      }>(`/api/missions/${props.missionId}/artifacts/N2/structured`),
    ])
    catalog.value = master.components
    phaseAllowed.value = master.phaseAllowed
    missionName.value = structured.missionName
    editable.value = structured.editable
    steps.value = structured.steps.map((s) => ({
      ...s,
      components: s.components.map((c) => ({
        ...c,
        keyFields: c.keyFields || keyFieldsOf(c.id),
      })),
    }))
    selectedIdx.value = 0
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
    if (v) load()
  },
)

function onCmpChange(comp: EditComponent, id: string) {
  comp.id = id
  comp.keyFields = keyFieldsOf(id)
  dirty.value = true
}

function markDirty() {
  dirty.value = true
}

function addComponent() {
  if (!current.value || !editable.value) return
  if (current.value.components.length >= 10) return
  const opts = allowedOptions.value
  const id = opts[0]?.id || 'CMP-01'
  current.value.components.push({
    id,
    role: current.value.components.length ? 'secondary' : 'primary',
    outline: '',
    keyFields: keyFieldsOf(id),
  })
  dirty.value = true
}

function removeComponent(i: number) {
  if (!current.value || !editable.value) return
  current.value.components.splice(i, 1)
  dirty.value = true
}

function openPreview(c: CatalogCmp) {
  previewTitle.value = `${c.id} · ${c.nameZh}`
  previewImages.value = c.previewImages || []
  previewOpen.value = true
}

async function save() {
  if (!editable.value) return
  saving.value = true
  error.value = ''
  try {
    await api(`/api/missions/${props.missionId}/artifacts/N2`, {
      method: 'PUT',
      body: JSON.stringify({
        steps: steps.value.map((s) => ({
          phase: s.phase,
          scriptStep: s.scriptStep,
          name: s.name,
          purpose: s.purpose,
          components: s.components.map((c) => ({
            id: c.id,
            role: c.role,
            outline: c.outline,
          })),
        })),
      }),
    })
    dirty.value = false
    emit('saved')
    emit('close')
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    saving.value = false
  }
}

function requestClose() {
  if (dirty.value && !confirm('有未保存修改，确定关闭？')) return
  emit('close')
}

function onKey(e: KeyboardEvent) {
  if (props.open && e.key === 'Escape' && !previewOpen.value) requestClose()
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
            <p class="eyebrow">v0.3 Editor</p>
            <h2>{{ missionName || 'Stepped script' }}</h2>
            <p class="muted small">
              {{ editable ? '修改后点保存才会写入 Artifact' : '当前不可编辑（需 awaiting_review）' }}
            </p>
          </div>
          <div class="head-actions">
            <button type="button" @click="requestClose">取消</button>
            <button
              type="button"
              class="primary"
              :disabled="!editable || saving || !dirty"
              @click="save"
            >
              {{ saving ? '保存中…' : '保存' }}
            </button>
          </div>
        </header>

        <p v-if="error" class="err">{{ error }}</p>
        <p v-if="loading" class="muted pad">加载中…</p>

        <div v-else class="body">
          <aside class="toc">
            <p class="toc-title">script_step</p>
            <button
              v-for="(s, i) in steps"
              :key="s.scriptStep"
              type="button"
              class="toc-item"
              :class="{ active: i === selectedIdx }"
              @click="selectedIdx = i"
            >
              <span class="mono">{{ s.phase }}</span>
              {{ s.scriptStep }}. {{ s.name }}
            </button>
          </aside>

          <section v-if="current" class="editor">
            <h3>
              script_step {{ current.scriptStep }}. {{ current.name }}
              <span class="muted small">({{ current.phase }})</span>
            </h3>
            <p v-if="current.purpose" class="muted purpose">
              教学目的：{{ current.purpose }}
            </p>

            <table class="grid">
              <thead>
                <tr>
                  <th>Component</th>
                  <th>角色</th>
                  <th>关键字段</th>
                  <th>Content outline</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(c, ci) in current.components" :key="ci">
                  <td>
                    <PipelineComponentPicker
                      :model-value="c.id"
                      :options="allowedOptions"
                      :disabled="!editable"
                      @update:model-value="onCmpChange(c, $event)"
                      @preview="openPreview"
                    />
                  </td>
                  <td>
                    <select
                      v-model="c.role"
                      :disabled="!editable"
                      @change="markDirty"
                    >
                      <option value="primary">primary</option>
                      <option value="secondary">secondary</option>
                    </select>
                  </td>
                  <td class="kf mono">{{ c.keyFields }}</td>
                  <td>
                    <textarea
                      v-model="c.outline"
                      rows="3"
                      :disabled="!editable"
                      @input="markDirty"
                    />
                  </td>
                  <td>
                    <button
                      type="button"
                      class="danger"
                      :disabled="!editable"
                      @click="removeComponent(ci)"
                    >
                      删
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>

            <button
              type="button"
              class="add"
              :disabled="!editable || current.components.length >= 10"
              @click="addComponent"
            >
              + 添加 component（每步最多 10 个）
            </button>
          </section>
        </div>
      </div>

      <PipelineComponentPreviewLightbox
        :open="previewOpen"
        :title="previewTitle"
        :images="previewImages"
        @close="previewOpen = false"
      />
    </div>
  </Teleport>
</template>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  z-index: 1100;
  background: #0e1f1a73;
  display: grid;
  place-items: center;
  padding: 1rem;
}
.modal {
  width: min(1280px, 100%);
  height: min(92vh, 960px);
  background: var(--mp-surface);
  border: 1px solid var(--line);
  border-radius: var(--mp-radius-card);
  box-shadow: var(--mp-shadow-pop);
  display: grid;
  grid-template-rows: auto 1fr;
  overflow: hidden;
}
.head {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.9rem 1.1rem;
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
.head h2 {
  margin: 0.15rem 0;
  font-size: 1.25rem;
}
.head-actions {
  display: flex;
  gap: 0.4rem;
  align-items: flex-start;
}
.body {
  display: grid;
  grid-template-columns: 240px 1fr;
  min-height: 0;
}
.toc {
  border-right: 1px solid var(--line);
  overflow: auto;
  padding: 0.75rem;
  background: var(--mp-surface-tint);
}
.toc-title {
  margin: 0 0 0.5rem;
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--muted);
  text-transform: uppercase;
}
.toc-item {
  display: block;
  width: 100%;
  text-align: left;
  border: none;
  background: transparent;
  padding: 0.4rem 0.45rem;
  border-radius: 0.35rem;
  margin-bottom: 0.15rem;
  cursor: pointer;
  font: inherit;
  font-size: 0.82rem;
  color: var(--ink);
}
.toc-item.active,
.toc-item:hover {
  background: rgba(15, 107, 92, 0.12);
}
.editor {
  overflow: auto;
  padding: 1rem 1.15rem 1.5rem;
}
.editor h3 {
  margin: 0 0 0.35rem;
}
.purpose {
  margin: 0 0 0.75rem;
}
.grid {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
}
.grid th,
.grid td {
  border: 1px solid var(--line);
  padding: 0.4rem;
  vertical-align: top;
}
.grid th {
  background: #efe6d8;
  text-align: left;
  white-space: nowrap;
}
.kf {
  font-size: 0.75rem;
  color: var(--muted);
  max-width: 140px;
  word-break: break-word;
}
textarea,
select {
  width: 100%;
  font: inherit;
  font-size: 0.82rem;
  border: 1px solid var(--line);
  border-radius: 0.3rem;
  padding: 0.3rem;
  background: #fff;
  color: var(--ink);
  box-sizing: border-box;
}
.add {
  margin-top: 0.75rem;
}
.danger {
  font-size: 0.78rem;
  color: var(--danger);
}
.err {
  color: var(--danger);
  margin: 0;
  padding: 0.5rem 1rem;
}
.pad {
  padding: 1rem;
}
.small {
  font-size: 0.85rem;
}
.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
@media (max-width: 900px) {
  .body {
    grid-template-columns: 1fr;
  }
  .toc {
    max-height: 160px;
    border-right: none;
    border-bottom: 1px solid var(--line);
  }
}
</style>
