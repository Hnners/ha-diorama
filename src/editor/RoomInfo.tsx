import { Select } from '#/components/ui/select.tsx'
import { decorationKind } from '#/decoration/catalog.ts'
import { ResetButton, SelectedHeader, Slider, Switch } from '#/editor/panel.tsx'
import { neighboursOf } from '#/geometry/passages.ts'
import {
  EDITOR_TINT_COLOR,
  FLOOR_MATERIALS,
  FENCE_COLOR,
  FENCE_HEIGHT_M,
  FENCE_SLAT_M,
  OUTSIDE_WALLS,
  type OutsideWalls,
  ROOM_COLORS,
  ROOM_ELEVATION_MAX_M,
  ROOM_ELEVATION_MIN_M,
  ROOM_ELEVATION_STEP_M,
} from '#/theme.ts'
import type { Floor } from '#/lib/floors.ts'
import type { Area, DecorationConfig, HomeAssistant, RoomConfig, Point } from '#/types.ts'
import { entityName } from '#/devices/catalog.ts'
import { PRESENCE_COLOR, PRESENCE_STRENGTH } from '#/scene/presence.ts'
import { useFlash } from '#/lib/flash.ts'
import { cn } from '#/lib/utils.ts'
import { colorWell, deleteButton, field, group, groupTitle, note, plainButton, row } from '#/editor/look.ts'
import { faCamera, faCheck, faDoorOpen, faEye, faTrash, faXmark } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'

type Props = {
  room: RoomConfig
  // The rooms on the room's floor, and every room of the home, since an
  // area stands for one room whatever floor it is on.
  rooms: RoomConfig[]
  everyRoom?: RoomConfig[]
  areas: Area[]
  // The floors of a home with more than one, and what moves the room to
  // another of them.
  floors?: Floor[]
  floorId?: string | null
  onAssignFloor?: (roomId: string, floorId: string) => void
  onRename: (id: string, name: string | undefined) => void
  onRenameDone: () => void
  onAssignArea: (roomId: string, areaId: string | undefined) => void
  onFloor: (roomId: string, floor: RoomConfig['floor']) => void
  // Raises or lowers the room's floor, in meters, `undefined` for level.
  onElevation: (roomId: string, elevation: number | undefined) => void
  // The sensor that says someone is in the room, and the filter over its
  // floor while it does.
  hass: HomeAssistant | null
  onPresence: (roomId: string, presence: RoomConfig['presence']) => void
  // The home's wall color inside, when the card has walls, and setting this
  // room's own.
  walls?: string
  onWallColor?: (roomId: string, color: string | undefined) => void
  onWallColors?: (roomId: string, colors: RoomConfig['wall_colors']) => void
  onOutdoor?: (roomId: string, outdoor: boolean) => void
  // The home's outside walls and their color, and setting this room's own.
  outside?: { kind: OutsideWalls; color: string; inside: string }
  onOutsideWalls?: (roomId: string, kind: OutsideWalls | undefined, color: string | undefined) => void
  // The fence round an outside space, or none.
  onFence?: (roomId: string, fence: RoomConfig['fence']) => void
  // Every piece of the home, to tell which rooms beside this one a door
  // leads into.
  decorations: DecorationConfig[]
  // Shows or hides the sign on the floor into a room open beside this one.
  onArrow: (roomId: string, other: string, shown: boolean) => void
  // The room's view: saved from where the 3D view's camera stands now,
  // shown by flying the camera to it, or forgotten.
  onSaveCamera: (roomId: string) => void
  onShowCamera: (roomId: string) => void
  onClearCamera: (roomId: string) => void
  // Whether there is a 3D view to take the camera from.
  hasPreview: boolean
  onDelete: (roomId: string) => void
  onDeselect: () => void
}

const input = field
const cameraButton = plainButton

