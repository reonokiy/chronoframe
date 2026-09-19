<script setup lang="ts">
const config = useRuntimeConfig()
useHead({ title: 'Sign in' })
</script>
<template>
  <div class="min-h-svh flex flex-col items-center justify-center gap-6 p-6">
    <h1 class="text-2xl font-semibold">{{ config.public.app.title }}</h1>
    <UButton
      to="/api/auth/oidc"
      external
      size="xl"
      icon="tabler:login"
      >{{ config.public.oidcLabel }}</UButton
    >
  </div>
</template>
