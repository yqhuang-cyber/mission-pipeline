<script setup lang="ts">
const route = useRoute()
const siderOpen = ref(false)
const { user, logout } = useAuth()
const router = useRouter()

const nav = [
  { n: '01', label: 'Missions', sub: 'PIPELINE', to: '/missions' },
  { n: '02', label: 'Catalog', sub: 'COMPONENTS', to: '/catalog' },
  { n: '03', label: 'Meta Model', sub: 'SCHEMA', to: '/mission-meta-model' },
] as const

function isActive(to: string) {
  if (to === '/missions') {
    return route.path === '/missions' || route.path.startsWith('/missions/')
  }
  return route.path === to || route.path.startsWith(`${to}/`)
}

watch(
  () => route.fullPath,
  () => {
    siderOpen.value = false
  },
)

async function onSignOut() {
  await logout()
  await router.push('/login')
}
</script>

<template>
  <div class="shell" :class="{ 'shell--sider-open': siderOpen }">
    <header class="shell-header">
      <div class="shell-header__left">
        <button
          type="button"
          class="shell-burger"
          aria-label="Toggle navigation"
          @click="siderOpen = !siderOpen"
        >
          ☰
        </button>
        <NuxtLink to="/missions" class="shell-brand">
          <span class="shell-brand__logo" aria-hidden="true">MP</span>
          <span class="shell-brand__meta">
            <span class="shell-brand__title">Mission Pipeline</span>
            <span class="shell-brand__sub">RUNNER · V1</span>
          </span>
        </NuxtLink>
        <span class="shell-divider" aria-hidden="true" />
        <span class="shell-status">
          <span class="shell-status__dot" />
          Pipeline ready
        </span>
      </div>
      <div class="shell-header__right">
        <span class="shell-env">DEV</span>
        <div v-if="user" class="shell-user">
          <span class="shell-user__avatar">{{
            user.username.slice(0, 1).toUpperCase()
          }}</span>
          <span class="shell-user__meta">
            <span class="shell-user__name">{{ user.username }}</span>
            <span class="shell-user__role">{{ user.role }}</span>
          </span>
        </div>
        <button type="button" class="shell-signout" @click="onSignOut">
          Sign out
        </button>
      </div>
    </header>

    <div class="shell-body">
      <div
        v-if="siderOpen"
        class="shell-scrim"
        @click="siderOpen = false"
      />
      <aside class="shell-sider">
        <p class="shell-sider__group">Workspace</p>
        <nav class="shell-nav">
          <NuxtLink
            v-for="item in nav"
            :key="item.to"
            :to="item.to"
            class="shell-nav__item"
            :class="{ 'shell-nav__item--active': isActive(item.to) }"
          >
            <span class="shell-nav__num">{{ item.n }}</span>
            <span class="shell-nav__label">{{ item.label }}</span>
            <span class="shell-nav__sub">{{ item.sub }}</span>
          </NuxtLink>
        </nav>
        <p class="shell-sider__foot">v0.1 · Mission Pipeline</p>
      </aside>

      <main class="shell-main">
        <slot />
      </main>
    </div>
  </div>
</template>

