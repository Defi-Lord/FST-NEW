// src/components_TopBar.tsx
export default function TopBar({
  title,
  onBack,
  rightSlot,
  leftSlot,             // ← NEW
}: {
  title?: string
  onBack?: () => void
  rightSlot?: any
  leftSlot?: any        // ← NEW
}) {
  return (
    <div className="topbar">
      <div className="topbar-left">
        {leftSlot ?? (onBack && (
          <button className="btn-back" onClick={onBack} aria-label="Back">‹</button>
        ))}
        {title && <div className="topbar-title">{title}</div>}
      </div>
      <div className="topbar-right">{rightSlot}</div>
    </div>
  )
}