// The selected room: its name, the area it stands for, the floor under it,
// and the way to be rid of it.
// The walls of a room, in the order of its edges, each named for the side of
// the room it faces out to on the plan, and numbered when two face the same
// way.
function wallSides(points: Point[]) {
  const n = points.length
  let area = 0
  for (let i = 0; i < n; i++) {
    const [x1, y1] = points[i]
    const [x2, y2] = points[(i + 1) % n]
    area += x1 * y2 - x2 * y1
  }
  const ccw = area >= 0
  const names = ['Right', 'Top right', 'Top', 'Top left', 'Left', 'Bottom left', 'Bottom', 'Bottom right']
  const sides = points.map((p, i) => {
    const q = points[(i + 1) % n]
    const dx = q[0] - p[0]
    const dy = q[1] - p[1]
    // Out of the room: to the right of the way round for a room drawn
    // counter clockwise, to the left for one drawn clockwise.
    const out = ccw ? [dy, -dx] : [-dy, dx]
    const angle = (Math.atan2(out[1], out[0]) * 180) / Math.PI
    const label = names[(Math.round(angle / 45) + 8) % 8]
    return { label, length: Math.hypot(dx, dy) }
  })
  const count = new Map<string, number>()
  for (const s of sides) count.set(s.label, (count.get(s.label) ?? 0) + 1)
  const seen = new Map<string, number>()
  return sides.map(s => {
    if ((count.get(s.label) ?? 0) < 2) return s
    const k = (seen.get(s.label) ?? 0) + 1
    seen.set(s.label, k)
    return { ...s, label: `${s.label} ${k}` }
  })
}

