// src/pages_History.tsx
import React from 'react';
import { listContests, getMyHistory, type Contest } from './api';

export default function HistoryPage({ onBack }: { onBack?: () => void }) {
  const [contests, setContests] = React.useState<Contest[]>([]);
  const [selected, setSelected] = React.useState<string>('');
  const [rows, setRows] = React.useState<Array<{ round: number; points: number }>>([]);
  const [meta, setMeta] = React.useState<{ title: string; realm: string } | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    (async () => {
      try {
        const r = await listContests(); // admin list, shows all; you can filter to only active if desired
        setContests(r.contests);
        if (r.contests.length) setSelected(r.contests[0].id);
      } catch (e: any) {
        setErr(String(e?.message || e));
      }
    })();
  }, []);

  const load = async () => {
    if (!selected) return;
    setBusy(true); setErr(null);
    try {
      const r = await getMyHistory(selected);
      const realm = String(r.contest.realm);
      const all = r.scores.map(s => ({ round: s.round, points: s.points }));
      let limited = all;
      if (realm === 'FREE' || realm === 'WEEKLY' || realm === 'MONTHLY') {
        limited = all.slice(-10); // FREE/WEEKLY/MONTHLY → last 10 weeks
      } // SEASONAL → all weeks
      setMeta({ title: r.contest.title, realm });
      setRows(limited);
    } catch (e: any) {
      setErr(String(e?.message || e));
      setRows([]);
    } finally { setBusy(false); }
  };

  React.useEffect(() => { load(); /* load when contest changes */ }, [selected]);

  return (
    <div className="history-wrap">
      <style>{css}</style>

      <header className="hdr">
        {onBack && <button className="btn ghost" onClick={onBack}>← Back</button>}
        <h2>History</h2>
        <div className="spacer" />
        <select value={selected} onChange={e=>setSelected(e.target.value)}>
          {contests.map(c => <option key={c.id} value={c.id}>{c.title} ({c.realm})</option>)}
        </select>
        <button className="btn" onClick={load} disabled={!selected || busy}>{busy?'Loading…':'Refresh'}</button>
      </header>

      {meta && <div className="meta">Showing <b>{meta.title}</b> • {meta.realm}</div>}
      {err && <div className="alert">{err}</div>}

      {!rows.length ? (
        <div className="muted">No history yet.</div>
      ) : (
        <div className="table">
          <div className="thead">
            <div>Round</div>
            <div>Points</div>
          </div>
          {rows.map((r) => (
            <div className="trow" key={r.round}>
              <div>GW {r.round}</div>
              <div><b>{r.points}</b></div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const css = String.raw`
.history-wrap { max-width: 820px; margin: 24px auto; padding: 16px; color: #0b1220; }
.hdr { display:flex; align-items:center; gap:10px; margin-bottom:12px; }
.hdr h2 { margin:0; font-size:22px; font-weight:900; }
.spacer { flex:1; }
.btn { appearance:none; border:none; background:#111827; color:#fff; padding:8px 12px; border-radius:10px; cursor:pointer; font-weight:800; }
.btn.ghost, .btn.ghost:where(.ghost) { background:#fff; color:#111827; border:1px solid #e5e7eb; }
.alert { border:1px solid #fecaca; background:#fff1f2; color:#991b1b; border-radius:10px; padding:10px; margin:10px 0; }
.table { border:1px solid #e5e7eb; border-radius:12px; overflow:hidden; }
.thead, .trow { display:grid; grid-template-columns: 1fr 1fr; gap:8px; }
.thead { background:#f8fafc; font-weight:900; padding:10px 12px; }
.trow  { border-top:1px solid #eef1f6; padding:10px 12px; }
.muted { opacity:.7; }
.meta { opacity:.9; margin-bottom:10px; }
`;
