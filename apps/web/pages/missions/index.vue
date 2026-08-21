<script setup lang="ts">
type MissionRow = {
  id: string
  name: string
  topic: string
  status: string
  currentNode: string
  updatedAt: string
  openBlockingDecisions: number
}

const { api } = useApi()
const { data, error, refresh, pending } = await useAsyncData('missions', () =>
  api<MissionRow[]>('/api/missions'),
)

const stats = computed(() => {
  const rows = data.value || []
  const total = rows.length
  const active = rows.filter((m) =>
    /awaiting|running|pending/i.test(m.status),
  ).length
  const done = rows.filter((m) => /approved|done|complete/i.test(m.status)).length
  const blocking = rows.reduce((n, m) => n + (m.openBlockingDecisions || 0), 0)
  return { total, active, done, blocking }
})

function statusPill(status: string) {
  if (/approved|done|complete/i.test(status)) return 'status-pill--ok'
  if (/failed|error|reject/i.test(status)) return 'status-pill--danger'
  if (/awaiting|pending/i.test(status)) return 'status-pill--warn'
  if (/running/i.test(status)) return 'status-pill--info'
  return 'status-pill--neutral'
}

function fmtTime(iso: string) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}
</script>

<template>
  <div class="page">
    <header class="page-header">
      <div class="page-header__meta">
        <p class="page-eyebrow">Pipeline</p>
        <h1 class="page-title">Missions</h1>
        <p class="page-subtitle">
          口语化 script → 可视化跑 N0–N5 · 硬门禁 HITL
        </p>
      </div>
      <div class="page-header__actions">
        <button type="button" class="btn" @click="refresh()">刷新</button>
        <NuxtLink class="btn primary" to="/missions/new">+ 新建 Mission</NuxtLink>
      </div>
    </header>

    <section class="stats">
      <div class="stat-card">
        <span class="stat-card__label">All</span>
        <span class="stat-card__value">{{ stats.total }}</span>
        <span class="stat-card__hint">Total missions</span>
      </div>
      <div class="stat-card">
        <span class="stat-card__label">Active</span>
        <span class="stat-card__value">{{ stats.active }}</span>
        <span class="stat-card__hint">Awaiting / running</span>
      </div>
      <div class="stat-card">
        <span class="stat-card__label">Done</span>
        <span class="stat-card__value">{{ stats.done }}</span>
        <span class="stat-card__hint">Approved or complete</span>
      </div>
      <div class="stat-card">
        <span class="stat-card__label">Blocking</span>
        <span class="stat-card__value">{{ stats.blocking }}</span>
        <span class="stat-card__hint">Open decisions</span>
      </div>
    </section>

    <p v-if="pending" class="muted">加载中…</p>
    <p v-else-if="error" class="err">{{ error.message || error }}</p>

    <div v-else-if="!data?.length" class="card">
      <div class="empty-state">
        <div class="empty-state__mark">✦</div>
        <p class="empty-state__title">还没有 mission</p>
        <p class="muted">先贴一份口语化 script 开始。</p>
        <NuxtLink class="btn primary" to="/missions/new">创建第一个</NuxtLink>
      </div>
    </div>

    <section v-else class="data-panel">
      <div class="data-panel__toolbar">
        <h2 class="data-panel__title">Mission list</h2>
        <span class="muted mono">{{ data.length }} items</span>
      </div>
      <div class="data-panel__body">
        <NuxtLink
          v-for="m in data"
          :key="m.id"
          class="row"
          :to="`/missions/${m.id}`"
        >
          <div class="row__main">
            <strong>{{ m.name }}</strong>
            <span class="muted">{{ m.topic || '—' }}</span>
          </div>
          <span class="mono node">{{ m.currentNode }}</span>
          <span class="status-pill" :class="statusPill(m.status)">{{
            m.status
          }}</span>
          <span class="muted time">{{ fmtTime(m.updatedAt) }}</span>
          <span v-if="m.openBlockingDecisions" class="block-warn"
            >⚠ {{ m.openBlockingDecisions }}</span
          >
          <span class="chev" aria-hidden="true">→</span>
        </NuxtLink>
      </div>
    </section>
  </div>
</template>

<style scoped>
.row {
  display: grid;
  grid-template-columns: minmax(0, 1.6fr) auto auto auto auto 24px;
  align-items: center;
  gap: 12px 16px;
  padding: 16px 22px;
  border-bottom: 1px solid var(--mp-divider);
  text-decoration: none;
  color: inherit;
}
.row:last-child {
  border-bottom: none;
}
.row:hover {
  background: var(--mp-surface-tint);
  text-decoration: none;
}
.row__main {
  display: grid;
  gap: 2px;
  min-width: 0;
}
.row__main strong {
  font-size: 14px;
  font-weight: 700;
}
.node {
  color: var(--mp-text-muted);
  font-size: 12px;
}
.time {
  font-size: 12px;
  white-space: nowrap;
}
.block-warn {
  color: var(--mp-warn);
  font-size: 12px;
  font-weight: 600;
}
.chev {
  color: var(--mp-text-soft);
  justify-self: end;
}
@media (max-width: 900px) {
  .row {
    grid-template-columns: 1fr auto;
    grid-template-areas:
      'main chev'
      'node pill'
      'time warn';
  }
  .row__main {
    grid-area: main;
  }
  .node {
    grid-area: node;
  }
  .status-pill {
    grid-area: pill;
    justify-self: end;
  }
  .time {
    grid-area: time;
  }
  .block-warn {
    grid-area: warn;
    justify-self: end;
  }
  .chev {
    grid-area: chev;
  }
}
</style>
