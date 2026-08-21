export default defineNuxtRouteMiddleware(async (to) => {
  const { user, checked, refreshMe } = useAuth()

  if (!checked.value) {
    await refreshMe()
  }

  const isLogin = to.path === '/login'

  if (isLogin) {
    if (user.value) return navigateTo('/missions')
    return
  }

  if (!user.value) {
    return navigateTo({
      path: '/login',
      query: to.fullPath !== '/' ? { redirect: to.fullPath } : undefined,
    })
  }
})
