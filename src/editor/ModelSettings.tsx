import { DECORATION_KINDS } from '#/decoration/catalog.ts'
import { FAMILY_LABELS } from '#/decoration/icons.ts'
import { MODEL_COLOR } from '#/decoration/models.ts'
import { heavyNote, sizeNote } from '#/editor/importModel.ts'
import { colorWell, field, group, groupTitle, note, plainButton, row } from '#/editor/look.ts'
import { ResetButton, Slider } from '#/editor/panel.tsx'
import { simplifyModel, type Simplified } from '#/editor/simplify.ts'
import { Select } from '#/components/ui/select.tsx'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '#/components/ui/alert-dialog.tsx'
import { cn } from '#/lib/utils.ts'
import type { ModelConfig } from '#/types.ts'
import { useEffect, useState } from 'react'

type Props = {
  id: string
  model: ModelConfig
  onUpdateModel: (id: string, patch: Partial<ModelConfig>) => void
  // The whole of it, as the model's own page in My models shows it: its
  // size, the colors its parts start in and its shape too. A piece on the
  // plan shows only what changes every piece of it.
  full?: boolean
}

// A warm white to start a part's own glow color from.
const GLOW_PICK = '#ffd59a'

const thousands = (n: number) => Math.round(n).toLocaleString('en-US')
const round2 = (v: number) => Math.round(v * 100) / 100

