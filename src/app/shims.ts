// Stand-ins for the parts of Home Assistant's own frontend the card and its
// widgets borrow on a dashboard. The app's page has no Home Assistant
// frontend around it, so it defines small ones of its own.
import type { HomeAssistant } from '#/types.ts'

type Card = HTMLElement & { setConfig?: (config: unknown) => void; hass?: HomeAssistant; preview?: boolean }

// hui-card: holds one card, built from its config, and hides itself when the
// card inside says it should not be seen, as the widgets do for other rooms.
class HuiCard extends HTMLElement {
  config: Record<string, unknown> | null = null
  private _hass: HomeAssistant | null = null
  private _preview = false
  private child: Card | null = null

  constructor() {
    super()
    this.addEventListener('card-visibility-changed', event => {
      if (event.target === this) return
      this.hidden = !(event as CustomEvent<{ value: boolean }>).detail.value
    })
  }

  connectedCallback() {
    this.style.display ||= 'block'
  }

  set hass(hass: HomeAssistant) {
    this._hass = hass
    if (this.child) this.child.hass = hass
  }

  get hass() {
    return this._hass as HomeAssistant
  }

  set preview(preview: boolean) {
    this._preview = preview
    if (this.child) this.child.preview = preview
  }

  get preview() {
    return this._preview
  }

  setConfig(config: Record<string, unknown>) {
    this.config = config
    this.load()
  }

  load() {
    const type = String(this.config?.type ?? '')
    const tag = type.startsWith('custom:') ? type.slice('custom:'.length) : ''
    if (!tag || !customElements.get(tag)) return this.fail(`S.I.M.S. cannot show a "${type}" card`)
    const card = document.createElement(tag) as Card
    try {
      card.setConfig?.(this.config)
    } catch (error) {
      return this.fail(error instanceof Error ? error.message : String(error))
    }
    if (this._hass) card.hass = this._hass
    card.preview = this._preview
    this.child = card
    this.replaceChildren(card)
  }

  private fail(message: string) {
    this.child = null
    const box = document.createElement('div')
    box.className = 'sims-card-error'
    box.textContent = message
    this.replaceChildren(box)
  }
}

// ha-icon: draws a Material Design icon by its name, like mdi:lightbulb. The
// whole set is loaded once, the first time one is needed, on its own.
let icons: Promise<Record<string, string>> | null = null
const loadIcons = () => (icons ??= import('@mdi/js') as unknown as Promise<Record<string, string>>)
const camel = (name: string) =>
  'mdi' +
  name
    .split('-')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join('')

class HaIcon extends HTMLElement {
  static observedAttributes = ['icon']

  get icon() {
    return this.getAttribute('icon') ?? ''
  }

  set icon(value: string) {
    if (value) this.setAttribute('icon', value)
    else this.removeAttribute('icon')
  }

  connectedCallback() {
    this.style.display ||= 'inline-flex'
    void this.draw()
  }

  attributeChangedCallback() {
    void this.draw()
  }

  private async draw() {
    const [set, name] = this.icon.split(':', 2)
    if (!name || (set !== 'mdi' && set !== 'hass')) return this.replaceChildren()
    const wanted = this.icon
    const path = (await loadIcons())[camel(name)]
    if (this.icon !== wanted) return
    if (!path) return this.replaceChildren()
    this.innerHTML = `<svg viewBox="0 0 24 24" width="100%" height="100%" style="width:var(--mdc-icon-size,24px);height:var(--mdc-icon-size,24px);display:block" fill="currentColor" aria-hidden="true"><path d="${path}"/></svg>`
  }
}

// hui-image: a camera's latest picture, or an image entity's, fetched again
// every ten seconds. The app runs on Home Assistant's own address, so the
// signed picture addresses it gives work as they are.
class HuiImage extends HTMLElement {
  hass: HomeAssistant | null = null
  cameraImage: string | undefined
  image: string | undefined
  fitMode = 'cover'
  private img = document.createElement('img')
  private timer: ReturnType<typeof setInterval> | undefined

  connectedCallback() {
    Object.assign(this.style, { display: 'block', width: '100%', height: '100%' })
    Object.assign(this.img.style, { width: '100%', height: '100%', objectFit: this.fitMode, display: 'block' })
    this.img.alt = ''
    this.replaceChildren(this.img)
    this.refresh()
    this.timer = setInterval(() => this.refresh(), 10_000)
  }

  disconnectedCallback() {
    clearInterval(this.timer)
  }

  private refresh() {
    const picture = this.cameraImage ? this.hass?.states[this.cameraImage]?.attributes.entity_picture : this.image
    if (typeof picture !== 'string') return
    this.img.src = `${picture}${picture.includes('?') ? '&' : '?'}t=${Date.now()}`
  }
}

export function defineShims() {
  if (!customElements.get('hui-card')) customElements.define('hui-card', HuiCard)
  if (!customElements.get('ha-icon')) customElements.define('ha-icon', HaIcon)
  if (!customElements.get('hui-image')) customElements.define('hui-image', HuiImage)
}
