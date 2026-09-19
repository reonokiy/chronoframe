export function validateMediaKey(key: string, prefix: string): boolean {
  if (
    !key ||
    key.startsWith('/') ||
    key.includes('\\') ||
    [...key].some((char) => char.charCodeAt(0) < 32) ||
    key.split('/').some((part) => part === '..' || part === '.' || part === '')
  )
    return false
  const root = prefix.replace(/^\/+|\/+$/g, '')
  return !root || key.startsWith(`${root}/`)
}
