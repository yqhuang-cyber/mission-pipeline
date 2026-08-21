<script setup lang="ts">
const { api } = useApi()
const router = useRouter()

const form = reactive({
  name: '',
  topic: '',
  ownerName: 'CD',
  scriptMd: '',
})
const submitting = ref(false)
const error = ref('')

async function submit() {
  error.value = ''
  submitting.value = true
  try {
    const mission = await api<{ id: string }>('/api/missions', {
      method: 'POST',
      body: JSON.stringify(form),
    })
    await router.push(`/missions/${mission.id}`)
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="page">
    <header class="page-header">
      <div class="page-header__meta">
        <p class="page-eyebrow">Pipeline</p>
        <h1 class="page-title">New Mission</h1>
        <p class="page-subtitle">
          粘贴口语化 mission script（v0.1），进入 Pipeline Canvas。
        </p>
      </div>
      <div class="page-header__actions">
        <NuxtLink class="btn" to="/missions">← 返回列表</NuxtLink>
      </div>
    </header>

    <form class="card form" @submit.prevent="submit">
      <label>
        <span class="lab">Name</span>
        <input
          v-model="form.name"
          required
          maxlength="100"
          placeholder="Mission 5 — …"
        />
      </label>
      <label>
        <span class="lab">Topic</span>
        <input
          v-model="form.topic"
          required
          maxlength="200"
          placeholder="教学主题"
        />
      </label>
      <label>
        <span class="lab">Owner</span>
        <input v-model="form.ownerName" required />
      </label>
      <label>
        <span class="lab">Colloquial script (v0.1)</span>
        <textarea
          v-model="form.scriptMd"
          required
          rows="16"
          placeholder="粘贴口语化 script markdown…"
        />
      </label>
      <p v-if="error" class="err banner">{{ error }}</p>
      <div class="form-actions">
        <NuxtLink class="btn" to="/missions">取消</NuxtLink>
        <button class="primary" type="submit" :disabled="submitting">
          {{ submitting ? '创建中…' : '创建并打开 Canvas' }}
        </button>
      </div>
    </form>
  </div>
</template>

<style scoped>
.form {
  display: grid;
  gap: 1rem;
}
label {
  display: grid;
  gap: 0.35rem;
}
.lab {
  font-size: 12px;
  font-weight: 600;
  color: var(--mp-text-muted);
}
.banner {
  margin: 0;
  padding: 0.65rem 0.85rem;
  border-radius: var(--mp-radius-soft);
  background: var(--mp-danger-bg);
  border: 1px solid #e5484d38;
}
.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
}
</style>
