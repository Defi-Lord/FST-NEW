// src/pages_Admin.tsx
import React from 'react';
import {
  adminHealth,
  listContests,
  createContest,
  toggleContest,
  deleteContest,
  listUsers,
  getContestLeaderboard,
  type Contest,
  type AdminUser,
  type LeaderboardEntry,
} from './api';

type Tab = 'overview' | 'contests' | 'users' | 'leaderboard';

export default function AdminPage({ onBack }: { onBack?: () => void }) {
  const [tab, setTab] = React.useState<Tab>('overview');
  const [health, setHealth] = React.useState<'loading'|'ok'|'bad'>('loading');
  const [err, setErr] = React.useState<string | null>(null);

  // contests
  const [contests, setContests] = React.useState<Contest[]>([]);
  const [title, setTitle] = React.useState('');
  const [realm, setRealm] = React.useState<Contest['realm']>('FREE');
  const [fee, setFee] = React.useState<number>(0);
  const [busy, setBusy] = React.useState(false);

  // users
  const [users, setUsers] = React.useState<AdminUser[]>([]);
  const [userSearch, setUserSearch] = React.useState('');

  // leaderboard
  const [selectedContest, setSelectedContest] = React.useState<string>('');
  const [leaderboard, setLeaderboard] = React.useState<LeaderboardEntry[]>([]);
  const [lbBusy, setLbBusy] = React.useState(false);

  const loadHealth = React.useCallback(async () => {
    setErr(null);
    try {
      await adminHealth();
      setHealth('ok');
    } catch (e: any) {
      setHealth('bad');
      setErr(String(e?.message || e));
    }
  }, []);

  const loadContests = React.useCallback(async () => {
    try {
      const res = await listContests();
      setContests(res.contests);
      if (!selectedContest && res.contests.length) {
        setSelectedContest(res.contests[0].id);
      }
    } catch (e: any) {
      setErr(String(e?.message || e));
    }
  }, [selectedContest]);

  const loadUsers = React.useCallback(async () => {
    try {
      const res = await listUsers();
      setUsers(res.users);
    } catch (e: any) {
      setErr(String(e?.message || e));
    }
  }, []);

  React.useEffect(() => { loadHealth(); loadContests(); loadUsers(); }, [loadHealth, loadContests, loadUsers]);

  const filteredUsers = React.useMemo(() => {
    if (!userSearch.trim()) return users;
    const q = userSearch.trim().toLowerCase();
    return users.filter(u =>
      u.id.toLowerCase().includes(q) ||
      (u.displayName || '').toLowerCase().includes(q)
    );
  }, [users, userSearch]);

  const createOne = async () => {
    if (!title) return;
    setBusy(true); setErr(null);
    try {
      await createContest({ title, realm, entryFee: Number(fee) });
      setTitle(''); setFee(0);
      await loadContests();
    } catch (e: any) {
      setErr(String(e?.message || e));
    } finally { setBusy(false); }
  };

  const toggleOne = async (id: string, active: boolean) => {
    setErr(null);
    try {
      await toggleContest(id, active);
      await loadContests();
    } catch (e: any) { setErr(String(e?.message || e)); }
  };

  const removeOne = async (id: string) => {
    if (!confirm('Delete this contest?')) return;
    setErr(null);
    try {
      await deleteContest(id);
      await loadContests();
    } catch (e: any) { setErr(String(e?.message || e)); }
  };

  const loadLeaderboard = async () => {
    if (!selectedContest) return;
    setLbBusy(true); setErr(null);
    try {
      const res = await getContestLeaderboard(selectedContest);
      setLeaderboard(res.entries);
    } catch (e: any) {
      setErr(String(e?.message || e));
      setLeaderboard([]);
    } finally { setLbBusy(false); }
  };

  React.useEffect(() => { if (tab === 'leaderboard') loadLeaderboard(); }, [tab, selectedContest]);

  return (
    <div className="admin-wrap">
      <style>{css}</style>

      <header className="admin-header">
        <div className="left">
          {onBack && <button className="btn ghost" onClick={onBack}>← Back</button>}
          <h2>Admin Dashboard</h2>
        </div>
        <div className={`pill ${health === 'ok' ? 'ok' : health === 'bad' ? 'bad' : 'warn'}`}>
          {health === 'loading' ? 'Checking…' : health === 'ok' ? 'API OK' : 'API Error'}
        </div>
      </header>

      {err && <div className="alert">{err}</div>}

      <nav className="tabs">
        <button className={`tab ${tab==='overview'?'active':''}`} onClick={()=>setTab('overview')}>Overview</button>
        <button className={`tab ${tab==='contests'?'active':''}`} onClick={()=>setTab('contests')}>Contests</button>
        <button className={`tab ${tab==='users'?'active':''}`} onClick={()=>setTab('users')}>Users</button>
        <button className={`tab ${tab==='leaderboard'?'active':''}`} onClick={()=>setTab('leaderboard')}>Leaderboard</button>
      </nav>

      {tab === 'overview' && (
        <section className="grid">
          <div className="card kpi">
            <div className="kpi-label">Total Users</div>
            <div className="kpi-value">{users.length}</div>
          </div>
          <div className="card kpi">
            <div className="kpi-label">Contests</div>
            <div className="kpi-value">{contests.length}</div>
          </div>
          <div className="card kpi">
            <div className="kpi-label">Active Contests</div>
            <div className="kpi-value">{contests.filter(c=>c.active).length}</div>
          </div>
          <div className="card kpi">
            <div className="kpi-label">Inactive Contests</div>
            <div className="kpi-value">{contests.filter(c=>!c.active).length}</div>
          </div>
        </section>
      )}

      {tab === 'contests' && (
        <>
          <section className="card">
            <h3>Create Contest</h3>
            <div className="form-row">
              <input placeholder="Title" value={title} onChange={e=>setTitle(e.target.value)} />
              <select value={realm} onChange={e=>setRealm(e.target.value as Contest['realm'])}>
                <option value="FREE">FREE</option>
                <option value="WEEKLY">WEEKLY</option>
                <option value="MONTHLY">MONTHLY</option>
                <option value="SEASONAL">SEASONAL</option>
              </select>
              <input type="number" placeholder="Entry fee" value={fee} onChange={e=>setFee(Number(e.target.value))} />
              <button className="btn" onClick={createOne} disabled={busy || !title}>{busy?'Creating…':'Create'}</button>
            </div>
          </section>

          <section className="card">
            <h3>Existing Contests</h3>
            {!contests.length ? (
              <div className="muted">No contests yet.</div>
            ) : (
              <div className="list">
                {contests.map(c => (
                  <div key={c.id} className="row">
                    <div className="title">
                      <div className="name">{c.title}</div>
                      <div className="meta">#{c.id.slice(0,8)} • {c.realm} • Fee: <b>{c.entryFee}</b></div>
                    </div>
                    <div className="status">
                      <span className={`dot ${c.active?'on':'off'}`} />
                      {c.active ? 'Active' : 'Inactive'}
                    </div>
                    <div className="actions">
                      <button className="btn ghost" onClick={() => toggleOne(c.id, !c.active)}>{c.active?'Deactivate':'Activate'}</button>
                      <button className="btn danger" onClick={() => removeOne(c.id)}>Delete</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}

      {tab === 'users' && (
        <section className="card">
          <h3>Users</h3>
          <div className="toolbar">
            <input
              className="search"
              placeholder="Search by id or display name…"
              value={userSearch}
              onChange={e=>setUserSearch(e.target.value)}
            />
          </div>
          {!filteredUsers.length ? (
            <div className="muted">No users found.</div>
          ) : (
            <div className="table">
              <div className="thead">
                <div>User ID</div>
                <div>Display</div>
                <div>Created</div>
                <div>Updated</div>
              </div>
              {filteredUsers.map(u => (
                <div className="trow" key={u.id}>
                  <div className="mono">{u.id}</div>
                  <div>{u.displayName || '—'}</div>
                  <div>{new Date(u.createdAt).toLocaleString()}</div>
                  <div>{new Date(u.updatedAt).toLocaleString()}</div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {tab === 'leaderboard' && (
        <section className="card">
          <h3>Leaderboard</h3>
          <div className="form-row">
            <select value={selectedContest} onChange={(e)=>setSelectedContest(e.target.value)}>
              {contests.map(c => <option key={c.id} value={c.id}>{c.title} ({c.realm})</option>)}
            </select>
            <button className="btn" onClick={loadLeaderboard} disabled={!selectedContest || lbBusy}>{lbBusy?'Loading…':'Refresh'}</button>
          </div>
          {!leaderboard.length ? (
            <div className="muted">No leaderboard entries yet.</div>
          ) : (
            <div className="table">
              <div className="thead">
                <div>Rank</div>
                <div>User</div>
                <div>Display</div>
                <div>Points</div>
              </div>
              {leaderboard.map((e, i) => (
                <div className="trow" key={`${e.userId}-${i}`}>
                  <div>{e.rank}</div>
                  <div className="mono">{e.userId}</div>
                  <div>{e.displayName || '—'}</div>
                  <div><b>{e.points}</b></div>
                </div>
              ))}
            </div>
          )}
          <div className="hint">The leaderboard endpoint currently returns an empty list until scoring is wired.</div>
        </section>
      )}
    </div>
  );
}

const css = String.raw`
.admin-wrap { max-width: 1080px; margin: 24px auto; padding: 16px; color: #0b1220; }
.admin-header { display:flex; align-items:center; gap:12px; margin-bottom: 12px; }
.admin-header .left { display:flex; align-items:center; gap:10px; }
.admin-header h2 { margin:0; font-size:22px; font-weight:900; letter-spacing:.2px; }
.pill { margin-left:auto; padding:4px 10px; border-radius:999px; font-size:12px; border:1px solid rgba(0,0,0,0.08); }
.pill.ok { background: rgba(16,185,129,.15); }
.pill.warn { background: rgba(234,179,8,.15); }
.pill.bad { background: rgba(239,68,68,.15); }

.tabs { display:flex; gap:8px; margin: 14px 0; border-bottom: 1px solid #e5e7eb; }
.tab { appearance:none; background:none; border:none; padding:10px 14px; font-weight:800; cursor:pointer; opacity:.7; }
.tab.active { opacity:1; border-bottom: 2px solid #6366f1; color:#111827; }

.card { border:1px solid #e5e7eb; border-radius: 14px; padding: 14px; background: #fff; box-shadow: 0 6px 30px rgba(0,0,0,0.04); margin-bottom: 14px; }
.kpi { text-align:center; padding: 18px; background: linear-gradient(135deg, rgba(99,102,241,.08), rgba(236,72,153,.08)); }
.kpi-label { font-size:12px; text-transform:uppercase; letter-spacing:.2px; opacity:.7; }
.kpi-value { font-size:28px; font-weight:900; margin-top: 6px; }

.grid { display:grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap: 12px; }
@media (max-width: 860px){ .grid { grid-template-columns: repeat(2, minmax(0,1fr)); } }
@media (max-width: 520px){ .grid { grid-template-columns: repeat(1, minmax(0,1fr)); } }

.form-row { display:flex; gap:10px; flex-wrap:wrap; }
.form-row > * { min-width: 160px; }

.list .row { display:grid; grid-template-columns: 1fr 140px 220px; align-items:center; gap: 8px; border:1px solid #eef1f6; border-radius:12px; padding:10px 12px; }
@media (max-width: 720px){ .list .row { grid-template-columns: 1fr; align-items:flex-start; } }

.title .name { font-weight:900; }
.title .meta { font-size:12px; opacity:.7; }

.status { display:flex; align-items:center; gap:8px; }
.dot { width:10px; height:10px; border-radius:999px; display:inline-block; }
.dot.on { background:#16a34a; }
.dot.off{ background:#ef4444; }

.actions { display:flex; gap:8px; justify-content:flex-end; }
.btn { appearance:none; border:none; background:#111827; color:#fff; padding: 8px 12px; border-radius: 10px; cursor:pointer; font-weight:800; }
.btn.ghost { background:#fff; color:#111827; border:1px solid #e5e7eb; }
.btn.danger { background:#ef4444; }

.alert { border:1px solid #fecaca; background:#fff1f2; color:#991b1b; border-radius: 10px; padding: 10px; margin: 10px 0; }

.toolbar { display:flex; justify-content:space-between; align-items:center; gap:10px; margin-bottom: 12px; }
.search { flex:1; min-width: 240px; padding:8px 10px; border-radius:10px; border:1px solid #e5e7eb; }

.table { border:1px solid #e5e7eb; border-radius: 12px; overflow:hidden; }
.thead, .trow { display:grid; grid-template-columns: 2fr 1.2fr 1.2fr 1.2fr; gap: 8px; }
.thead { background:#f8fafc; font-weight:900; padding:10px 12px; }
.trow  { border-top:1px solid #eef1f6; padding:10px 12px; }
.mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; }
.muted { opacity: .7; }
.hint { font-size:12px; opacity:.7; margin-top: 8px; }
`;