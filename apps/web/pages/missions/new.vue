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
    <h1>新建 Mission</h1>
    <p class="muted">粘贴口语化 mission script（v0.1 colloquial script），进入 Pipeline Canvas。</p>

    <form class="card form" @submit.prevent="submit">
      <label>
        Name
        <input v-model="form.name" required maxlength="100" placeholder="Mission 5 — …" />
      </label>
      <label>
        Topic
        <input v-model="form.topic" required maxlength="200" placeholder="教学主题" />
      </label>
      <label>
        Owner
        <input v-model="form.ownerName" required />
      </label>
      <label>
        Colloquial script (v0.1)
        <textarea
          v-model="form.scriptMd"
          required
          rows="16"
          placeholder="粘贴口语化 script markdown…"
        />
      </label>
      <p v-if="error" class="err">{{ error }}</p>
      <button class="primary" type="submit" :disabled="submitting">
        {{ submitting ? '创建中…' : '创建并打开 Canvas' }}
      </button>
    </form>
  </div>
</template>

<style scoped>
.form { display: grid; gap: 1rem; margin-top: 1rem; }
label { display: grid; gap: 0.35rem; font-size: 0.95rem; }
input, textarea {
  font: inherit;
  padding: 0.65rem 0.75rem;
  border: 1px solid var(--line);
  border-radius: 0.4rem;
  background: #fff;
}
.err { color: var(--danger); margin: 0; }
</style>
