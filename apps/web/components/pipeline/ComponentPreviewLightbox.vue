<script setup lang="ts">
const props = defineProps<{
  images: string[]
  title: string
  open: boolean
}>()

const emit = defineEmits<{ close: [] }>()
const idx = ref(0)

watch(
  () => props.open,
  (v) => {
    if (v) idx.value = 0
  },
)

function onKey(e: KeyboardEvent) {
  if (!props.open) return
  if (e.key === 'Escape') emit('close')
  if (e.key === 'ArrowRight' && idx.value < props.images.length - 1) idx.value++
  if (e.key === 'ArrowLeft' && idx.value > 0) idx.value--
}

onMounted(() => window.addEventListener('keydown', onKey))
onUnmounted(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="lb" @click.self="emit('close')">
      <div class="lb-card" role="dialog" aria-modal="true">
        <header>
          <strong>{{ title }}</strong>
          <button type="button" @click="emit('close')">关闭</button>
        </header>
        <div v-if="images.length" class="lb-body">
          <img :src="images[idx]" :alt="title" />
          <div v-if="images.length > 1" class="nav">
            <button type="button" :disabled="idx === 0" @click="idx--">上一张</button>
            <span class="muted">{{ idx + 1 }} / {{ images.length }}</span>
            <button
              type="button"
              :disabled="idx >= images.length - 1"
              @click="idx++"
            >
              下一张
            </button>
          </div>
        </div>
        <p v-else class="muted empty">暂无原型图</p>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.lb {
  position: fixed;
  inset: 0;
  z-index: 1200;
  background: rgba(20, 18, 15, 0.55);
  display: grid;
  place-items: center;
  padding: 1rem;
}
.lb-card {
  width: min(920px, 100%);
  max-height: 92vh;
  overflow: auto;
  background: #fffaf2;
  border-radius: 0.75rem;
  border: 1px solid var(--line);
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.25);
}
header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--line);
}
.lb-body {
  padding: 0.75rem;
}
.lb-body img {
  display: block;
  width: 100%;
  height: auto;
  border-radius: 0.4rem;
  background: #efe6d8;
}
.nav {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 0.75rem;
  margin-top: 0.65rem;
}
.empty {
  padding: 2rem;
  text-align: center;
}
</style>
