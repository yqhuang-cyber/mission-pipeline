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
</script>

<template>
  <div class="page">
    <div class="head">
      <div>
        <h1>Missions</h1>
        <p class="muted">口语化 script → 可视化跑 N0–N5 · 硬门禁 HITL</p>
      </div>
      <div class="head-actions">
        <NuxtLink class="btn primary" to="/missions/new">新建 Mission</NuxtLink>
      </div>
    </div>

    <p v-if="pending" class="muted">加载中…</p>
    <p v-else-if="error" class="err">{{ error.message || error }}</p>

    <div v-else-if="!data?.length" class="card empty">
      <p>还没有 mission。先贴一份口语化 script 开始。</p>
      <NuxtLink class="btn primary" to="/missions/new">创建第一个</NuxtLink>
    </div>

    <div v-else class="list">
      <NuxtLink
        v-for="m in data"
        :key="m.id"
        class="card row"
        :to="`/missions/${m.id}`"
      >
        <div>
          <strong>{{ m.name }}</strong>
          <div class="muted">{{ m.topic }}</div>
        </div>
        <div class="meta mono">
          <span>{{ m.currentNode }}</span>
          <span>{{ m.status }}</span>
          <span v-if="m.openBlockingDecisions">⚠ {{ m.openBlockingDecisions }}</span>
        </div>
      </NuxtLink>
    </div>

    <button class="btn" style="margin-top: 1rem" @click="refresh()">刷新</button>
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
  gap: 0.45rem;
  flex-wrap: wrap;
}
h1 { margin: 0 0 0.25rem; }
.list { display: grid; gap: 0.75rem; }
.row {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  text-decoration: none;
  color: inherit;
}
.row:hover { border-color: var(--brand); }
.meta { display: flex; gap: 0.75rem; align-items: center; }
.empty { text-align: center; padding: 2rem; }
.err { color: var(--danger); }
</style>