export default function RoomInfo({
  room,
  rooms,
  everyRoom = rooms,
  areas,
  floors,
  floorId,
  onAssignFloor,
  onRename,
  onRenameDone,
  onAssignArea,
  onFloor,
  onElevation,
  hass,
  onPresence,
  walls,
  onWallColor,
  onWallColors,
  onOutdoor,
  outside,
  onOutsideWalls,
  onFence,
  decorations,
  onArrow,
  onSaveCamera,
  onShowCamera,
  onClearCamera,
  hasPreview,
  onDelete,
  onDeselect,
}: Props) {
  // The save button shows for a moment that the view was taken.
  const [saved, flashSaved] = useFlash()
  const accent = EDITOR_TINT_COLOR
  const index = rooms.findIndex(r => r.id === room.id)
  const sorted = [...areas].sort((a, b) => a.name.localeCompare(b.name))
  const used = new Map(everyRoom.filter(r => r.area_id).map(r => [r.area_id!, r.id]))
  const swatch = (
    <span
      className="ring-fill-strong size-3 shrink-0 rounded-full ring-2"
      style={{ background: room.color ?? ROOM_COLORS[(index < 0 ? 0 : index) % ROOM_COLORS.length] }}
    />
  )
  const neighbours = neighboursOf(room, rooms, decorations)
  // A setting of the floor put back to what the material comes with.
  const resetFloor = (key: 'color' | 'scale' | 'intensity' | 'rotation') => {
    if (!room.floor) return
    const { [key]: _, ...rest } = room.floor
    onFloor(room.id, rest)
  }
  const elevation = room.elevation ?? 0
  // Sensors that tell someone is there: occupancy, presence and motion
  // sensors, and people and trackers, which are home or away.
  const presenceSensors = Object.values(hass?.states ?? {})
    .filter(s => {
      const domain = s.entity_id.split('.')[0]
      if (domain === 'person' || domain === 'device_tracker') return true
      const cls = s.attributes.device_class
      return domain === 'binary_sensor' && (cls === 'occupancy' || cls === 'presence' || cls === 'motion')
    })
    .map(s => ({ value: s.entity_id, label: hass ? entityName(hass, s.entity_id) : s.entity_id }))
    .sort((a, b) => a.label.localeCompare(b.label))
  const presence = room.presence
  const strength = presence?.strength ?? PRESENCE_STRENGTH
  const slider = (label: string, key: 'scale' | 'intensity' | 'rotation', min: number, max: number, step: number) => {
    const initial = key === 'rotation' ? 0 : 1
    const value = room.floor?.[key] ?? initial
    return (
      <label className={cn(row, 'grid-cols-[96px_1fr_56px_24px]')}>
        {label}
        <Slider
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={e => onFloor(room.id, { ...room.floor!, [key]: Number(e.target.value) })}
        />
        <span className="text-label-2 text-right text-xs tabular-nums">
          {key === 'rotation' ? `${value}°` : `${value.toFixed(2)}x`}
        </span>
        <ResetButton label={label} changed={value !== initial} onReset={() => resetFloor(key)} />
      </label>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <SelectedHeader title={room.name ?? room.id} tag={swatch} onBack={onDeselect} />
      <div className={group}>
        <label className={cn(row, 'grid-cols-[96px_1fr]')}>
          Name
          <input
            className={input}
            value={room.name ?? ''}
            placeholder={room.id}
            onChange={e => onRename(room.id, e.target.value || undefined)}
            onBlur={onRenameDone}
          />
        </label>
        {floors && floorId && onAssignFloor && (
          <label className={cn(row, 'grid-cols-[96px_1fr]')}>
            Floor
            <Select
              aria-label="Floor"
              value={floorId}
              options={[...floors].reverse().map(f => ({ value: f.id, label: f.name }))}
              onChange={v => onAssignFloor(room.id, v)}
            />
          </label>
        )}
        <label className={cn(row, 'grid-cols-[96px_1fr]')}>
          Area
          <Select
            aria-label="Area"
            value={room.area_id ?? ''}
            options={[
              { value: '', label: 'No area' },
              ...sorted.map(a => {
                const owner = used.get(a.area_id)
                const taken = owner !== undefined && owner !== room.id
                return { value: a.area_id, label: taken ? `${a.name} (used)` : a.name, disabled: taken }
              }),
            ]}
            onChange={v => onAssignArea(room.id, v || undefined)}
          />
        </label>
        <label className={cn(row, 'grid-cols-[96px_1fr_56px_24px]')}>
          Elevation
          <Slider
            min={ROOM_ELEVATION_MIN_M}
            max={ROOM_ELEVATION_MAX_M}
            step={ROOM_ELEVATION_STEP_M}
            value={elevation}
            onChange={e => onElevation(room.id, Number(e.target.value) || undefined)}
          />
          <span className="text-label-2 text-right text-xs tabular-nums">{Math.round(elevation * 100)} cm</span>
          <ResetButton label="Elevation" changed={elevation !== 0} onReset={() => onElevation(room.id, undefined)} />
        </label>
      </div>
      <div className={group}>
        <label className={cn(row, 'grid-cols-[96px_1fr_24px]')}>
          Floor
          <Select
            aria-label="Floor"
            value={room.floor?.material ?? ''}
            options={[
              { value: '', label: 'Room color' },
              ...Object.entries(FLOOR_MATERIALS).map(([id, m]) => ({ value: id, label: m.label })),
            ]}
            onChange={v => onFloor(room.id, v ? { ...room.floor, material: v } : undefined)}
          />
          <ResetButton label="Floor" changed={!!room.floor} onReset={() => onFloor(room.id, undefined)} />
        </label>
        {/* A garden, a patio or a drive: no walls of its own, and the
            building's walls along it stay up as its outside walls. */}
        {walls && onOutdoor && (
          <label className={cn(row, 'cursor-pointer grid-cols-[1fr_auto]')}>
            <span className="flex min-w-0 flex-col">
              <span>Outside space</span>
              <span className="text-label-2 text-xs">No walls of its own; the building's walls along it stay up</span>
            </span>
            <Switch
              checked={!!room.outdoor}
              accent={accent}
              label="Outside space"
              onChange={on => onOutdoor(room.id, on)}
            />
          </label>
        )}
        {walls && onWallColor && !room.outdoor && (
          <label className={cn(row, 'grid-cols-[96px_1fr_24px]')}>
            Walls
            <input
              type="color"
              className={colorWell}
              aria-label="Wall color"
              value={room.wall_color ?? walls}
              onChange={e => onWallColor(room.id, e.target.value)}
            />
            <ResetButton
              label="Walls"
              changed={room.wall_color !== undefined}
              onReset={() => onWallColor(room.id, undefined)}
            />
          </label>
        )}
        {/* The outside of its walls, where they face out of the home: the
            home's, or its own, like timber panelling round a shed. */}
        {outside && onOutsideWalls && !room.outdoor && (
          <>
            <label className={cn(row, 'grid-cols-[96px_1fr_24px]')}>
              Outside
              <Select
                aria-label="Outside of the walls"
                value={room.outside_walls ?? ''}
                options={[
                  { value: '', label: `Home (${OUTSIDE_WALLS[outside.kind].label})` },
                  ...Object.entries(OUTSIDE_WALLS).map(([id, o]) => ({ value: id, label: o.label })),
                ]}
                onChange={v => onOutsideWalls(room.id, (v || undefined) as OutsideWalls | undefined, undefined)}
              />
              <ResetButton
                label="Outside walls"
                changed={room.outside_walls !== undefined || room.outside_color !== undefined}
                onReset={() => onOutsideWalls(room.id, undefined, undefined)}
              />
            </label>
            {(room.outside_walls || room.outside_color) && (
              <label className={cn(row, 'grid-cols-[96px_1fr_24px]')}>
                Outside color
                <input
                  type="color"
                  className={colorWell}
                  aria-label="Outside wall color"
                  value={
                    room.outside_color ??
                    (room.outside_walls === outside.kind || !room.outside_walls
                      ? outside.color
                      : room.outside_walls === 'plain'
                        ? outside.inside
                        : OUTSIDE_WALLS[room.outside_walls].color)
                  }
                  onChange={e => onOutsideWalls(room.id, room.outside_walls, e.target.value)}
                />
                <ResetButton
                  label="Outside color"
                  changed={room.outside_color !== undefined}
                  onReset={() => onOutsideWalls(room.id, room.outside_walls, undefined)}
                />
              </label>
            )}
          </>
        )}
        {/* A fence round an outside space, on the sides picked, each as
            high as it is set. Where the home's walls run along a side they
            stand in its place. */}
        {room.outdoor && onFence && (
          <details className="group/fence" open={!!room.fence}>
            <summary className={cn(row, 'cursor-pointer list-none grid-cols-[1fr_auto] text-[13px]')}>
              Fence
              <span className="text-label-2 text-xs">
                {(() => {
                  const on = (room.fence?.heights ?? []).filter(h => (h ?? 0) > 0).length
                  return on ? `${on} of ${room.points.length} sides` : 'None'
                })()}
              </span>
            </summary>
            <div className="flex flex-col gap-1 pt-1">
              {wallSides(room.points).map(({ label, length }, i) => {
                const height = room.fence?.heights?.[i] ?? 0
                const set = (h: number | undefined) => {
                  const heights = Array.from({ length: room.points.length }, (_, k) => room.fence?.heights?.[k] ?? null)
                  heights[i] = h ?? null
                  const { heights: _old, ...rest } = room.fence ?? { heights: [] }
                  onFence(room.id, heights.some(Boolean) || Object.keys(rest).length ? { ...rest, heights } : undefined)
                }
                return (
                  <div key={i} className="flex flex-col gap-1">
                    <label className={cn(row, 'cursor-pointer grid-cols-[1fr_auto]')}>
                      <span className="flex min-w-0 flex-col leading-tight">
                        <span className="truncate">{label}</span>
                        <span className="text-label-2 text-[11px] tabular-nums">{length.toFixed(2)} m</span>
                      </span>
                      <Switch
                        checked={height > 0}
                        accent={accent}
                        label={`Fence along ${label}`}
                        onChange={on => set(on ? FENCE_HEIGHT_M : undefined)}
                      />
                    </label>
                    {height > 0 && (
                      <label className={cn(row, 'grid-cols-[96px_1fr_56px_24px]')}>
                        Height
                        <Slider
                          min={0.3}
                          max={2.5}
                          step={0.05}
                          value={height}
                          aria-label={`${label} fence height`}
                          onChange={e => set(Number(e.target.value))}
                        />
                        <span className="text-label-2 text-right text-xs tabular-nums">{height.toFixed(2)} m</span>
                        <ResetButton
                          label={`${label} fence height`}
                          changed={height !== FENCE_HEIGHT_M}
                          onReset={() => set(FENCE_HEIGHT_M)}
                        />
                      </label>
                    )}
                  </div>
                )
              })}
              <label className={cn(row, 'grid-cols-[96px_1fr_56px_24px]')}>
                Slat width
                <Slider
                  min={0.05}
                  max={0.3}
                  step={0.005}
                  value={room.fence?.slat ?? FENCE_SLAT_M}
                  aria-label="Fence slat width"
                  onChange={e =>
                    onFence(room.id, {
                      heights: room.fence?.heights ?? [],
                      ...room.fence,
                      slat: Number(e.target.value),
                    })
                  }
                />
                <span className="text-label-2 text-right text-xs tabular-nums">
                  {Math.round((room.fence?.slat ?? FENCE_SLAT_M) * 100)} cm
                </span>
                <ResetButton
                  label="Fence slat width"
                  changed={room.fence?.slat !== undefined}
                  onReset={() => {
                    const { slat: _slat, ...rest } = room.fence ?? { heights: [] }
                    onFence(room.id, rest)
                  }}
                />
              </label>
              <label className={cn(row, 'grid-cols-[96px_1fr_24px]')}>
                Color
                <input
                  type="color"
                  className={colorWell}
                  aria-label="Fence color"
                  value={room.fence?.color ?? FENCE_COLOR}
                  onChange={e =>
                    onFence(room.id, { heights: room.fence?.heights ?? [], ...room.fence, color: e.target.value })
                  }
                />
                <ResetButton
                  label="Fence color"
                  changed={room.fence?.color !== undefined}
                  onReset={() => {
                    const { color: _color, ...rest } = room.fence ?? { heights: [] }
                    onFence(room.id, rest)
                  }}
                />
              </label>
              <p className={note}>Where a room of the home runs along a side, its wall stands there instead.</p>
            </div>
          </details>
        )}
        {/* Each wall on its own, named for the side of the room it is on. A
            wall left alone takes the room's color above. */}
        {walls && onWallColors && !room.outdoor && (
          <details className="group/walls">
            <summary className={cn(row, 'cursor-pointer list-none grid-cols-[1fr_auto] text-[13px]')}>
              Each wall
              <span className="text-label-2 text-xs">
                {(room.wall_colors ?? []).filter(Boolean).length > 0
                  ? `${(room.wall_colors ?? []).filter(Boolean).length} of ${room.points.length} set`
                  : 'All the room color'}
              </span>
            </summary>
            <div className="flex flex-col gap-1 pt-1">
              {wallSides(room.points).map(({ label, length }, i) => {
                const own = room.wall_colors?.[i] ?? undefined
                const set = (color: string | undefined) => {
                  const list = Array.from({ length: room.points.length }, (_, k) => room.wall_colors?.[k] ?? null)
                  list[i] = color ?? null
                  onWallColors(room.id, list.some(Boolean) ? list : undefined)
                }
                return (
                  <label key={i} className={cn(row, 'grid-cols-[96px_1fr_24px]')}>
                    <span className="flex min-w-0 flex-col leading-tight">
                      <span className="truncate">{label}</span>
                      <span className="text-label-2 text-[11px] tabular-nums">{length.toFixed(2)} m</span>
                    </span>
                    <input
                      type="color"
                      className={colorWell}
                      aria-label={`${label} wall color`}
                      value={own ?? room.wall_color ?? walls}
                      onChange={e => set(e.target.value)}
                    />
                    <ResetButton label={`${label} wall`} changed={own !== undefined} onReset={() => set(undefined)} />
                  </label>
                )
              })}
              <p className={note}>Named for the side of the room each wall is on, as the plan shows it.</p>
            </div>
          </details>
        )}
        {room.floor && (
          <>
            <label className={cn(row, 'grid-cols-[96px_1fr_24px]')}>
              Tint
              <input
                type="color"
                className={colorWell}
                value={room.floor.color ?? FLOOR_MATERIALS[room.floor.material]?.color ?? '#ffffff'}
                onChange={e => onFloor(room.id, { ...room.floor!, color: e.target.value })}
              />
              <ResetButton label="Tint" changed={room.floor.color !== undefined} onReset={() => resetFloor('color')} />
            </label>
            {slider('Pattern size', 'scale', 0.25, 4, 0.05)}
            {slider('Pattern depth', 'intensity', 0, 2, 0.05)}
            {slider('Pattern angle', 'rotation', 0, 175, 5)}
          </>
        )}
      </div>
      <div className={group}>
        <label className={cn(row, 'grid-cols-[96px_1fr_24px]')}>
          Presence
          <Select
            aria-label="Presence"
            value={presence?.entity ?? ''}
            options={[{ value: '', label: 'None' }, ...presenceSensors]}
            onChange={v => onPresence(room.id, v ? { ...presence, entity: v } : undefined)}
          />
          <ResetButton label="Presence" changed={!!presence} onReset={() => onPresence(room.id, undefined)} />
        </label>
        {presence && (
          <>
            <label className={cn(row, 'grid-cols-[96px_1fr_24px]')}>
              Filter
              <input
                type="color"
                className={colorWell}
                value={presence.color ?? PRESENCE_COLOR}
                onChange={e => onPresence(room.id, { ...presence, color: e.target.value })}
              />
              <ResetButton
                label="Filter"
                changed={presence.color !== undefined}
                onReset={() => onPresence(room.id, { ...presence, color: undefined })}
              />
            </label>
            <label className={cn(row, 'grid-cols-[96px_1fr_56px_24px]')}>
              Strength
              <Slider
                min={0.05}
                max={0.9}
                step={0.05}
                value={strength}
                onChange={e => onPresence(room.id, { ...presence, strength: Number(e.target.value) })}
              />
              <span className="text-label-2 text-right text-xs tabular-nums">{Math.round(strength * 100)}%</span>
              <ResetButton
                label="Strength"
                changed={presence.strength !== undefined}
                onReset={() => onPresence(room.id, { ...presence, strength: undefined })}
              />
            </label>
            <p className={note}>While someone is in the room, its floor is seen through this filter.</p>
          </>
        )}
      </div>
      <div className={group}>
        <div className={cn(row, 'grid-cols-[96px_1fr]')}>
          Camera
          <div className="flex min-w-0 items-center gap-1.5">
            <button
              type="button"
              disabled={!hasPreview}
              title={hasPreview ? "Save where the 3D view stands now as this room's view" : 'Open the 3D view first'}
              onClick={() => {
                onSaveCamera(room.id)
                flashSaved()
              }}
              className={cn(cameraButton, 'min-w-0 flex-1 px-2', saved && 'text-success')}
            >
              <FontAwesomeIcon icon={saved ? faCheck : faCamera} className="size-3.5" />
              <span className="truncate">
                {saved ? 'View saved' : room.camera ? 'Replace view' : 'Use current view'}
              </span>
            </button>
            <button
              type="button"
              disabled={!hasPreview}
              aria-label="Fly to this room's view"
              title="Fly to this room's view"
              onClick={() => onShowCamera(room.id)}
              className={cn(cameraButton, 'size-8 shrink-0 px-0')}
            >
              <FontAwesomeIcon icon={faEye} className="size-3.5" />
            </button>
            {room.camera && (
              <button
                type="button"
                aria-label="Go back to the view the room comes with"
                title="Go back to the view the room comes with"
                onClick={() => onClearCamera(room.id)}
                className={cn(cameraButton, 'size-8 shrink-0 px-0')}
              >
                <FontAwesomeIcon icon={faXmark} className="size-3.5" />
              </button>
            )}
          </div>
        </div>
        <p className={note}>
          {room.camera
            ? 'Clicking this room in the card flies the camera to this view and fades the rest of the home away.'
            : 'Clicking this room in the card flies the camera to it and fades the rest of the home away. Orbit the 3D view to where the room looks best and save it to choose the view yourself.'}
        </p>
      </div>
      {neighbours.length > 0 && (
        <div className={group}>
          <p className={groupTitle}>Rooms beside it</p>
          {neighbours.map(neighbour => {
            const other = rooms.find(r => r.id === neighbour.id)
            const name = other?.name ?? neighbour.id
            return (
              <div key={neighbour.id} className={cn(row, 'min-h-6 grid-cols-[1fr_auto]')}>
                <span className="truncate">{name}</span>
                <span className="flex items-center gap-3">
                  {neighbour.door && (
                    <span className="text-label-2 flex items-center gap-1.5 text-xs">
                      <FontAwesomeIcon icon={faDoorOpen} className="size-3" />
                      {decorationKind(neighbour.door)?.label ?? 'Door'}
                    </span>
                  )}
                  <Switch
                    checked={!room.hide_arrows?.includes(neighbour.id)}
                    accent={accent}
                    label={`Show an arrow into ${name}`}
                    onChange={shown => onArrow(room.id, neighbour.id, shown)}
                  />
                </span>
              </div>
            )
          })}
          <p className={note}>
            In this room's view a click on a door flies to the room behind it. Each room beside it also gets an arrow on
            the floor that does the same, past the door or the open stretch between them, unless it is switched off
            here.
          </p>
        </div>
      )}
      <button
        type="button"
        onClick={() => {
          if (window.confirm(`Delete ${room.name ?? room.id}?`)) onDelete(room.id)
        }}
        className={deleteButton}
      >
        <FontAwesomeIcon icon={faTrash} className="size-3.5" />
        Delete room
      </button>
    </div>
  )
}
