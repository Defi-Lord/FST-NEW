import { useEffect } from 'react'

export type MenuDrawerProps = {
  open: boolean
  onClose: () => void
  onHome: () => void
  onHowToPlay: () => void
  onContact: () => void
  onAbout: () => void
}

/**
 * Glassy slide-in drawer for the hamburger menu.
 * Make sure you imported the CSS once:
 *   import './styles/menu-drawer.css'
 */
export default function MenuDrawer({
  open, onClose, onHome, onHowToPlay, onContact, onAbout,
}: MenuDrawerProps) {
  // Close on ESC
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    if (open) window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // Prevent body scroll when open
  useEffect(() => {
    const prev = document.body.style.overflow
    if (open) document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [open])

  return (
    <>
      {/* Backdrop */}
      <div
        className={`mdr-backdrop ${open ? 'mdr-backdrop--on' : ''}`}
        onClick={onClose}
        aria-hidden={!open}
      />
      {/* Panel */}
      <aside className={`mdr ${open ? 'mdr--on' : ''}`} role="dialog" aria-modal="true" aria-label="Main menu">
        <div className="mdr__header">
          <button className="mdr__close" onClick={onClose} aria-label="Close menu">✕</button>
          <div className="mdr__brand">
            <span className="mdr__logo">FST</span>
            <span className="mdr__title">Fantasy Sport Token</span>
          </div>
        </div>

        <nav className="mdr__nav" aria-label="Menu">
          <button className="mdr__item" onClick={() => { onHome(); onClose() }}>
            <IconHome /> Home
          </button>
          <button className="mdr__item" onClick={() => { onHowToPlay(); onClose() }}>
            <IconHow /> How to Play
          </button>
          <button className="mdr__item" onClick={() => { onContact(); onClose() }}>
            <IconContact /> Contact Us
          </button>
          <button className="mdr__item" onClick={() => { onAbout(); onClose() }}>
            <IconAbout /> About Us
          </button>
        </nav>

        <div className="mdr__footer">
          <span>© {new Date().getFullYear()} FST</span>
        </div>
      </aside>
    </>
  )
}

/* tiny inline icons (no deps) */
function IconHome() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
      <path d="M3 10.5 12 3l9 7.5V21a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1v-10.5z"
            fill="currentColor" opacity="0.9" />
    </svg>
  )
}
function IconHow() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
      <path d="M10.5 7a3.5 3.5 0 1 1 2.8 5.7V14h-2v-2.2A3.5 3.5 0 0 1 10.5 7zm-.5 9h3v3h-3v-3z"
            fill="currentColor" opacity="0.9" />
    </svg>
  )
}
function IconContact() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
      <path d="M2 5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v.2l-10 6.5L2 5.2V5zm0 3.3V19a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8.3l-9.4 6.1a2 2 0 0 1-2.2 0L2 8.3z"
            fill="currentColor" opacity="0.9" />
    </svg>
  )
}
function IconAbout() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
      <path d="M12 2a10 10 0 1 1 0 20A10 10 0 0 1 12 2zm0 6.5a1.25 1.25 0 1 0 0-2.5 1.25 1.25 0 0 0 0 2.5zM10.8 18h2.4v-7h-2.4v7z"
            fill="currentColor" opacity="0.9" />
    </svg>
  )
}

/* Ensure it's a module in any TS config edge-case */
export {}
