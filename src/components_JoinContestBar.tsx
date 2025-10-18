// src/components_JoinContestBar.tsx
import React from 'react'

type Props = {
  onClick: () => void
  /** Main title (keeps legacy default) */
  label?: string
  /** Sub text (keeps legacy default) */
  sub?: string
  /** Disable interaction (dim + no click) */
  disabled?: boolean
}

export default function JoinContestBar({
  onClick,
  label = 'Join contest',
  sub = '$5 entry · Weekly · Monthly · Seasonal',
  disabled = false,
}: Props) {
  const handleKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onClick()
    }
  }

  return (
    <div
      className={`jc-wrap ${disabled ? 'is-disabled' : ''}`}
      onClick={() => { if (!disabled) onClick() }}
      onKeyDown={handleKey}
      role="button"
      aria-label={label}
      aria-disabled={disabled}
      tabIndex={0}
    >
      <style>{`
        .jc-wrap {
          position: relative;
          border-radius: 16px;
          padding: 12px 14px;
          cursor: pointer;
          user-select: none;
          overflow: hidden;
          border: 1px solid rgba(255,255,255,0.16);
          background:
            radial-gradient(120% 120% at 0% 0%, rgba(99,102,241,0.22), transparent 60%),
            radial-gradient(120% 120% at 100% 100%, rgba(236,72,153,0.22), transparent 60%),
            linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0.04));
          transition: transform 120ms ease, box-shadow 120ms ease, border-color 120ms ease, opacity 120ms ease;
        }
        .jc-wrap:hover {
          transform: translateY(-1px);
          border-color: rgba(255,255,255,0.28);
          box-shadow: 0 16px 40px rgba(99,102,241,0.35);
        }
        .jc-wrap::before {
          content:"";
          position:absolute; inset:-2px;
          background: conic-gradient(from 0deg,
            rgba(99,102,241,0.0),
            rgba(99,102,241,0.8),
            rgba(236,72,153,0.8),
            rgba(99,102,241,0.0) 70%);
          filter: blur(18px);
          animation: jc-spin 8s linear infinite;
          opacity: .6;
          z-index: -1;
        }
        @keyframes jc-spin { to { transform: rotate(360deg); } }

        .jc-row { display:flex; align-items:center; gap:12px; }
        .jc-icon {
          width:40px; height:40px; border-radius:12px;
          display:grid; place-items:center;
          background: radial-gradient(circle at 30% 30%, rgba(99,102,241,0.45), rgba(236,72,153,0.45));
        }
        .jc-title { font-weight: 900; letter-spacing: .2px; }
        .jc-sub { opacity:.9; font-size: 12px; }
        .jc-chevron { margin-left:auto; font-weight:900; opacity:.85; }

        .jc-wrap.is-disabled {
          opacity: .5;
          cursor: not-allowed;
          pointer-events: none;
        }
      `}</style>

      <div className="jc-row">
        <div className="jc-icon" aria-hidden>
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden>
            <path d="M6 4h12l2 6-8 10L4 10l2-6z" fill="#fff" opacity=".95"/>
          </svg>
        </div>
        <div style={{display:'flex',flexDirection:'column'}}>
          <div className="jc-title">{label}</div>
          <div className="jc-sub">{sub}</div>
        </div>
        <div className="jc-chevron" aria-hidden>→</div>
      </div>
    </div>
  )
}