// What a model is, for every piece placed from it: its name, where it goes,
// what it works as and the parts that light up. On its own page also its
// starting size and colors, and how detailed its shape is.
export default function ModelSettings({ id, model, onUpdateModel, full = false }: Props) {
  const heavy = heavyNote(model)
  return (
    <>
      <div className={group}>
        <p className={groupTitle}>Model</p>
        <label className={cn(row, 'grid-cols-[96px_1fr]')}>
          Name
          <input
            className={field}
            aria-label="Model name"
            value={model.name}
            onChange={e => onUpdateModel(id, { name: e.target.value })}
            onBlur={e => {
              if (!e.target.value.trim()) onUpdateModel(id, { name: 'Model' })
            }}
          />
        </label>
        <label className={cn(row, 'grid-cols-[96px_1fr]')}>
          Mount
          <Select
            aria-label="Mount"
            value={model.mount ?? 'floor'}
            options={[
              { value: 'floor', label: 'On the floor' },
              { value: 'wall', label: 'On a wall' },
              { value: 'ceiling', label: 'From the ceiling' },
            ]}
            onChange={v => onUpdateModel(id, { mount: v as ModelConfig['mount'] })}
          />
        </label>
        {/* The built-in piece the model stands in for: its category. It
            takes that piece's devices, icon, widget and controls, hangs the
            way it does, and is offered as a style of it. */}
        <label className={cn(row, 'grid-cols-[96px_1fr]')}>
          Category
          <Select
            aria-label="Category"
            value={model.acts_as ?? ''}
            placeholder="None"
            searchPlaceholder="Search pieces"
            options={[
              { value: '', label: 'None' },
              ...DECORATION_KINDS.map(k => ({
                value: k.id,
                label: k.label,
                area: FAMILY_LABELS[k.family] ?? k.family,
                keywords: FAMILY_LABELS[k.family],
              })),
            ]}
            onChange={v => {
              const like = v ? DECORATION_KINDS.find(k => k.id === v) : undefined
              onUpdateModel(id, like ? { acts_as: v, mount: like.mount } : { acts_as: undefined })
            }}
          />
        </label>
        {/* The parts that light up, like a lamp's shade. Ticking one lets
            every piece of the model stand for a light. */}
        <div className={cn(row, 'grid-cols-[96px_1fr] items-start')}>
          <span className="pt-0.5">Glows</span>
          <div className="flex flex-col gap-1">
            {model.parts.map(part => {
              const lit = (model.glow ?? []).includes(part.name)
              // What it glows in: the light's color, its own color, or one
              // chosen here.
              const set = model.glow_colors?.[part.name]
              const mode = !set ? 'light' : set === 'body' ? 'body' : 'own'
              const setGlowColor = (value: string | undefined) => {
                const { [part.name]: _, ...rest } = model.glow_colors ?? {}
                const next = value ? { ...rest, [part.name]: value } : rest
                onUpdateModel(id, { glow_colors: Object.keys(next).length > 0 ? next : undefined })
              }
              return (
                <div key={part.name} className="flex min-w-0 flex-col gap-1">
                  <label className="flex min-w-0 items-center gap-2 text-[13px]">
                    <input
                      type="checkbox"
                      checked={lit}
                      onChange={e => {
                        const rest = (model.glow ?? []).filter(n => n !== part.name)
                        const glow = e.target.checked ? [...rest, part.name] : rest
                        onUpdateModel(id, { glow: glow.length > 0 ? glow : undefined })
                      }}
                    />
                    <span className="truncate">{part.name}</span>
                  </label>
                  {lit && (
                    <div className="grid grid-cols-[1fr_auto] items-center gap-1.5 pl-6">
                      <Select
                        aria-label={`${part.name} glow color`}
                        value={mode}
                        options={[
                          { value: 'light', label: 'Light’s color' },
                          { value: 'body', label: 'Its own color' },
                          { value: 'own', label: 'A color of its own' },
                        ]}
                        onChange={v =>
                          setGlowColor(
                            v === 'light' ? undefined : v === 'body' ? 'body' : mode === 'own' ? set : GLOW_PICK,
                          )
                        }
                      />
                      {mode === 'own' ? (
                        <input
                          type="color"
                          className={colorWell}
                          aria-label={`${part.name} glow`}
                          value={set}
                          onChange={e => setGlowColor(e.target.value)}
                        />
                      ) : (
                        <span />
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
        <p className={note}>
          Every piece of this model changes with its name, mount, category and its glowing parts. Put in a category, it
          hangs the way that piece does and shows in the Style list of every piece of it, so a ceiling light already
          placed can be switched to it. A glowing part lights up in the light’s color as Home Assistant sets it, in its
          own color, or in one chosen for it. Working as a built-in piece, it is offered the same devices and shows the
          same icon, widget and controls. A model with a glowing part and nothing else set works as a lamp.
          {full ? '' : ` ${sizeNote(model)}`}
        </p>
        {!full && heavy && <p className="text-xs leading-snug text-[var(--warning-color,#ffa600)]">{heavy}</p>}
      </div>
      {full && <StartingLook id={id} model={model} onUpdateModel={onUpdateModel} />}
      {full && <Detail id={id} model={model} onUpdateModel={onUpdateModel} />}
    </>
  )
}

// The size and colors every new piece of the model starts with.
function StartingLook({ id, model, onUpdateModel }: Props) {
  const sides = ['Width', 'Depth', 'Height'] as const
  return (
    <div className={group}>
      <p className={groupTitle}>Starting size and colors</p>
      {sides.map((label, axis) => (
        <label key={label} className={cn(row, 'grid-cols-[96px_1fr_auto]')}>
          {label}
          <input
            className={field}
            type="number"
            min={0.01}
            max={30}
            step={0.01}
            aria-label={`Starting ${label.toLowerCase()}`}
            value={model.size[axis]}
            onChange={e => {
              const v = Number(e.target.value)
              if (!(v > 0)) return
              const size = [...model.size] as ModelConfig['size']
              size[axis] = Math.min(round2(v), 30)
              onUpdateModel(id, { size })
            }}
          />
          <span className="text-label-2 text-xs">m</span>
        </label>
      ))}
      {model.parts.map(part => {
        const own = model.colors?.[part.name]
        return (
          <label key={part.name} className={cn(row, 'grid-cols-[96px_1fr_24px]')}>
            <span className="truncate" title={part.name}>
              {part.name}
            </span>
            <input
              type="color"
              className={colorWell}
              aria-label={`${part.name} color`}
              value={own ?? MODEL_COLOR}
              onChange={e => onUpdateModel(id, { colors: { ...model.colors, [part.name]: e.target.value } })}
            />
            <ResetButton
              label={part.name}
              changed={own !== undefined}
              onReset={() => {
                const { [part.name]: _gone, ...rest } = model.colors ?? {}
                onUpdateModel(id, { colors: Object.keys(rest).length > 0 ? rest : undefined })
              }}
            />
          </label>
        )
      })}
      <p className={note}>
        What every piece placed from now on starts with. A piece already on the plan keeps any size or color it was
        given; one never changed follows these. Its shape scales with the size.
      </p>
    </div>
  )
}

// How detailed the shape is, and making it simpler: a shape made for close
// up renders is far finer than a room seen whole needs, and every triangle is
// drawn on every screen that shows the card.
function Detail({ id, model, onUpdateModel }: Props) {
  // The share of its triangles to keep, from a tenth of a percent up.
  const [keep, setKeep] = useState(model.triangles > 20000 ? 10 : 50)
  const [result, setResult] = useState<Simplified | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Asking before the original shape is let go.
  const [confirming, setConfirming] = useState(false)
  const stored = model.parts.some(p => p.vertices && p.triangles)
  const bytes = model.parts.reduce((s, p) => s + (p.vertices?.length ?? 0) + (p.triangles?.length ?? 0), 0)
  const heavy = heavyNote(model)
  // A new share is tried afresh, and the shape it gives shown before it is
  // kept. A changed model drops the one tried for the old one.
  useEffect(() => {
    if (!stored) return
    let live = true
    const t = setTimeout(() => {
      setBusy(true)
      setError(null)
      simplifyModel(model, keep / 100).then(
        r => live && (setResult(r), setBusy(false)),
        e => live && (setError(e instanceof Error ? e.message : 'It could not be simplified.'), setBusy(false)),
      )
    }, 150)
    return () => {
      live = false
      clearTimeout(t)
    }
  }, [keep, model, stored])
  const outBytes = result
    ? result.parts.reduce((s, p) => s + (p.vertices?.length ?? 0) + (p.triangles?.length ?? 0), 0)
    : 0
  return (
    <div className={group}>
      <p className={groupTitle}>Detail</p>
      <p className="text-[13px]">
        {thousands(model.triangles)} triangles
        {stored ? `, ${Math.max(1, Math.round(bytes / 1000))} kB in the card` : ''}
      </p>
      {heavy && <p className="text-xs leading-snug text-[var(--warning-color,#ffa600)]">{heavy}</p>}
      {stored ? (
        <>
          {/* A simplified shape keeps the original beside it until it is
              confirmed, so it can be had back. */}
          {model.original && (
            <div className="bg-fill flex flex-col gap-2 rounded-xl p-2.5">
              <p className="text-[13px]">
                Simplified from {thousands(model.original.triangles)} triangles. The original is kept until you choose.
              </p>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  className={plainButton}
                  onClick={() => {
                    const original = model.original
                    if (!original) return
                    onUpdateModel(id, { parts: original.parts, triangles: original.triangles, original: undefined })
                    setKeep(original.triangles > 20000 ? 10 : 50)
                  }}
                >
                  Restore original
                </button>
                <button type="button" className={plainButton} onClick={() => setConfirming(true)}>
                  Keep simplified
                </button>
              </div>
            </div>
          )}
          <label className={cn(row, 'grid-cols-[96px_1fr_48px]')}>
            Keep
            <Slider
              aria-label="Share of triangles to keep"
              min={2}
              max={100}
              step={1}
              value={keep}
              onChange={e => setKeep(Number(e.target.value))}
            />
            <span className="text-right text-[13px] tabular-nums">{keep}%</span>
          </label>
          <p className={note}>
            {busy || !result
              ? 'Working it out...'
              : result.triangles >= model.triangles
                ? 'That keeps it as it is.'
                : `Simplified: ${thousands(result.triangles)} triangles, ${Math.max(1, Math.round(outBytes / 1000))} kB. Open edges stay where they are, so parts still meet; a shape with many of them keeps more.`}
          </p>
          {error && <p className="text-danger text-xs leading-snug">{error}</p>}
          <button
            type="button"
            className={cn(plainButton, 'w-full')}
            disabled={busy || !result || result.triangles >= model.triangles}
            onClick={() => {
              if (!result) return
              // The shape as imported stays until the simpler one is kept.
              const original = model.original ?? { parts: model.parts, triangles: model.triangles }
              onUpdateModel(id, { parts: result.parts, triangles: result.triangles, original })
              // Back to all of what it now has, so another click asks again.
              setKeep(100)
            }}
          >
            Simplify to {result ? thousands(result.triangles) : '...'} triangles
          </button>
          <p className={note}>
            Every piece of the model changes. Until you keep the simplified shape, the original stays in the card too,
            so the card is larger meanwhile.
          </p>
          <AlertDialog open={confirming} onOpenChange={open => !open && setConfirming(false)}>
            <AlertDialogHeader>
              <AlertDialogTitle>Keep the simplified shape?</AlertDialogTitle>
              <AlertDialogDescription>
                {model.original
                  ? `The original ${thousands(model.original.triangles)} triangles are let go, and the model stays at ${thousands(model.triangles)}. To get the full detail back after that, import the file again.`
                  : ''}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setConfirming(false)}>Not yet</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  onUpdateModel(id, { original: undefined })
                  setConfirming(false)
                }}
              >
                Keep simplified
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialog>
        </>
      ) : (
        <p className={note}>
          Its shape is read from {model.url ?? 'a file'}, not kept in the card, so it is simplified in a 3D program,
          like Blender's Decimate, and saved over that file.
        </p>
      )}
    </div>
  )
}
