<script setup lang="ts">
type CatalogCmp = {
  id: string
  nameZh: string
  nameEn: string
  category: string
  techClass: string
  template: string
  example: string
  purpose: string
  interaction: string
  userInput: string
  designRule: string
  keyFields: string
  displayImage?: string
  videoPlay?: string
  phases: string[]
  previewImages: string[]
}

const { api } = useApi()
const q = ref('')
const selectedId = ref('')
const previewIdx = ref(0)

const { data, pending, error, refresh } = await useAsyncData('component-catalog', () =>
  api<{
    meta?: { version?: string; source?: string }
    components: CatalogCmp[]
  }>('/api/master/components'),
)

const filtered = computed(() => {
  const list = data.value?.components || []
  const s = q.value.trim().toLowerCase()
  if (!s) return list
  return list.filter(
    (c) =>
      c.id.toLowerCase().includes(s) ||
      c.nameZh.toLowerCase().includes(s) ||
      c.nameEn.toLowerCase().includes(s) ||
      c.techClass.toLowerCase().includes(s) ||
      c.category.toLowerCase().includes(s),
  )
})

const selected = computed(() => {
  const list = data.value?.components || []
  return (
    list.find((c) => c.id === selectedId.value) ||
    filtered.value[0] ||
    list[0] ||
    null
  )
})

watch(
  () => data.value?.components,
  (list) => {
    if (list?.length && !selectedId.value) selectedId.value = list[0]!.id
  },
  { immediate: true },
)

watch(selectedId, () => {
  previewIdx.value = 0
})

function pick(id: string) {
  selectedId.value = id
}
</script>

<template>
  <div class="page">
    <div class="head">
      <div>
        <p class="eyebrow muted mono">Master data</p>
        <h1>Component Catalog</h1>
        <p class="muted">
          {{ data?.meta?.version || 'catalog' }}
          <span v-if="data?.meta?.source"> · {{ data.meta.source }}</span>
          · {{ data?.components?.length || 0 }} components
        </p>
      </div>
      <div class="head-actions">
        <NuxtLink class="btn" to="/missions">← Missions</NuxtLink>
        <button type="button" class="btn" @click="refresh()">刷新</button>
      </div>
    </div>

    <p v-if="pending" class="muted">加载中…</p>
    <p v-else-if="error" class="err">{{ error.message || error }}</p>

    <div v-else class="layout card">
      <aside class="side">
        <input
          v-model="q"
          class="search"
          type="search"
          placeholder="搜索 CMP / 名称 / tech class…"
        />
        <nav class="list">
          <button
            v-for="c in filtered"
            :key="c.id"
            type="button"
            class="item"
            :class="{ active: selected?.id === c.id }"
            @click="pick(c.id)"
          >
            <span class="mono id">{{ c.id }}</span>
            <span class="name">{{ c.nameZh }}</span>
          </button>
        </nav>
        <p v-if="!filtered.length" class="muted small pad">无匹配</p>
      </aside>

      <section v-if="selected" class="detail">
        <header class="detail-head">
          <div>
            <h2>
              <span class="mono">{{ selected.id }}</span>
              {{ selected.nameZh }}
            </h2>
            <p class="muted">
              {{ selected.nameEn || '—' }}
              <span v-if="selected.techClass"> · <code>{{ selected.techClass }}</code></span>
            </p>
          </div>
          <div class="chips">
            <span v-if="selected.category" class="chip">{{ selected.category }}</span>
            <span v-for="p in selected.phases" :key="p" class="chip phase">{{ p }}</span>
            <span v-if="!selected.phases?.length" class="chip muted-chip">未入 eligibility</span>
          </div>
        </header>

        <div class="grid">
          <div class="block">
            <h3>原型预览</h3>
            <div v-if="selected.previewImages?.length" class="preview">
              <img
                :src="selected.previewImages[previewIdx]"
                :alt="selected.id"
              />
              <div v-if="selected.previewImages.length > 1" class="nav">
                <button
                  type="button"
                  :disabled="previewIdx === 0"
                  @click="previewIdx--"
                >
                  上一张
                </button>
                <span class="muted small">
                  {{ previewIdx + 1 }} / {{ selected.previewImages.length }}
                </span>
                <button
                  type="button"
                  :disabled="previewIdx >= selected.previewImages.length - 1"
                  @click="previewIdx++"
                >
                  下一张
                </button>
              </div>
            </div>
            <p v-else class="muted">暂无原型图</p>
          </div>

          <div class="block">
            <h3>教学 / 交互</h3>
            <dl class="kv">
              <dt>核心教学目的</dt>
              <dd>{{ selected.purpose || '—' }}</dd>
              <dt>互动方式</dt>
              <dd>{{ selected.interaction || '—' }}</dd>
              <dt>用户输入</dt>
              <dd>{{ selected.userInput || '—' }}</dd>
              <dt>选型与设计规则</dt>
              <dd>{{ selected.designRule || '—' }}</dd>
              <dt>v0.3 关键字段</dt>
              <dd class="mono">{{ selected.keyFields }}</dd>
              <dt>Display Image</dt>
              <dd class="mono">{{ selected.displayImage || 'NA' }}</dd>
              <dt>Video Play</dt>
              <dd class="mono">{{ selected.videoPlay || 'NA' }}</dd>
            </dl>
          </div>
        </div>

        <div class="block">
          <h3>组件使用规范（模版）· E</h3>
          <pre>{{ selected.template || '—' }}</pre>
        </div>
        <div class="block">
          <h3>组件使用规范（示例）· F</h3>
          <pre>{{ selected.example || '—' }}</pre>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
  margin-bottom: 1.1rem;
}
.eyebrow {
  margin: 0;
  font-size: 0.75rem;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}
