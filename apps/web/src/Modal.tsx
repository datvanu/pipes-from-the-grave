import { useEffect, useRef, type ReactNode, type RefObject } from 'react'

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'

export function Modal({
  open,
  titleId,
  title,
  onClose,
  width = 560,
  initialFocusRef,
  children,
}: {
  open: boolean
  titleId: string
  title: string
  onClose: () => void
  width?: number
  initialFocusRef?: RefObject<HTMLElement | null>
  children: ReactNode
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  const lastFocus = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) return
    lastFocus.current = document.activeElement as HTMLElement | null
    const panel = panelRef.current
    const focusables = () =>
      panel
        ? Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
            (el) => !el.hasAttribute('disabled') && el.getAttribute('aria-hidden') !== 'true',
          )
        : []
    const start = initialFocusRef?.current || focusables()[0] || panel
    start?.focus()

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }
      if (event.key !== 'Tab' || !panel) return
      const list = focusables()
      if (list.length === 0) {
        event.preventDefault()
        return
      }
      const index = list.indexOf(document.activeElement as HTMLElement)
      if (event.shiftKey && (index <= 0)) {
        event.preventDefault()
        list[list.length - 1].focus()
      } else if (!event.shiftKey && (index === list.length - 1 || index < 0)) {
        event.preventDefault()
        list[0].focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      lastFocus.current?.focus()
    }
  }, [open, onClose, initialFocusRef])

  if (!open) return null

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.72)',
        display: 'grid',
        placeItems: 'center',
        zIndex: 50,
      }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        style={{
          width,
          maxWidth: 'calc(100vw - 32px)',
          maxHeight: '80vh',
          overflow: 'auto',
          background: '#16161f',
          border: '1px solid #55ff99',
          borderRadius: 12,
          padding: 16,
        }}
      >
        <h2 id={titleId} style={{ fontFamily: 'Cinzel, serif', color: '#55ff99' }}>
          {title}
        </h2>
        {children}
      </div>
    </div>
  )
}
