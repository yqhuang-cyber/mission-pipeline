<script setup lang="ts">
import { buildArtifactToc } from '~/utils/artifactToc'
import { renderArtifactMarkdown } from '~/utils/renderMarkdown'

const props = defineProps<{
  open: boolean
  title: string
  description?: string
  content: string
}>()

const emit = defineEmits<{
  close: []
}>()

const toc = computed(() => buildArtifactToc(props.content || ''))
const html = computed(() =>
  props.content ? renderArtifactMarkdown(props.content) : '<p class="empty">（空）</p>',
)

const activeId = ref('')
const articleRef = ref<HTMLElement | null>(null)

watch(
  () => props.open,
  (v) => {
    if (v) {
      activeId.value = toc.value[0]?.id || ''
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
  },
)

onUnmounted(() => {
  document.body.style.overflow = ''
})

function scrollTo(id: string) {
  activeId.value = id
  const root = articleRef.value
  if (!root) return
  const el = root.querySelector(`#${CSS.escape(id)}`)
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
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
            <p class="eyebrow">Artifact Reader</p>
            <h2>{{ title }}</h2>
            <p v-if="description" class="muted">{{ description }}</p>
          </div>
          <button class="close" type="button" @click="emit('close')">关闭 Esc</button>
        </header>

        <div class="modal-body">
          <aside class="toc" v-if="toc.length">
            <p class="toc-title">目录</p>
            <nav>
              <div v-for="phase in toc" :key="phase.id" class="toc-phase">
                <button
                  type="button"
                  class="toc-phase-btn"
                  :class="{ active: activeId === phase.id }"
                  @click="scrollTo(phase.id)"
                >
                  {{ phase.title }}
                </button>
                <ul>
                  <li v-for="step in phase.steps" :key="step.id">
                    <button
                      type="button"
                      class="toc-step-btn"
                      :class="{ active: activeId === step.id }"
                      @click="scrollTo(step.id)"
                    >
                      {{ step.title }}
                    </button>
                  </li>
                </ul>
              </div>
            </nav>
          </aside>
          <aside v-else class="toc empty-toc">
            <p class="toc-title">目录</p>
            <p class="muted small">未识别到 Phase / script_step 结构</p>
          </aside>

          <article ref="articleRef" class="article md" v-html="html" />
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
  background: #0e1f1a73;
  backdrop-filter: blur(4px);
  display: grid;
  place-items: center;
  padding: 1.25rem;
}
.modal {
  width: min(1200px, 100%);
  height: min(90vh, 920px);
  background: var(--mp-surface);
  border: 1px solid var(--line);
  border-radius: var(--mp-radius-card);
  box-shadow: var(--mp-shadow-pop);
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
  background: rgba(255, 250, 242, 0.95);
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
.close {
  flex-shrink: 0;
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
  background: var(--mp-surface-tint);
}
.toc-title {
  margin: 0 0 0.6rem;
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--muted);
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
.toc-phase {
  margin-bottom: 0.75rem;
}
.toc-phase-btn,
.toc-step-btn {
  display: block;
  width: 100%;
  text-align: left;
  border: none;
  background: transparent;
  padding: 0.35rem 0.45rem;
  border-radius: 0.35rem;
  cursor: pointer;
  color: var(--ink);
  font: inherit;
}
.toc-phase-btn {
  font-weight: 700;
  font-size: 0.92rem;
}
.toc-step-btn {
  font-size: 0.82rem;
  color: var(--muted);
  padding-left: 0.85rem;
}
.toc-phase-btn:hover,
.toc-step-btn:hover,
.toc-phase-btn.active,
.toc-step-btn.active {
  background: rgba(15, 107, 92, 0.12);
  color: var(--brand-ink);
}
.toc ul {
  list-style: none;
  margin: 0.15rem 0 0;
  padding: 0;
}
.article {
  overflow: auto;
  padding: 1.25rem 1.75rem 2.5rem;
  scroll-behavior: smooth;
}
.small { font-size: 0.85rem; }

/* markdown body */
.md :deep(h1) {
  font-size: 1.6rem;
  margin: 1.4rem 0 0.6rem;
  padding-bottom: 0.35rem;
  border-bottom: 2px solid var(--brand);
  scroll-margin-top: 1rem;
}
.md :deep(h2) {
  font-size: 1.25rem;
  margin: 1.35rem 0 0.5rem;
  color: var(--brand-ink);
  scroll-margin-top: 1rem;
}
.md :deep(h3) {
  font-size: 1.05rem;
  margin: 1.1rem 0 0.4rem;
  scroll-margin-top: 1rem;
}
.md :deep(p),
.md :deep(li) {
  line-height: 1.65;
}
.md :deep(blockquote) {
  margin: 0.75rem 0;
  padding: 0.55rem 0.9rem;
  border-left: 3px solid var(--brand);
  background: rgba(15, 107, 92, 0.06);
  color: #3d3830;
}
.md :deep(table) {
  width: 100%;
  border-collapse: collapse;
  margin: 0.85rem 0 1.1rem;
  font-size: 0.9rem;
}
.md :deep(th),
.md :deep(td) {
  border: 1px solid var(--line);
  padding: 0.45rem 0.6rem;
  vertical-align: top;
}
.md :deep(th) {
  background: #efe6d8;
  text-align: left;
}
.md :deep(code) {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.88em;
  background: #f0e8da;
  padding: 0.1em 0.35em;
  border-radius: 0.25rem;
}
.md :deep(pre) {
  background: #2a2621;
  color: #f4efe6;
  padding: 0.9rem 1rem;
  border-radius: 0.5rem;
  overflow: auto;
}
.md :deep(pre code) {
  background: transparent;
  color: inherit;
  padding: 0;
}
.md :deep(hr) {
  border: none;
  border-top: 1px solid var(--line);
  margin: 1.25rem 0;
}
.md :deep(strong) {
  color: #1c1915;
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
