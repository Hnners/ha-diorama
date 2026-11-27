// The class lists the editor's pieces share, so a field, a group or a
// floating panel looks the same wherever it is. They follow the S.I.M.S.
// look the other add-ons share (M.A.S.H., C.R.A.P., L.I.B.R.A.R.Y.): squared
// 6px corners, 2px outlines, Barlow words, mono labels, and buttons in
// Barlow Condensed capitals, as in the M.A.S.H. app.

// A text field, a native select or a select's trigger: a sunk fill with a
// 2px outline, which turns the accent while it has the focus.
export const field =
  'h-8 min-w-0 rounded-lg border-2 border-line bg-(--primary-background-color,transparent) px-2.5 text-[13px] text-(--primary-text-color) transition-[border-color,box-shadow] placeholder:text-label-2 hover:border-label-2/60 focus:border-tint'

// A color well, squared, with a hairline round it so a dark color still
// shows against the panel.
export const colorWell =
  'h-8 w-full cursor-pointer rounded-lg border-0 bg-transparent p-0 outline-2 outline-solid -outline-offset-2 outline-(--dio-line) [&::-moz-color-swatch]:rounded-lg [&::-moz-color-swatch]:border-0 [&::-webkit-color-swatch]:rounded-lg [&::-webkit-color-swatch]:border-0 [&::-webkit-color-swatch-wrapper]:p-0'

// A block of related settings in the sidebar: a panel with a 2px outline.
export const group = 'flex flex-col gap-2.5 rounded-lg border-2 border-line bg-fill p-3'

// The small title over a group: mono, spaced out, in capitals.
export const groupTitle = 'px-0.5 font-mono text-[11px] font-medium tracking-[0.08em] text-label-2 uppercase'

// A row of a form: the name on the left, the control after it.
export const row = 'grid items-center gap-2 text-[13px]'

// The note under a control, saying what it does.
export const note = 'text-xs leading-snug text-label-2'

// An outlined button, for the actions next to a field.
export const plainButton =
  'flex h-8 items-center justify-center gap-1.5 rounded-md border-2 border-line bg-transparent px-3 font-head text-[15px] font-bold tracking-[0.06em] text-(--primary-text-color) uppercase transition-colors hover:border-label-2/60 hover:bg-fill active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40'

// The main action of a place: filled in the accent, with dark ink.
export const primaryButton =
  'flex h-8 cursor-pointer items-center justify-center gap-1.5 rounded-md border-2 border-tint-fill bg-tint-fill px-3.5 font-head text-[15px] font-bold tracking-[0.06em] text-on-tint uppercase transition-[filter,transform] hover:brightness-110 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40'

// An icon alone, with a fill only under the pointer.
export const iconButton =
  'flex items-center justify-center rounded-lg text-(--primary-text-color) transition-colors hover:bg-fill-strong active:bg-fill-stronger disabled:pointer-events-none disabled:opacity-35'

// The destructive action at the end of a sidebar: outlined in red.
export const deleteButton =
  'flex h-9 items-center justify-center gap-2 rounded-md border-2 border-danger/70 bg-transparent font-head text-[15px] font-bold tracking-[0.06em] text-danger uppercase transition-colors hover:bg-danger/10 active:bg-danger/18'

// Anything that floats over the editor: tips, popovers, menus and dialogs.
// A solid panel with a 2px outline and a deep shadow, like the other
// add-ons' dialogs.
export const floating =
  'dio-floating rounded-lg border-2 border-line bg-(--card-background-color)/95 shadow-[0_12px_40px_-10px_rgba(0,0,0,0.55),0_2px_8px_-2px_rgba(0,0,0,0.2)] backdrop-blur-xl'

// A key to press, in a tip.
export const kbd =
  'min-w-5 rounded-[4px] border border-line bg-fill-strong px-1.5 py-px text-center font-mono text-[11px] font-medium text-label-2'
