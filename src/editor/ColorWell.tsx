import { faPalette, faXmark } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { cn } from '#/lib/utils.ts'
import { colorWell, floating } from '#/editor/look.ts'
import { createContext, useContext, useEffect, useRef, useState } from 'react'

// The colors saved as favourites, kept with the house, and how to change
// them. Every color well in the editor offers them.
export const PaletteContext = createContext<{ colors: string[]; onChange: (colors: string[]) => void } | null>(null)

// The most a palette holds, so it stays one tidy grid.
const MOST = 24

type Props = {
  value: string
  onChange: (color: string) => void
  'aria-label'?: string
  className?: string
  disabled?: boolean
}

// A color well with the saved palette beside it: a button opens the saved
// colors to pick from, and saves the one in the well to them.
export default function ColorWell({ value, onChange, className, disabled, 'aria-label': label = 'Color' }: Props) {
  const palette = useContext(PaletteContext)
  const [open, setOpen] = useState<{ top: number; right: number } | null>(null)
  const button = useRef<HTMLButtonElement>(null)
  const popover = useRef<HTMLDivElement>(null)

  // Closed by a click anywhere else, the window scrolling or Escape.
  useEffect(() => {
    if (!open) return
    const away = (e: PointerEvent) => {
      const path = e.composedPath()
      if (!path.includes(popover.current!) && !path.includes(button.current!)) setOpen(null)
    }
    // Escape closes the palette alone, not whatever the editor has selected.
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      e.preventDefault()
      setOpen(null)
    }
    const scroll = () => setOpen(null)
    window.addEventListener('pointerdown', away, true)
    window.addEventListener('keydown', key, true)
    window.addEventListener('scroll', scroll, true)
    return () => {
      window.removeEventListener('pointerdown', away, true)
      window.removeEventListener('keydown', key, true)
      window.removeEventListener('scroll', scroll, true)
    }
  }, [open])

  const well = (
    <input
      type="color"
      className={cn(colorWell, className)}
      value={value}
      disabled={disabled}
      onChange={e => onChange(e.target.value)}
      aria-label={label}
    />
  )
  if (!palette) return well

  const colors = palette.colors
  const current = value.toLowerCase()
  const saved = colors.some(c => c.toLowerCase() === current)

  return (
    <div className="flex min-w-0 items-center gap-1.5">
      {well}
      <button
        ref={button}
        type="button"
        disabled={disabled}
        aria-label={`Palette for ${label}`}
        title="Palette"
        aria-expanded={!!open}
        onClick={() => {
          if (open) return setOpen(null)
          const box = button.current!.getBoundingClientRect()
          setOpen({ top: box.bottom + 6, right: window.innerWidth - box.right })
        }}
        className={cn(
          'text-label-2 hover:text-label flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md outline-2 -outline-offset-2 outline-(--dio-line) transition-colors disabled:cursor-default disabled:opacity-40',
          open && 'text-tint outline-tint',
        )}
      >
        <FontAwesomeIcon icon={faPalette} className="size-3.5" />
      </button>
      {open && (
        <div
          ref={popover}
          role="dialog"
          aria-label="Palette"
          className={cn(floating, 'fixed z-50 flex w-[212px] flex-col gap-2 p-2.5')}
          style={{ top: open.top, right: open.right }}
        >
          <span className="text-label-2 font-mono text-[10px] font-bold tracking-[0.12em] uppercase">Palette</span>
          {colors.length ? (
            <div className="grid grid-cols-6 gap-1.5">
              {colors.map(color => (
                <span key={color} className="group/swatch relative">
                  <button
                    type="button"
                    aria-label={`Use ${color}`}
                    title={color}
                    onClick={() => {
                      onChange(color)
                      setOpen(null)
                    }}
                    className={cn(
                      'block size-7 cursor-pointer rounded-md outline-2 -outline-offset-2 outline-black/25 outline-solid',
                      color.toLowerCase() === current && 'outline-tint',
                    )}
                    style={{ background: color }}
                  />
                  <button
                    type="button"
                    aria-label={`Remove ${color} from the palette`}
                    title="Remove"
                    onClick={() => palette.onChange(colors.filter(c => c !== color))}
                    className="text-label absolute -top-1.5 -right-1.5 hidden size-4 cursor-pointer items-center justify-center rounded-full bg-(--card-background-color) text-[10px] outline-1 outline-(--dio-line) outline-solid group-hover/swatch:flex focus-visible:flex"
                  >
                    <FontAwesomeIcon icon={faXmark} className="size-2.5" />
                  </button>
                </span>
              ))}
            </div>
          ) : (
            <p className="text-label-2 text-xs">No saved colors yet. Save the one in use to pick it again anywhere.</p>
          )}
          <button
            type="button"
            disabled={saved || colors.length >= MOST}
            onClick={() => palette.onChange([...colors, current])}
            className="font-head flex h-8 cursor-pointer items-center justify-center gap-2 rounded-md text-[13px] font-bold tracking-[0.06em] uppercase outline-2 -outline-offset-2 outline-(--dio-line) outline-solid hover:bg-white/5 disabled:cursor-default disabled:opacity-50"
          >
            <span className="size-3.5 rounded-sm" style={{ background: value }} />
            {saved ? 'Saved' : colors.length >= MOST ? 'Palette full' : 'Save this color'}
          </button>
        </div>
      )}
    </div>
  )
}
