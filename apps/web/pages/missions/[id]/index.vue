<script setup lang="ts">
type CanvasNode = {
  node: string
  label: string
  status: string
  artifactLabel: string
  artifactDescription: string
  openBlockingDecisions: number
  canRun: boolean
  canApprove: boolean
  canSelectActivities?: boolean
  canReject?: boolean
}

type Canvas = {
  mission: {
    id: string
    name: string
    topic: string
    status: string
    currentNode: string
    masterDataVersion: string
  }
  nodes: CanvasNode[]
}

type NodeDetail = {
  node: string
  status: string
  input: { label: string; description: string; content: string } | null
  output: { label: string; description: string; content: string } | null
  decisions: Array<{
    id: string
    severity: string
    question: string
    resolved: boolean
    options: Array<{ id: string; label: string }>
  }>
}

const route = useRoute()
const id = computed(() => route.params.id as string)
const { api } = useApi()
const config = useRuntimeConfig()

const selectedNode = ref('N0')
const busy = ref(false)
const actionError = ref('')
const viewerOpen = ref(false)
const editorOpen = ref(false)
const v04EditorOpen = ref(false)
const v031Open = ref(false)

function apiOrigin(): string {
  const configured = String(config.public.apiBase || '').replace(/\/$/, '')
  if (configured) return configured
  return ''
}

function n4DownloadUrl(format: 'csv' | 'xlsx' | 'json') {
  return `${apiOrigin()}/api/missions/${id.value}/artifacts/N4/download?format=${format}`
}

const { data: canvas, refresh: refreshCanvas } = await useAsyncData(
  () => `canvas-${id.value}`,
  () => api<Canvas>(`/api/missions/${id.value}/canvas`),
  { watch: [id] },
)

const { data: detail, refresh: refreshDetail } = await useAsyncData(
  () => `node-${id.value}-${selectedNode.value}`,
  () => api<NodeDetail>(`/api/missions/${id.value}/nodes/${selectedNode.value}`),
  { watch: [id, selectedNode] },
)

const current = computed(() =>
  canvas.value?.nodes.find((n) => n.node === selectedNode.value),
)

const useV04Viewer = computed(
  () =>
    selectedNode.value === 'N3' ||
    /v0\.4|component content/i.test(detail.value?.output?.label || ''),
)

const outputPreview = computed(() => {
  const c = detail.value?.output?.content
  if (!c) return '（尚未生成）'
  return c.length > 900 ? `${c.slice(0, 900)}\n\n…（点击 Output 标题打开完整阅读器）` : c
})

watch(selectedNode, () => {
  viewerOpen.value = false
  editorOpen.value = false
  v04EditorOpen.value = false
  v031Open.value = false
})

async function refreshAll() {
  await Promise.all([refreshCanvas(), refreshDetail()])
}

async function runNode() {
  actionError.value = ''
  busy.value = true
  try {
    await api(`/api/missions/${id.value}/nodes/${selectedNode.value}/run`, {
      method: 'POST',
    })
    await refreshAll()
  } catch (e) {
    actionError.value = e instanceof Error ? e.message : String(e)
  } finally {
    busy.value = false
  }
}

async function approveNode() {
  actionError.value = ''
  busy.value = true
  try {
    await api(`/api/missions/${id.value}/nodes/${selectedNode.value}/approve`, {
      method: 'POST',
    })
    await refreshAll()
    const nodes = canvas.value?.nodes || []
    const idx = nodes.findIndex((n) => n.node === selectedNode.value)
    if (idx >= 0 && idx < nodes.length - 1) {
      selectedNode.value = nodes[idx + 1]!.node
    }
  } catch (e) {
    actionError.value = e instanceof Error ? e.message : String(e)
  } finally {
    busy.value = false
  }
}

async function rejectNode() {
  actionError.value = ''
  busy.value = true
  try {
    await api(`/api/missions/${id.value}/nodes/${selectedNode.value}/reject`, {
      method: 'POST',
    })
    await refreshAll()
  } catch (e) {
    actionError.value = e instanceof Error ? e.message : String(e)
  } finally {
    busy.value = false
  }
}

async function resolveDecision(decisionId: string, optionId: string) {
  actionError.value = ''
  busy.value = true
  try {
    await api(`/api/missions/${id.value}/decisions/${decisionId}/resolve`, {
      method: 'POST',
      body: JSON.stringify({ action: 'choose', optionId }),
    })
    await refreshAll()
  } catch (e) {
    actionError.value = e instanceof Error ? e.message : String(e)
  } finally {
    busy.value = false
  }
}

function statusClass(status: string) {
  return `st-${status}`
}

function openViewer() {
  if (detail.value?.output?.content) viewerOpen.value = true
}
</script>

