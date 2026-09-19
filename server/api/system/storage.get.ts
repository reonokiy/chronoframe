export default defineEventHandler(async (event) => {
  await requireUserSession(event)
  return {
    provider: useStorageProvider(event).storageProvider.config?.provider,
  }
})