h1 { margin: 0.15rem 0 0.25rem; }
.head-actions { display: flex; gap: 0.4rem; }
.layout {
  display: grid;
  grid-template-columns: 280px 1fr;
  gap: 0;
  padding: 0;
  overflow: hidden;
  min-height: 70vh;
}
.side {
  border-right: 1px solid var(--line);
  background: #f3ebe0;
  display: grid;
  grid-template-rows: auto 1fr;
  min-height: 0;
}
.search {
  margin: 0.75rem;
  font: inherit;
  padding: 0.45rem 0.6rem;
  border: 1px solid var(--line);
  border-radius: 0.35rem;
  background: #fff;
}
.list {
  overflow: auto;
  padding: 0 0.5rem 0.75rem;
}
.item {
  display: grid;
  grid-template-columns: 4.5rem 1fr;
  gap: 0.35rem;
  width: 100%;
  text-align: left;
  border: none;
  background: transparent;
  padding: 0.4rem 0.45rem;
  border-radius: 0.35rem;
  cursor: pointer;
  font: inherit;
  font-size: 0.86rem;
  color: var(--ink);
}
.item:hover,
.item.active {
  background: rgba(15, 107, 92, 0.12);
}
.id { color: var(--muted); font-size: 0.8rem; }
.detail {
  overflow: auto;
  padding: 1rem 1.25rem 1.5rem;
}
.detail-head {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  align-items: flex-start;
  margin-bottom: 1rem;
}
.detail-head h2 {
  margin: 0 0 0.25rem;
  font-size: 1.35rem;
}
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
  justify-content: flex-end;
}
.chip {
  font-size: 0.75rem;
  padding: 0.15rem 0.45rem;
  border-radius: 999px;
  background: var(--bg-accent);
  border: 1px solid var(--line);
}
.chip.phase {
  background: rgba(15, 107, 92, 0.12);
  border-color: var(--brand);
  color: var(--brand-ink);
}
.muted-chip { color: var(--muted); }
.grid {
  display: grid;
  grid-template-columns: 1.1fr 1fr;
  gap: 0.85rem;
  margin-bottom: 0.85rem;
}
.block {
  border: 1px solid var(--line);
  border-radius: 0.45rem;
  padding: 0.75rem 0.85rem;
  background: #fffdf8;
  margin-bottom: 0.75rem;
}
.block h3 {
  margin: 0 0 0.5rem;
  font-size: 0.9rem;
}
.preview img {
  display: block;
  width: 100%;
  border-radius: 0.35rem;
  background: #efe6d8;
}
.nav {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 0.65rem;
  margin-top: 0.5rem;
}
.kv {
  display: grid;
  grid-template-columns: 7.5rem 1fr;
  gap: 0.35rem 0.6rem;
  margin: 0;
  font-size: 0.88rem;
}
.kv dt {
  margin: 0;
  color: var(--muted);
  font-weight: 600;
}
.kv dd { margin: 0; }
pre {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.82rem;
  line-height: 1.5;
  background: #2a2621;
  color: #f4efe6;
  padding: 0.7rem 0.8rem;
  border-radius: 0.35rem;
  max-height: 280px;
  overflow: auto;
}
.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.small { font-size: 0.8rem; }
.pad { padding: 0.75rem; }
.err { color: var(--danger); }
code {
  font-size: 0.85em;
  background: #f0e8da;
  padding: 0.05em 0.3em;
  border-radius: 0.25rem;
}
@media (max-width: 900px) {
  .layout { grid-template-columns: 1fr; }
  .side { max-height: 240px; border-right: none; border-bottom: 1px solid var(--line); }
  .grid { grid-template-columns: 1fr; }
}
</style>