<template>
  <div class="page" v-if="canvas">
    <div class="head">
      <div>
        <p class="eyebrow muted mono">Pipeline Runner</p>
        <h1>{{ canvas.mission.name }}</h1>
        <p class="muted">
          {{ canvas.mission.topic }} · {{ canvas.mission.masterDataVersion }} ·
          current {{ canvas.mission.currentNode }}
        </p>
      </div>
    </div>

    <section class="canvas card">
      <button
        v-for="n in canvas.nodes"
        :key="n.node"
        class="node"
        :class="[{ active: selectedNode === n.node }, statusClass(n.status)]"
        @click="selectedNode = n.node"
      >
        <span class="mono">{{ n.node }}</span>
        <strong>{{ n.label }}</strong>
        <span class="muted small">{{ n.artifactLabel }}</span>
        <span class="badge">{{ n.status }}</span>
        <span v-if="n.openBlockingDecisions" class="warn">
          {{ n.openBlockingDecisions }} decisions
        </span>
      </button>
    </section>

    <section class="workbench" v-if="detail && current">
      <div class="card pane">
        <h3>Input</h3>
        <p class="muted small" v-if="detail.input">
          {{ detail.input.label }} — {{ detail.input.description }}
        </p>
        <pre class="mono body">{{ detail.input?.content || '（无）' }}</pre>
      </div>
      <div class="card pane">
        <div class="pane-head">
          <h3>Output</h3>
          <div class="pane-actions">
            <button
              v-if="
                selectedNode === 'N2' &&
                detail.status === 'awaiting_activity_selection'
              "
              type="button"
              class="open-reader"
              @click="v031Open = true"
            >
              审选活动 / Component
            </button>
            <button
              v-if="
                selectedNode === 'N2' &&
                detail.output?.content &&
                detail.status === 'awaiting_review'
              "
              type="button"
              class="open-reader"
              @click="editorOpen = true"
            >
              编辑 v0.3
            </button>
            <button
              v-if="
                selectedNode === 'N3' &&
                detail.output?.content &&
                detail.status === 'awaiting_review'
              "
              type="button"
              class="open-reader"
              @click="v04EditorOpen = true"
            >
              编辑 v0.4
            </button>
            <a
              v-if="selectedNode === 'N4' && detail.output?.content"
              class="open-reader btn"
              :href="n4DownloadUrl('csv')"
              download="v0.5_mission_spec.csv"
            >
              下载 CSV
            </a>
            <a
              v-if="selectedNode === 'N4' && detail.output?.content"
              class="open-reader btn"
              :href="n4DownloadUrl('xlsx')"
              download="v0.5_mission_spec.xlsx"
            >
              下载 XLSX
            </a>
            <button
              v-if="detail.output?.content"
              type="button"
              class="open-reader"
              @click="openViewer"
            >
              打开阅读器
            </button>
          </div>
        </div>
        <button
          v-if="detail.output"
          type="button"
          class="artifact-label"
          :disabled="!detail.output.content"
          @click="openViewer"
        >
          <span class="label-main">{{ detail.output.label }}</span>
          <span class="muted small">{{ detail.output.description }}</span>
          <span class="hint">
            {{
              useV04Viewer
                ? '点击展开 · Phase / script_step 目录 + 同 step 组件表'
                : '点击展开 · Markdown 可视化 + Phase 目录'
            }}
          </span>
        </button>
        <p class="muted small" v-else>{{ current.artifactDescription }}</p>
        <pre
          class="mono body preview"
          :class="{ clickable: !!detail.output?.content }"
          @click="openViewer"
        >{{ outputPreview }}</pre>
      </div>

      <PipelineV04ViewerModal
        v-if="useV04Viewer"
        :open="viewerOpen"
        :title="detail.output?.label || current.artifactLabel"
        :description="detail.output?.description || current.artifactDescription"
        :content="detail.output?.content || ''"
        @close="viewerOpen = false"
      />
      <PipelineArtifactViewerModal
        v-else
        :open="viewerOpen"
        :title="detail.output?.label || current.artifactLabel"
        :description="detail.output?.description || current.artifactDescription"
        :content="detail.output?.content || ''"
        @close="viewerOpen = false"
      />
      <PipelineV03EditorModal
        :open="editorOpen"
        :mission-id="id"
        @close="editorOpen = false"
        @saved="refreshAll"
      />
      <PipelineV04EditorModal
        :open="v04EditorOpen"
        :mission-id="id"
        @close="v04EditorOpen = false"
        @saved="refreshAll"
      />
      <PipelineV031ActivityModal
        :open="v031Open"
        :mission-id="id"
        @close="v031Open = false"
        @confirmed="refreshAll"
      />
      <div class="side">
        <div class="card pane">
          <h3>Decisions</h3>
          <p v-if="!detail.decisions.length" class="muted">暂无待决策项</p>
          <ul v-else class="decisions">
            <li v-for="d in detail.decisions" :key="d.id">
              <span class="badge" :class="d.severity">{{ d.severity }}</span>
              {{ d.question }}
              <span v-if="d.resolved" class="muted">· resolved</span>
              <div v-if="!d.resolved && d.options?.length" class="opts">
                <button
                  v-for="opt in d.options"
                  :key="opt.id"
                  class="opt"
                  :disabled="busy"
                  @click="resolveDecision(d.id, opt.id)"
                >
                  {{ opt.label }}
                </button>
              </div>
            </li>
          </ul>
        </div>
        <div class="card pane actions">
          <h3>Actions</h3>
          <p class="muted small">状态：{{ detail.status }}</p>
          <button
            class="primary"
            :disabled="busy || !current.canRun"
            @click="runNode"
          >
            Run
          </button>
          <button
            class="primary"
            :disabled="busy || !current.canApprove"
            @click="approveNode"
          >
            Approve & Continue
          </button>
          <button
            v-if="selectedNode === 'N2' && current.canSelectActivities"
            class="primary"
            :disabled="busy"
            @click="v031Open = true"
          >
            审选活动 → Confirm v0.3
          </button>
          <button
            :disabled="busy || !(current.canReject || detail.status === 'awaiting_review')"
            @click="rejectNode"
          >
            Reject
          </button>
          <p v-if="actionError" class="err">{{ actionError }}</p>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.head { margin-bottom: 1rem; }