<style scoped>
.shell {
  min-height: 100vh;
  background: var(--mp-canvas);
}
.shell-header {
  position: sticky;
  top: 0;
  z-index: 40;
  height: var(--mp-header-height);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 28px;
  background: var(--mp-surface);
  border-bottom: 1px solid var(--mp-divider);
}
.shell-header__left,
.shell-header__right {
  display: flex;
  align-items: center;
  gap: 14px;
}
.shell-burger {
  display: none;
  border: 1px solid var(--mp-border);
  background: var(--mp-surface-tint);
  width: 36px;
  height: 36px;
  padding: 0;
  border-radius: 10px;
}
.shell-brand {
  display: flex;
  align-items: center;
  gap: 12px;
  text-decoration: none;
  color: inherit;
}
.shell-brand:hover {
  text-decoration: none;
}
.shell-brand__logo {
  display: grid;
  place-items: center;
  height: 30px;
  padding: 0 10px;
  border-radius: 8px;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.04em;
  color: #fffbf0;
  background: linear-gradient(140deg, #0e1f1a, #1f3a30 65%, #2d6a4f);
  box-shadow: inset 0 1px #ffffff2e, 0 2px 6px -2px #0e1f1a66;
}
.shell-brand__meta {
  display: flex;
  flex-direction: column;
  line-height: 1.1;
}
.shell-brand__title {
  font-size: 15px;
  font-weight: 700;
  color: var(--mp-text);
}
.shell-brand__sub {
  margin-top: 4px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: var(--mp-text-soft);
}
.shell-divider {
  width: 1px;
  align-self: stretch;
  margin: 14px 4px 14px 8px;
  background: var(--mp-divider);
}
.shell-status {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--mp-text-muted);
}
.shell-status__dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--mp-brand-glow);
  box-shadow: 0 0 0 4px #72ff842e;
}
.shell-env {
  border-radius: var(--mp-radius-pill);
  border: 1px solid var(--mp-divider);
  background: var(--mp-surface-tint);
  padding: 5px 12px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.14em;
  color: var(--mp-text-soft);
}
.shell-user {
  display: flex;
  align-items: center;
  gap: 10px;
  border: 1px solid var(--mp-divider);
  background: var(--mp-surface-tint);
  border-radius: var(--mp-radius-pill);
  padding: 4px 12px 4px 4px;
}
.shell-user__avatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  font-size: 12px;
  font-weight: 700;
  color: #fff;
  background: linear-gradient(140deg, #0e1f1a, #2d6a4f);
}
.shell-user__meta {
  display: flex;
  flex-direction: column;
  line-height: 1.1;
}
.shell-user__name {
  font-size: 12px;
  font-weight: 700;
  color: var(--mp-text);
}
.shell-user__role {
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--mp-text-soft);
}
.shell-signout {
  border: none;
  background: transparent;
  box-shadow: none;
  color: var(--mp-text-muted);
  font-size: 12px;
  font-weight: 600;
  padding: 0.35rem 0.45rem;
}
.shell-signout:hover {
  color: var(--mp-text);
  text-decoration: underline;
}
.shell-body {
  display: flex;
  align-items: flex-start;
  min-height: calc(100vh - var(--mp-header-height));
}
.shell-sider {
  position: sticky;
  top: var(--mp-header-height);
  flex: 0 0 var(--mp-sider-width);
  width: var(--mp-sider-width);
  height: calc(100vh - var(--mp-header-height));
  padding: 20px 14px 24px;
  background: linear-gradient(180deg, var(--mp-sider-bg), var(--mp-sider-bg-deep));
  color: var(--mp-sider-text);
  display: flex;
  flex-direction: column;
  gap: 12px;
  box-shadow: 0 24px 48px -32px #0009;
  z-index: 30;
}
.shell-sider__group {
  margin: 0 10px 4px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: #fffbf080;
}
.shell-nav {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.shell-nav__item {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 12px;
  color: var(--mp-sider-text);
  text-decoration: none;
  border: 1px solid transparent;
  transition: background 0.16s, color 0.16s, border-color 0.16s;
}
.shell-nav__item:hover {
  color: var(--mp-sider-text-strong);
  background: #ffffff0a;
  text-decoration: none;
}
.shell-nav__item--active {
  color: var(--mp-sider-text-strong);
  background: #ffffff14;
  border-color: var(--mp-sider-line-strong);
  box-shadow: inset 3px 0 0 var(--mp-brand-glow);
}
.shell-nav__num {
  width: 28px;
  height: 28px;
  border-radius: 999px;
  display: grid;
  place-items: center;
  font-size: 11px;
  font-weight: 700;
  color: var(--mp-accent);
  background: #f5a40014;
  border: 1px solid #f5a40033;
}
.shell-nav__item--active .shell-nav__num {
  background: #f5a4002e;
  border-color: #f5a40066;
}
.shell-nav__label {
  font-size: 14px;
  font-weight: 700;
}
.shell-nav__sub {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.14em;
  color: #fffbf08c;
}
.shell-sider__foot {
  margin: auto 10px 0;
  font-size: 11px;
  color: #fffbf066;
}
.shell-main {
  flex: 1;
  min-width: 0;
  padding: 24px 28px 40px;
}
.shell-scrim {
  display: none;
}

@media (max-width: 960px) {
  .shell-burger {
    display: inline-grid;
    place-items: center;
  }
  .shell-divider,
  .shell-status {
    display: none;
  }
  .shell-sider {
    position: fixed;
    left: 0;
    top: var(--mp-header-height);
    transform: translateX(-105%);
    transition: transform 0.2s ease;
  }
  .shell--sider-open .shell-sider {
    transform: translateX(0);
  }
  .shell-scrim {
    display: block;
    position: fixed;
    inset: var(--mp-header-height) 0 0 0;
    background: #0e1f1a66;
    z-index: 25;
  }
  .shell-main {
    padding: 16px 16px 40px;
  }
  .page-header {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
