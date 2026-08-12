<script setup lang="ts">
type Candidate = {
  id: string
  nameZh: string
  rationale: string
  recommended?: boolean
  fromN1?: boolean
}

type Activity = {
  id: string
  title: string
  intent: string
  sourceAnchor: string
  candidates: Candidate[]
  selectedComponentId: string
  selectionThinking?: string
}

type StepBlock = {
  phase: string
  scriptStep: number
  name: string
  purpose: string
  activities: Activity[]
}

type V031Document = {
  version: 'v0.3.1'
  missionName: string
  steps: StepBlock[]
}

type CatalogCmp = {
  id: string
  nameZh: string
  purpose?: string
  previewImages?: string[]
}

const props = defineProps<{
  open: boolean
  missionId: string
}>()

const emit = defineEmits<{
  close: []
  confirmed: []
}>()

const { api } = useApi()

const loading = ref(false)
const saving = ref(false)
const confirming = ref(false)
const error = ref('')
const editable = ref(false)
const missionName = ref('')
const steps = ref<StepBlock[]>([])
const selectedStepIdx = ref(0)
const catalog = ref<CatalogCmp[]>([])
const phaseAllowed = ref<Record<string, string[]>>({})

const previewOpen = ref(false)
const previewTitle = ref('')
const previewImages = ref<string[]>([])

const current = computed(() => steps.value[selectedStepIdx.value] || null)

const allSelected = computed(() =>
  steps.value.every((s) =>
    s.activities.every((a) => Boolean(a.selectedComponentId)),
  ),
)

function catalogOf(id: string) {
  return catalog.value.find((c) => c.id === id)
}

function openPreview(id: string, nameZh?: string) {
  const c = catalogOf(id)
  previewTitle.value = `${id} · ${c?.nameZh || nameZh || id}`
  previewImages.value = c?.previewImages || []
  previewOpen.value = true
}

function otherOptions(step: StepBlock, activity: Activity) {
  const allowed = new Set(phaseAllowed.value[step.phase] || [])
  const inCandidates = new Set(activity.candidates.map((c) => c.id))
  return catalog.value.filter(
    (c) => allowed.has(c.id) && !inCandidates.has(c.id),
  )
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    const [master, v031] = await Promise.all([
      api<{
        components: CatalogCmp[]
        phaseAllowed: Record<string, string[]>
      }>('/api/master/components'),
      api<{
        missionName: string
        editable: boolean
        document: V031Document
      }>(`/api/missions/${props.missionId}/artifacts/N2/v031`),
    ])
    catalog.value = master.components
    phaseAllowed.value = master.phaseAllowed
    missionName.value = v031.missionName
    editable.value = v031.editable
    steps.value = v031.document.steps.map((s) => ({
      ...s,
      activities: s.activities.map((a) => ({ ...a })),
    }))
    selectedStepIdx.value = 0
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    loading.value = false
  }
}

const MAX_ACTIVITIES = 10

function defaultCandidates(phase: string): Candidate[] {
  const allowed = phaseAllowed.value[phase] || []
  return allowed.slice(0, 5).map((id, i) => {
    const c = catalogOf(id)
    return {
      id,
      nameZh: c?.nameZh || id,
      rationale: 'phase 允许列表',
      recommended: i === 0,
    }
  })
}

function renumberActivities(step: StepBlock) {
  step.activities.forEach((a, i) => {
    a.id = `${step.scriptStep}.${i + 1}`
  })
}

function addActivity() {
  if (!editable.value || !current.value) return
  if (current.value.activities.length >= MAX_ACTIVITIES) return
  const phase = current.value.phase
  const candidates = defaultCandidates(phase)
  const selected = candidates[0]?.id || ''
  current.value.activities.push({
    id: `${current.value.scriptStep}.${current.value.activities.length + 1}`,
    title: '新教学活动',
    intent: current.value.purpose
      ? `服务教学目的「${current.value.purpose}」`
      : '',
    sourceAnchor: '',
    candidates,
    selectedComponentId: selected,
  })
  renumberActivities(current.value)
}

function removeActivity(index: number) {
  if (!editable.value || !current.value) return
  if (current.value.activities.length <= 1) return
  current.value.activities.splice(index, 1)
  renumberActivities(current.value)
}

function payload() {
  return {
    steps: steps.value.map((s) => ({
      scriptStep: s.scriptStep,
      activities: s.activities.map((a) => ({
        id: a.id,
        title: a.title,
        intent: a.intent,
        sourceAnchor: a.sourceAnchor,
        selectedComponentId: a.selectedComponentId,
        candidates: a.candidates,
      })),
    })),
  }
}

async function saveDraft() {
  if (!editable.value) return
  saving.value = true
  error.value = ''
  try {
    await api(`/api/missions/${props.missionId}/artifacts/N2/v031`, {
      method: 'PUT',
      body: JSON.stringify(payload()),
    })
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    saving.value = false
  }
}

