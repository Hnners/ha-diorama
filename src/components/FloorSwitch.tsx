import { ALL_FLOORS, type Floor } from '#/lib/floors.ts'
import { cn } from '#/lib/utils.ts'

type Props = {
  // From the lowest up.
  floors: Floor[]
  current: string | null
  // Whether there is a button above the floors to show them all at once.
  all?: boolean
  onPick: (floor: string) => void
}

// The floors of the home in the card's top right corner, the highest at the
// top, the way a lift's buttons stand. The one in view is lit, the others
// faint until hovered, like the arrow back to the whole home.
export default function FloorSwitch({ floors, current, all = false, onPick }: Props) {
  const buttons = [...floors].reverse()
  if (all) buttons.unshift({ id: ALL_FLOORS, name: 'All floors', level: Infinity })
  return (
    <div
      role="group"
      aria-label="Floors"
      className="font-sims absolute top-2.5 right-2.5 z-10 flex flex-col items-end gap-0.5"
    >
      {buttons.map(floor => {
        const on = floor.id === current
        return (
          <button
            key={floor.id}
            type="button"
            aria-pressed={on}
            title={
              on ? floor.name : floor.id === ALL_FLOORS ? 'Show every floor' : `Go to the ${floor.name.toLowerCase()}`
            }
            onClick={() => onPick(floor.id)}
            className={cn(
              'duration-slow flex h-8 cursor-pointer items-center gap-2 rounded-lg border-2 px-3 text-[12px] font-semibold tracking-[0.05em] whitespace-nowrap uppercase transition [-webkit-tap-highlight-color:transparent] active:scale-95',
              on
                ? 'border-[#6fd250] bg-[#6fd250] text-[#0c1a07] opacity-100'
                : 'mouse:hover:opacity-100 border-transparent bg-transparent text-(--primary-text-color,#e1e1e1) opacity-60',
            )}
          >
            <span
              aria-hidden
              className={cn('size-1.5 rounded-[1px] bg-current transition', on ? 'opacity-100' : 'scale-75 opacity-50')}
            />
            {floor.name}
          </button>
        )
      })}
    </div>
  )
}
