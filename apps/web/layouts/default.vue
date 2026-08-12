<template>
  <div>
    <header class="top">
      <NuxtLink to="/" class="brand">Mission Pipeline</NuxtLink>
      <nav>
        <NuxtLink to="/missions">Missions</NuxtLink>
        <NuxtLink to="/catalog">ComponentCatalog</NuxtLink>
        <NuxtLink to="/mission-meta-model">MissionMetaModel</NuxtLink>
      </nav>
    </header>
    <slot />
  </div>
</template>

<style scoped>
.top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 1.5rem;
  border-bottom: 1px solid var(--line);
  background: rgba(255, 250, 242, 0.85);
  backdrop-filter: blur(8px);
  position: sticky;
  top: 0;
  z-index: 10;
}
.brand {
  font-weight: 700;
  font-size: 1.15rem;
  color: var(--brand-ink);
  text-decoration: none;
}
nav {
  display: flex;
  gap: 1rem;
}
</style>