async function confirm() {
  if (!editable.value || !allSelected.value) return
  confirming.value = true
  error.value = ''
  try {
    await api(`/api/missions/${props.missionId}/nodes/N2/confirm-activities`, {
      method: 'POST',
      body: JSON.stringify(payload()),
    })
    emit('confirmed')
    emit('close')
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    confirming.value = false
  }
}

watch(
  () => props.open,
  (open) => {
    if (open) void load()
  },
)
</script>

<template>
  <div v-if="open" class="overlay" @click.self="emit('close')">
    <div class="modal card">
      <header class="head">
        <div>
          <p class="eyebrow muted">V0.3.1 · 教学活动分析</p>
          <h2>{{ missionName || 'Activity selection' }}</h2>
          <p class="muted small">
            可增删活动、微调描述；每个 activity 选 1 个 component。Confirm 后生成 v0.3。
          </p>
        </div>
        <button type="button" class="ghost" @click="emit('close')">关闭</button>
      </header>

      <p v-if="error" class="err">{{ error }}</p>
      <p v-if="loading" class="muted">加载中…</p>

      <div v-else class="body">
        <aside class="steps">
          <button
            v-for="(s, i) in steps"
            :key="s.scriptStep"
            type="button"
            class="step"
            :class="{ active: i === selectedStepIdx }"
            @click="selectedStepIdx = i"
          >
            <span class="mono">{{ s.phase }} · {{ s.scriptStep }}</span>
            <span>{{ s.name }}</span>
            <span class="muted small">{{ s.activities.length }} activities</span>
          </button>
        </aside>

        <section v-if="current" class="detail">
          <h3>script_step {{ current.scriptStep }}. {{ current.name }}</h3>
          <p v-if="current.purpose" class="purpose">教学目的：{{ current.purpose }}</p>

          <article
            v-for="(a, ai) in current.activities"
            :key="a.id"
            class="activity"
          >
            <div class="act-head">
              <span class="mono badge">Activity {{ a.id }}</span>
              <input
                v-model="a.title"
                class="title-input"
                :disabled="!editable"
                placeholder="活动标题"
              />
              <button
                v-if="editable"
                type="button"
                class="danger-btn"
                title="删除此活动"
                :disabled="current.activities.length <= 1"
                @click="removeActivity(ai)"
              >
                删除
              </button>
            </div>
            <label class="field">
              <span class="muted small">意图（可编辑）</span>
              <textarea v-model="a.intent" rows="2" :disabled="!editable" />
            </label>
            <label class="field">
              <span class="muted small">原文锚点（可编辑）</span>
              <textarea
                v-model="a.sourceAnchor"
                rows="2"
                :disabled="!editable"
                placeholder="对应原文片段"
              />
            </label>

            <p v-if="a.selectionThinking" class="think">
              <span class="muted small">选型思考</span>
              <br />
              {{ a.selectionThinking }}
            </p>

            <fieldset class="candidates" :disabled="!editable">
              <legend class="muted small">候选 component（单选 · 点「原型」看 UI）</legend>
              <div
                v-for="c in a.candidates"
                :key="c.id"
                class="cand"
                :class="{ on: a.selectedComponentId === c.id }"
              >
                <label class="cand-main">
                  <input
                    v-model="a.selectedComponentId"
                    type="radio"
                    :value="c.id"
                  />
                  <span>
                    <strong>{{ c.id }} {{ c.nameZh }}</strong>
                    <span v-if="c.recommended" class="tag">recommended</span>
                    <span v-if="c.fromN1" class="tag">from_n1</span>
                    <br />
                    <span class="muted small">{{ c.rationale }}</span>
                  </span>
                </label>
                <button
                  type="button"
                  class="prev"
                  title="查看 UI 原型图"
                  @click.stop="openPreview(c.id, c.nameZh)"
                >
                  原型
                </button>
              </div>
            </fieldset>

            <div v-if="editable" class="field other">
              <span class="muted small">其它（同 Phase 允许列表）</span>
              <div class="other-row">
                <select
                  :value="
                    a.candidates.some((c) => c.id === a.selectedComponentId)
                      ? ''
                      : a.selectedComponentId
                  "
                  @change="
                    (e) => {
                      const v = (e.target as HTMLSelectElement).value
                      if (v) a.selectedComponentId = v
                    }
                  "
                >
                  <option value="">— 从列表另选 —</option>
                  <option
                    v-for="o in otherOptions(current, a)"
                    :key="o.id"
                    :value="o.id"
                  >
                    {{ o.id }} {{ o.nameZh }}
                  </option>
                </select>
                <button
                  type="button"
                  class="prev"
                  title="查看当前另选 component 的 UI 原型"
                  :disabled="
                    a.candidates.some((c) => c.id === a.selectedComponentId) ||
                    !a.selectedComponentId
                  "
                  @click="openPreview(a.selectedComponentId)"
                >
                  原型
                </button>
              </div>
            </div>
          </article>

          <button
            v-if="editable"
            type="button"
            class="add-act"
            :disabled="current.activities.length >= MAX_ACTIVITIES"
            @click="addActivity"
          >
            + 添加 activity（本步最多 {{ MAX_ACTIVITIES }} 个）
          </button>
        </section>
      </div>

      <footer class="foot">
        <p class="muted small">
          {{
            editable
              ? '可增删活动；保存草稿或 Confirm 写入。每步至少保留 1 个 activity。'
              : '当前不可编辑'
          }}
        </p>
        <div class="actions">
          <button
            type="button"
            :disabled="!editable || saving || confirming"
            @click="saveDraft"
          >
            {{ saving ? '保存中…' : '保存草稿' }}
          </button>
          <button
            type="button"
            class="primary"
            :disabled="!editable || !allSelected || confirming || saving"
            @click="confirm"
          >
            {{ confirming ? '生成中…' : 'Confirm → 生成 v0.3' }}
          </button>
        </div>
      </footer>
    </div>
    <PipelineComponentPreviewLightbox
      :open="previewOpen"
      :title="previewTitle"
      :images="previewImages"
      @close="previewOpen = false"
    />
  </div>
