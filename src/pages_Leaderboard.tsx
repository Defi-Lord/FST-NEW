// src/pages_Leaderboard.tsx
import { useEffect, useMemo, useState } from 'react'
import { useApp, type Player } from './state'
import TopBar from './components_TopBar'

type Entry = { name: string; points: number; you?: boolean }

/** Simple local scoring:
 * - Use player.form when present
 * - Fallback to a tiny value from price so non-form players aren’t zero
 */
function recomputePoints(team: Player[]): number {
  return Number(
    team
      .reduce((sum, p) => {
        const form = typeof p.form === 'number' ? p.form : 0
        const fallback = Math.max(0, (p.price ?? 0) * 0.05)
        return sum + (form > 0 ? form : fallback)
      }, 0)
      .toFixed(2)
  )
}

// realm-specific leaderboard endpoints with graceful fallback
async function loadExternalLeaderboard(realm: 'free' | 'weekly' | 'monthly' | 'seasonal'): Promise<Entry[] | null> {
  const tries = [
    `/leaderboard_${realm}.json`,
    `/leaderboard.json?realm=${encodeURIComponent(realm)}`,
    `/leaderboard.json`,
  ]
  for (const url of tries) {
    try {
      const res = await fetch(url, { cache: 'no-store' })
      if (!res.ok) continue
      const arr = await res.json()
      if (!Array.isArray(arr)) continue
      const normalized: Entry[] = arr
        .map((x: any) => ({ name: String(x?.name ?? 'Anon'), points: Number(x?.points ?? 0) }))
        .filter((e: Entry) => Number.isFinite(e.points))
      if (normalized.length) return normalized
    } catch { /* try next */ }
  }
  return null
}

export default function Leaderboard({
  onNext,
  onBack,
}: {
  onNext?: () => void
  onBack: () => void
}) {
  const { team, fullName, realm } = useApp()
  const [external, setExternal] = useState<Entry[] | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    ;(async () => {
      setLoading(true)
      const data = await loadExternalLeaderboard(realm)
      if (mounted) { setExternal(data); setLoading(false) }
    })()
    return () => { mounted = false }
  }, [realm])

  // your points from current realm’s team
  const yourPoints = useMemo(() => recomputePoints(team), [team])
  const yourName = (fullName?.trim() || 'You')

  // final table: your row + external rows (realm scoped)
  const table: Entry[] = useMemo(() => {
    const base: Entry[] =
      external && external.length > 0
        ? external
        : [
            { name: 'Sam', points: 62 },
            { name: 'Riley', points: 55 },
            { name: 'Alex', points: 48 },
            { name: 'Jordan', points: 44 },
          ]
    const withoutYou = base.filter(e => !e.you && e.name !== yourName)
    const youRow: Entry = { name: yourName, points: yourPoints, you: true }
    const merged = [youRow, ...withoutYou].sort((a, b) => b.points - a.points)
    return merged
  }, [external, yourName, yourPoints])

  const yourRank = useMemo(() => {
    const idx = table.findIndex(e => e.you)
    return idx >= 0 ? idx + 1 : null
  }, [table])

  return (
    <div className="screen">
      <div className="container" style={{ paddingBottom: onNext ? 96 : 24 }}>
        <TopBar
          title="Leaderboard"
          onBack={onBack}
          rightSlot={<div className="balance-chip">{yourRank ? `Rank #${yourRank}` : '—'}</div>}
        />

        <div className="subtle" style={{ marginTop: 6 }}>
          Showing <strong>{realm === 'free' ? 'Free (Global)' : realm.toUpperCase()}</strong> leaderboard
        </div>

        {loading && <div className="card subtle" style={{ marginTop: 12 }}>Loading…</div>}

        {!loading && (
          <div className="list" style={{ marginTop: 12 }}>
            {/* Header */}
            <div className="card" style={{ fontWeight: 700 }}>
              <div style={{ width: 44, textAlign: 'center' }}>#</div>
              <div style={{ flex: 1 }}>Name</div>
              <div style={{ width: 90, textAlign: 'right' }}>Points</div>
            </div>

            {/* Rows */}
            {table.map((e, i) => {
              const isYou = !!e.you
              return (
                <div key={`${e.name}-${i}`} className={`card row ${isYou ? 'pill-you' : ''}`}>
                  <div style={{ width: 44, textAlign: 'center', fontWeight: 700 }}>{i + 1}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
                    <div className="avatar" />
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <strong>
                        {e.name} {isYou && <span className="subtle">(You)</span>}
                      </strong>
                    </div>
                  </div>
                  <div style={{ width: 90, textAlign: 'right', fontWeight: 800 }}>{e.points}</div>
                </div>
              )
            })}
          </div>
        )}

        {onNext && (
          <div className="bottom-actions">
            <button className="cta" style={{ width: '100%' }} onClick={onNext}>
              Go to Rewards
            </button>
          </div>
        )}
      </div>
    </div>
  )
}