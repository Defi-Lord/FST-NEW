// src/lib/tg.ts
export function getWebApp() {
  return (window as any)?.Telegram?.WebApp
}

export function getInitData(): string {
  try { return getWebApp()?.initData || '' } catch { return '' }
}

export function supports(min: string): boolean {
  try { return getWebApp()?.isVersionAtLeast?.(min) === true } catch { return false }
}
