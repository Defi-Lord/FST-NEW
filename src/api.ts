export async function fetchFixtures() {
  const r = await fetch('/api/fpl/fixtures?future=1', { cache: 'no-store' })
  return r.ok ? r.json() : null
}

export async function fetchBootstrap() {
  const r = await fetch('/api/fpl/bootstrap-static', { cache: 'no-store' })
  return r.ok ? r.json() : null
}

export async function fetchElementSummary(id: string | number) {
  const r = await fetch(`/api/fpl/element-summary/${id}/`, { cache: 'no-store' })
  return r.ok ? r.json() : null
}
