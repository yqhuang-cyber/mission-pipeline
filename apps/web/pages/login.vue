<script setup lang="ts">
definePageMeta({ layout: false })

const { login } = useAuth()
const route = useRoute()
const router = useRouter()

const username = ref('admin')
const password = ref('')
const showPassword = ref(false)
const submitting = ref(false)
const error = ref('')

async function onSubmit() {
  error.value = ''
  submitting.value = true
  try {
    await login(username.value.trim(), password.value)
    const redirect = String(route.query.redirect || '/missions')
    await router.replace(redirect.startsWith('/') ? redirect : '/missions')
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="login">
    <section class="login__hero">
      <div class="login__brand">
        <span class="login__brand-logo" aria-hidden="true">MP</span>
        <div>
          <div class="login__brand-title">Mission Pipeline</div>
          <div class="login__brand-sub">Operations console</div>
        </div>
      </div>

      <div class="login__hero-body">
        <p class="login__hero-eyebrow">Welcome back</p>
        <h1 class="login__hero-title">Pipeline Runner</h1>
        <p class="login__hero-text">
          从口语化 script 到 v0.5 mission spec —— N0–N5 硬门禁、活动选型与内容填充，一站完成。
        </p>
      </div>

      <div class="login__hero-foot">
        <span class="login__hero-foot-dot" />
        Admin access · local runner
      </div>
    </section>

    <section class="login__panel">
      <form class="login__card" @submit.prevent="onSubmit">
        <p class="login__card-eyebrow">Sign in</p>
        <h2 class="login__card-title">Sign in to Runner</h2>
        <p class="login__card-sub">使用管理员账号继续。</p>

        <label class="field">
          <span class="field__lab">Username</span>
          <input
            v-model="username"
            autocomplete="username"
            required
            placeholder="admin"
          />
        </label>

        <label class="field">
          <span class="field__lab">Password</span>
          <div class="field__pw">
            <input
              v-model="password"
              :type="showPassword ? 'text' : 'password'"
              autocomplete="current-password"
              required
              placeholder="••••••••"
            />
            <button
              type="button"
              class="field__toggle"
              @click="showPassword = !showPassword"
            >
              {{ showPassword ? '隐藏' : '显示' }}
            </button>
          </div>
        </label>

        <p v-if="error" class="login__error">{{ error }}</p>

        <button class="login__submit" type="submit" :disabled="submitting">
          {{ submitting ? 'Signing in…' : 'Sign in' }}
        </button>
      </form>
    </section>
  </div>
</template>

<style scoped>
.login {
  min-height: 100vh;
  display: grid;
  grid-template-columns: 1.1fr 1fr;
  background: var(--mp-canvas);
}

.login__hero {
  position: relative;
  overflow: hidden;
  color: var(--mp-sider-text-strong);
  background: linear-gradient(160deg, #0e1f1a, #11261f 38%, #1c3a2f);
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 56px 56px 48px;
}
.login__hero::before {
  content: '';
  pointer-events: none;
  position: absolute;
  inset: 0;
  background:
    radial-gradient(540px 360px at 18% 12%, #72ff842e, #0000 60%),
    radial-gradient(420px 320px at 92% 86%, #f5a4002e, #0000 60%);
}
.login__hero > * {
  position: relative;
}

.login__brand {
  display: flex;
  align-items: center;
  gap: 14px;
}
.login__brand-logo {
  display: grid;
  place-items: center;
  height: 36px;
  padding: 0 12px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.04em;
  color: #fffbf0;
  background: linear-gradient(140deg, #0e1f1a, #1f3a30 65%, #2d6a4f);
  box-shadow: inset 0 1px #ffffff2e, 0 2px 6px -2px #0e1f1a66;
}
.login__brand-title {
  font-size: 18px;
  font-weight: 700;
}
.login__brand-sub {
  margin-top: 4px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.24em;
  text-transform: uppercase;
  color: #fffbf08c;
}

.login__hero-body {
  display: flex;
  flex-direction: column;
  gap: 18px;
  max-width: 440px;
}
.login__hero-eyebrow {
  margin: 0;
  letter-spacing: 0.28em;
  text-transform: uppercase;
  color: var(--mp-accent);
  font-size: 11px;
  font-weight: 700;
}
.login__hero-title {
  margin: 0;
  letter-spacing: -0.02em;
  font-size: 40px;
  font-weight: 700;
  line-height: 1.1;
  color: var(--mp-sider-text-strong);
}
.login__hero-text {
  margin: 0;
  color: #fffbf0ad;
  font-size: 15px;
  line-height: 1.65;
}
.login__hero-foot {
  display: flex;
  align-items: center;
  gap: 12px;
  color: #fffbf080;
  font-size: 12px;
}
.login__hero-foot-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--mp-brand-glow);
  box-shadow: 0 0 0 4px #72ff842e;
}

.login__panel {
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 56px;
}
.login__card {
  width: 100%;
  max-width: 380px;
  background: var(--mp-surface);
  border: 1px solid var(--mp-divider);
  border-radius: var(--mp-radius-card);
  box-shadow: var(--mp-shadow-card);
  padding: 36px 32px 32px;
  display: grid;
  gap: 18px;
}
.login__card-eyebrow {
  margin: 0;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--mp-text-soft);
  font-size: 11px;
  font-weight: 700;
}
.login__card-title {
  margin: 0;
  font-size: 22px;
  font-weight: 700;
  color: var(--mp-text);
}
.login__card-sub {
  margin: -8px 0 0;
  color: var(--mp-text-muted);
  font-size: 14px;
}

.field {
  display: grid;
  gap: 0.4rem;
}
.field__lab {
  font-size: 12px;
  font-weight: 600;
  color: var(--mp-text-muted);
}
.field__pw {
  position: relative;
}
.field__pw input {
  width: 100%;
  padding-right: 4.2rem;
}
.field__toggle {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  border: none;
  background: transparent;
  box-shadow: none;
  color: var(--mp-text-soft);
  font-size: 12px;
  font-weight: 600;
  padding: 0.35rem 0.5rem;
}
.field__toggle:hover {
  color: var(--mp-text);
}

.login__error {
  margin: 0;
  padding: 0.65rem 0.85rem;
  border-radius: var(--mp-radius-soft);
  background: var(--mp-danger-bg);
  border: 1px solid #e5484d38;
  color: var(--mp-danger-fg);
  font-size: 13px;
}

.login__submit {
  width: 100%;
  border: none;
  border-radius: var(--mp-radius-soft);
  background: var(--mp-primary);
  color: #fff;
  font-weight: 700;
  padding: 0.85rem 1rem;
  box-shadow: 0 1px #141e190a;
}
.login__submit:hover:not(:disabled) {
  background: var(--mp-primary-deep);
}
.login__submit:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

@media (max-width: 900px) {
  .login {
    grid-template-columns: 1fr;
  }
  .login__hero {
    padding: 40px 32px;
    min-height: 42vh;
  }
  .login__hero-title {
    font-size: 32px;
  }
  .login__panel {
    padding: 32px 24px 56px;
  }
}
</style>
