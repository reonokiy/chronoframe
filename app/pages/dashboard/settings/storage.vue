<script setup lang="ts">
definePageMeta({ layout: 'dashboard' })
const { data } = await useFetch('/api/system/storage')
</script>
<template>
  <div class="p-6 space-y-4">
    <h1 class="text-xl font-semibold">Storage</h1>
    <p>
      {{
        data?.provider === 's3'
          ? 'Private S3 storage'
          : 'Local development storage'
      }}
    </p>
    <p class="text-muted">
      Storage is configured by the deployment administrator.
    </p>
  </div>
</template>