</template>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(20, 18, 16, 0.45);
  z-index: 1100;
  display: grid;
  place-items: center;
  padding: 1rem;
}
.modal {
  width: min(1100px, 100%);
  max-height: min(90vh, 900px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.head {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  padding-bottom: 0.75rem;
  border-bottom: 1px solid var(--border, #ddd);
}
.eyebrow {
  margin: 0;
  font-size: 0.75rem;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
h2 {
  margin: 0.2rem 0;
}
.body {
  display: grid;
  grid-template-columns: 220px 1fr;
  gap: 0.75rem;
  overflow: hidden;
  flex: 1;
  min-height: 0;
  padding: 0.75rem 0;
}
.steps {
  overflow: auto;
  display: grid;
  gap: 0.35rem;
  align-content: start;
}
.step {
  text-align: left;
  display: grid;
  gap: 0.1rem;
  padding: 0.5rem 0.6rem;
}
.step.active {
  border-color: var(--brand);
}
.detail {
  overflow: auto;
  padding-right: 0.25rem;
}
.purpose {
  margin: 0.35rem 0 0.75rem;
  color: var(--muted, #666);
}
.activity {
  border: 1px solid var(--border, #ddd);
  border-radius: 8px;
  padding: 0.75rem;
  margin-bottom: 0.75rem;
  background: rgba(0, 0, 0, 0.02);
}
.act-head {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  margin-bottom: 0.5rem;
}
.danger-btn {
  flex-shrink: 0;
  font-size: 0.78rem;
  padding: 0.25rem 0.5rem;
  color: var(--danger, #9b1c1c);
  border-color: rgba(155, 28, 28, 0.35);
}
.danger-btn:disabled {
  opacity: 0.4;
}
.add-act {
  width: 100%;
  margin-top: 0.25rem;
  margin-bottom: 0.5rem;
  padding: 0.55rem;
  border-style: dashed;
}
.badge {
  font-size: 0.75rem;
  padding: 0.1rem 0.4rem;
  border-radius: 999px;
  background: var(--bg-accent, #eee);
}
.title-input {
  flex: 1;
  font-weight: 600;
}
.field {
  display: grid;
  gap: 0.25rem;
  margin: 0.4rem 0;
}
.think {
  margin: 0.4rem 0;
  padding: 0.55rem 0.7rem;
  border-radius: 8px;
  background: color-mix(in srgb, var(--accent, #3b82f6) 8%, transparent);
  border: 1px solid color-mix(in srgb, var(--accent, #3b82f6) 22%, transparent);
  font-size: 0.86rem;
  line-height: 1.45;
}
.field textarea,
.field select,
.title-input {
  width: 100%;
}
.anchor {
  margin: 0.25rem 0 0.5rem;
}
.candidates {
  border: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.35rem;
}
.cand {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 0.5rem;
  align-items: center;
  padding: 0.45rem 0.5rem;
  border: 1px solid transparent;
  border-radius: 6px;
}
.cand-main {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.5rem;
  cursor: pointer;
  min-width: 0;
}
.cand.on {
  border-color: var(--brand);
  background: rgba(15, 107, 92, 0.06);
}
.prev {
  flex-shrink: 0;
  font-size: 0.78rem;
  padding: 0.25rem 0.5rem;
  white-space: nowrap;
}
.other-row {
  display: flex;
  gap: 0.4rem;
  align-items: center;
}
.other-row select {
  flex: 1;
  min-width: 0;
}
.tag {
  margin-left: 0.35rem;
  font-size: 0.7rem;
  padding: 0.05rem 0.3rem;
  border-radius: 999px;
  background: rgba(161, 92, 18, 0.15);
}
.foot {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  border-top: 1px solid var(--border, #ddd);
  padding-top: 0.75rem;
}
.actions {
  display: flex;
  gap: 0.5rem;
}
.err {
  color: var(--danger, #9b1c1c);
}
.small {
  font-size: 0.85rem;
}
.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
</style>
