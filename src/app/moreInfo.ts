// A device's details, opened by a tap on it in the house or on its widget:
// what Home Assistant's own "more info" shows on a dashboard, in the app's
// style. Its name, its state, a switch or the buttons it takes, a brightness
// slider for a light, and its other attributes.
import { formatAttribute, formatState } from '#/app/format.ts'
import type { EntityState, HomeAssistant } from '#/types.ts'

const dialog = () => document.getElementById('more-info') as HTMLDialogElement

const TOGGLES = new Set(['light', 'switch', 'fan', 'input_boolean', 'automation', 'siren', 'humidifier'])
const HIDDEN = new Set([
  'friendly_name',
  'icon',
  'entity_picture',
  'supported_features',
  'supported_color_modes',
  'color_mode',
  'device_class',
  'unit_of_measurement',
  'state_class',
  'attribution',
  'restored',
  'editable',
  'hs_color',
  'rgb_color',
  'xy_color',
  'rgbw_color',
  'rgbww_color',
  'min_mireds',
  'max_mireds',
  'min_color_temp_kelvin',
  'max_color_temp_kelvin',
  'effect_list',
  'access_token',
  'id',
  'user_id',
  'device_trackers',
])

const esc = (s: string) =>
  s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

function ago(when: string) {
  const seconds = Math.round((Date.now() - new Date(when).getTime()) / 1000)
  if (!Number.isFinite(seconds)) return ''
  const units: [number, Intl.RelativeTimeFormatUnit][] = [
    [60, 'second'],
    [60, 'minute'],
    [24, 'hour'],
    [7, 'day'],
    [Infinity, 'week'],
  ]
  let value = -seconds
  for (const [size, unit] of units) {
    if (Math.abs(value) < size) return new Intl.RelativeTimeFormat('en-GB', { numeric: 'auto' }).format(value, unit)
    value = Math.round(value / size)
  }
  return ''
}

type Button = { label: string; service: string; primary?: boolean }

function buttonsFor(entity: EntityState): Button[] {
  const [domain] = entity.entity_id.split('.', 1)
  switch (domain) {
    case 'cover':
      return [
        { label: 'Open', service: 'cover.open_cover' },
        { label: 'Stop', service: 'cover.stop_cover' },
        { label: 'Close', service: 'cover.close_cover' },
      ]
    case 'lock':
      return entity.state === 'locked'
        ? [{ label: 'Unlock', service: 'lock.unlock', primary: true }]
        : [{ label: 'Lock', service: 'lock.lock', primary: true }]
    case 'scene':
      return [{ label: 'Activate', service: 'scene.turn_on', primary: true }]
    case 'script':
      return [{ label: 'Run', service: 'script.turn_on', primary: true }]
    case 'button':
    case 'input_button':
      return [{ label: 'Press', service: `${domain}.press`, primary: true }]
    case 'vacuum':
      return [
        { label: 'Start', service: 'vacuum.start', primary: true },
        { label: 'Pause', service: 'vacuum.pause' },
        { label: 'Dock', service: 'vacuum.return_to_base' },
      ]
    case 'media_player':
      return [
        { label: 'Play / pause', service: 'media_player.media_play_pause', primary: true },
        { label: 'Previous', service: 'media_player.media_previous_track' },
        { label: 'Next', service: 'media_player.media_next_track' },
      ]
    default:
      return []
  }
}

let current: { hass: HomeAssistant; id: string } | null = null

// What counts as on, for the glow and the switch.
const isOn = (entity: EntityState) =>
  !['off', 'unavailable', 'unknown', 'closed', 'locked', 'idle', 'standby', 'docked', 'paused'].includes(
    entity.state,
  ) && entity.state !== '0'

