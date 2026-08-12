// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-08-10',
  devtools: { enabled: true },
  css: ['~/assets/css/main.css'],
  runtimeConfig: {
    public: {
      // Prefer same-origin proxy in browser/SSR; override with absolute URL if needed
      apiBase: process.env.NUXT_PUBLIC_API_BASE || '',
    },
  },
  nitro: {
    devProxy: {
      '/api': {
        target: process.env.NUXT_API_PROXY_TARGET || 'http://127.0.0.1:3001/api',
        changeOrigin: true,
      },
    },
  },
  typescript: {
    strict: true,
    typeCheck: false,
  },
})