.eyebrow { margin: 0; letter-spacing: 0.04em; text-transform: uppercase; font-size: 0.75rem; }
h1 { margin: 0.2rem 0; }
.canvas {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 0.6rem;
  margin-bottom: 1rem;
}
.node {
  display: grid;
  gap: 0.2rem;
  text-align: left;
  padding: 0.75rem;
  min-height: 7.5rem;
  border-width: 2px;
}
.node.active { border-color: var(--brand); box-shadow: var(--shadow); }
.small { font-size: 0.8rem; }
.badge {
  display: inline-block;
  width: fit-content;
  font-size: 0.75rem;
  padding: 0.1rem 0.4rem;
  border-radius: 999px;
  background: var(--bg-accent);
}
.warn { color: var(--warn); font-size: 0.8rem; }
.st-approved { background: rgba(31, 107, 58, 0.08); }
.st-awaiting_review { background: rgba(161, 92, 18, 0.1); }
.st-awaiting_activity_selection { background: rgba(15, 90, 140, 0.1); }
.st-running { background: rgba(15, 107, 92, 0.1); }
.st-failed { background: rgba(155, 28, 28, 0.08); }
.workbench {
  display: grid;
  grid-template-columns: 1.2fr 1.2fr 0.8fr;
  gap: 0.75rem;
}
.pane h3 { margin: 0; }
.pane-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}
.pane-actions {
  display: flex;
  gap: 0.35rem;
  flex-wrap: wrap;
}
.open-reader {
  font-size: 0.8rem;
  padding: 0.25rem 0.6rem;
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  color: inherit;
}
.artifact-label {
  display: grid;
  gap: 0.15rem;
  width: 100%;
  text-align: left;
  margin: 0 0 0.55rem;
  padding: 0.55rem 0.7rem;
  border: 1px dashed var(--line);
  border-radius: 0.45rem;
  background: rgba(15, 107, 92, 0.06);
  cursor: pointer;
  font: inherit;
  color: inherit;
}
.artifact-label:hover:not(:disabled) {
  border-color: var(--brand);
  background: rgba(15, 107, 92, 0.1);
}
.artifact-label:disabled {
  cursor: default;
  opacity: 0.75;
}
.label-main {
  font-weight: 700;
  color: var(--brand-ink);
}
.hint {
  font-size: 0.75rem;
  color: var(--brand);
}
.body {
  margin: 0;
  max-height: 420px;
  overflow: auto;
  white-space: pre-wrap;
  background: #f7f1e6;
  padding: 0.75rem;
  border-radius: 0.4rem;
  border: 1px solid var(--line);
}
.body.preview.clickable {
  cursor: pointer;
}
.body.preview.clickable:hover {
  border-color: var(--brand);
}
.side { display: grid; gap: 0.75rem; align-content: start; }
.actions { display: grid; gap: 0.5rem; }
.decisions { padding-left: 1rem; margin: 0; display: grid; gap: 0.5rem; }
.opts { display: flex; flex-wrap: wrap; gap: 0.35rem; margin-top: 0.35rem; }
.opt { font-size: 0.8rem; padding: 0.25rem 0.5rem; }
.blocking { background: #fde8e8; color: var(--danger); }
.err { color: var(--danger); margin: 0; }
@media (max-width: 960px) {
  .canvas { grid-template-columns: repeat(2, 1fr); }
  .workbench { grid-template-columns: 1fr; }
}
</style>