function draw() {
  if (!current) return
  const { hass, id } = current
  const entity = hass.states[id]
  const box = dialog()
  box.toggleAttribute('data-on', !!entity && isOn(entity))
  if (!entity) {
    box.innerHTML = `<div class="modal-head"><h2 id="more-info-title">${esc(id)}</h2><button type="button" class="icon-btn" data-close aria-label="Close">✕</button></div><div class="modal-body"><p class="muted">This device is not in Home Assistant any more.</p></div>`
    return
  }
  const [domain] = id.split('.', 1)
  const name = String(entity.attributes.friendly_name ?? id)
  const on = entity.state === 'on'
  const toggle = TOGGLES.has(domain)
    ? `<button type="button" class="switch" role="switch" aria-checked="${on}" data-toggle aria-label="${on ? 'Turn off' : 'Turn on'}"><span></span></button>`
    : ''
  const brightness =
    domain === 'light' && typeof entity.attributes.brightness === 'number'
      ? Math.round(((entity.attributes.brightness as number) / 255) * 100)
      : domain === 'light' && on
        ? 100
        : null
  const slider =
    domain === 'light' && (on || brightness !== null)
      ? `<label class="field"><span>Brightness <b class="mono">${brightness ?? 0}%</b></span><input type="range" min="1" max="100" value="${brightness ?? 0}" data-brightness></label>`
      : ''
  const buttons = buttonsFor(entity)
    .map(
      b =>
        `<button type="button" class="btn btn-sm ${b.primary ? 'btn-primary' : ''}" data-service="${b.service}">${esc(b.label)}</button>`,
    )
    .join('')
  const attributes = Object.keys(entity.attributes)
    .filter(key => !HIDDEN.has(key) && entity.attributes[key] !== null && typeof entity.attributes[key] !== 'object')
    .map(key => `<tr><th>${esc(key.replace(/_/g, ' '))}</th><td>${esc(formatAttribute(entity, key))}</td></tr>`)
    .join('')
  const html = `
    <div class="modal-head">
      <div class="modal-title">
        <span class="eyebrow mono">${esc(domain.replace(/_/g, ' '))}</span>
        <h2 id="more-info-title">${esc(name)}</h2>
      </div>
      <button type="button" class="icon-btn" data-close aria-label="Close">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>
      </button>
    </div>
    <div class="modal-body">
      <div class="state-row">
        <div><div class="state-big">${esc(formatState(entity))}</div><div class="muted mono">Changed ${esc(ago(entity.last_changed))}</div></div>
        ${toggle}
      </div>
      ${slider}
      ${buttons ? `<div class="row">${buttons}</div>` : ''}
      ${attributes ? `<table class="attrs">${attributes}</table>` : ''}
    </div>`
  // Drawn afresh when it opens on a device, and after that changed in
  // place, so the switch slides and the state flips rather than jumping.
  if (box.dataset.entity !== id || !box.querySelector('.modal-body')) {
    box.dataset.entity = id
    box.innerHTML = html
    return
  }
  const next = document.createElement('div')
  next.innerHTML = html
  const state = box.querySelector<HTMLElement>('.state-big')
  const nextState = next.querySelector<HTMLElement>('.state-big')
  if (state && nextState && state.textContent !== nextState.textContent) {
    state.textContent = nextState.textContent
    state.classList.remove('flip')
    void state.offsetWidth
    state.classList.add('flip')
  }
  const since = box.querySelector('.state-row .muted')
  const nextSince = next.querySelector('.state-row .muted')
  if (since && nextSince) since.textContent = nextSince.textContent
  const flip = box.querySelector<HTMLElement>('[data-toggle]')
  const nextFlip = next.querySelector<HTMLElement>('[data-toggle]')
  if (flip && nextFlip) {
    flip.setAttribute('aria-checked', nextFlip.getAttribute('aria-checked')!)
    flip.setAttribute('aria-label', nextFlip.getAttribute('aria-label')!)
  }
  // The rest below the state, swapped only where it changed.
  const body = box.querySelector('.modal-body')!
  const nextBody = next.querySelector('.modal-body')!
  const rest = (el: Element) => [...el.children].filter(child => !child.classList.contains('state-row'))
  const now = rest(body)
  const then = rest(nextBody)
  if (now.length !== then.length || now.some((child, i) => child.tagName !== then[i].tagName)) {
    now.forEach(child => child.remove())
    body.append(...then)
  } else
    now.forEach((child, i) => {
      if (child.outerHTML !== then[i].outerHTML) child.replaceWith(then[i])
    })
  const title = box.querySelector('#more-info-title')
  const nextTitle = next.querySelector('#more-info-title')
  if (title && nextTitle && title.textContent !== nextTitle.textContent) title.textContent = nextTitle.textContent
}

function call(service: string, data: Record<string, unknown> = {}) {
  if (!current) return
  const [domain, name] = service.split('.', 2)
  void current.hass.callService(domain, name, data, { entity_id: current.id })
}

let wired = false
function wire() {
  if (wired) return
  wired = true
  const box = dialog()
  box.addEventListener('click', event => {
    const target = event.target as HTMLElement
    if (target === box || target.closest('[data-close]')) return box.close()
    const flip = target.closest<HTMLElement>('[data-toggle]')
    if (flip) {
      // Slid over straight away, and put right when Home Assistant answers.
      const on = flip.getAttribute('aria-checked') !== 'true'
      flip.setAttribute('aria-checked', String(on))
      box.toggleAttribute('data-on', on)
      const [domain] = current!.id.split('.', 1)
      call(`${domain === 'light' || domain === 'switch' || domain === 'fan' ? domain : 'homeassistant'}.toggle`)
    }
    const service = target.closest<HTMLElement>('[data-service]')?.dataset.service
    if (service) call(service)
  })
  box.addEventListener('change', event => {
    const input = (event.target as HTMLElement).closest<HTMLInputElement>('[data-brightness]')
    if (input) call('light.turn_on', { brightness_pct: Number(input.value) })
  })
  box.addEventListener('input', event => {
    const input = (event.target as HTMLElement).closest<HTMLInputElement>('[data-brightness]')
    const label = input?.closest('label')?.querySelector('b')
    if (input && label) label.textContent = `${input.value}%`
  })
  box.addEventListener('close', () => {
    current = null
    delete box.dataset.entity
  })
}

export function openMoreInfo(hass: HomeAssistant, id: string) {
  wire()
  current = { hass, id }
  draw()
  if (!dialog().open) dialog().showModal()
}

// Kept up to date while it is open, unless a slider is being dragged.
export function updateMoreInfo(hass: HomeAssistant) {
  if (!current || !dialog().open) return
  current = { ...current, hass }
  if (document.activeElement?.matches('[data-brightness]')) return
  draw()
}
