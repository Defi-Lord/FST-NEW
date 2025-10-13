// src/pages_Profile.tsx
import React from 'react'
import TopBar from './components_TopBar'
import { useApp } from './state'
import { getMe, signOut } from './api'

export default function Profile({ onBack }: { onBack?: () => void }) {
  const { walletAddress } = useApp()
  const [userId, setUserId] = React.useState<string>(walletAddress || '')
  const [tgUser, setTgUser] = React.useState<string>('—')

  React.useEffect(() => {
    (async () => {
      try {
        const me = await getMe()
        setUserId(me.user?.id || walletAddress || '')
      } catch {}
      try {
        const tg = (window as any)?.Telegram?.WebApp
        const u = tg?.initDataUnsafe?.user
        if (u?.username) setTgUser(`@${u.username}`)
        else if (u?.first_name) setTgUser(`${u.first_name}${u?.last_name ? ' ' + u.last_name : ''}`)
      } catch {}
    })()
  }, [walletAddress])

  const copy = (txt: string) => navigator.clipboard?.writeText(txt).then(() => alert('Copied!'))

  const short = (a: string) => a ? `${a.slice(0, 6)}…${a.slice(-6)}` : '—'

  const doSignOut = () => {
    signOut()
    alert('Signed out')
    onBack?.()
  }

  return (
    <div className="screen">
      <style>{css}</style>
      <TopBar title="Profile" onBack={onBack} />

      <div className="container" style={{ paddingBottom: 120 }}>
        <div className="card hero">
          <div className="logo">FST</div>
          <h2>Account</h2>
          <p className="muted">Manage your connection details</p>
        </div>

        <div className="card rowc">
          <div className="kv">
            <div className="k">Wallet</div>
            <div className="v mono">{short(userId)}</div>
          </div>
          <button className="btn-ghost" onClick={() => copy(userId)} disabled={!userId}>Copy</button>
        </div>

        <div className="card rowc">
          <div className="kv">
            <div className="k">Telegram</div>
            <div className="v">{tgUser}</div>
          </div>
        </div>

        <div className="card rowc">
          <div className="kv">
            <div className="k">Network</div>
            <div className="v">Solana (Mainnet)</div>
          </div>
        </div>

        <div className="row" style={{marginTop: 18}}>
          <button className="btn danger" onClick={doSignOut}>Sign out</button>
        </div>
      </div>
    </div>
  )
}

const css = String.raw`
.container { padding: 12px 14px; color:#fff; }
.card { background: rgba(255,255,255,0.04); border-radius: 16px; padding: 14px; border: 1px solid rgba(255,255,255,0.12); margin: 8px 0; }
.rowc { display:flex; align-items:center; justify-content:space-between; gap:12px; }
.hero { text-align:center; background: linear-gradient(135deg, rgba(99,102,241,.18), rgba(236,72,153,.18)); }
.logo { width:56px; height:56px; border-radius:14px; margin: 0 auto 6px; display:grid; place-items:center; background: linear-gradient(135deg, #6366f1, #ec4899); color:#fff; font-weight:900; }
.kv .k { opacity:.8; }
.kv .v { font-weight:900; }
.muted { opacity:.75; margin:0; }
.mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; }
.btn { appearance:none; border:none; background:#111827; color:#fff; padding:10px 12px; border-radius:12px; font-weight:900; cursor:pointer; }
.btn-ghost { appearance:none; background:transparent; color:#fff; padding:8px 10px; border-radius:10px; font-weight:800; border:1px solid rgba(255,255,255,.15); cursor:pointer; }
.btn.danger { background:#dc2626; }
`;