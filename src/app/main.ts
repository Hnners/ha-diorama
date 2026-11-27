// The S.I.M.S. app: the house, its widgets and the editor on a page of their
// own in Home Assistant's sidebar, laid out like the M.A.S.H. app. The card's
// own elements do the drawing; the page connects them to Home Assistant,
// keeps the house in the app's storage and gives them a header and tabs.
import '#/app/app.css'
import '#/main.tsx'
import { HomeConnection } from '#/app/connection.ts'
import { openMoreInfo, updateMoreInfo } from '#/app/moreInfo.ts'
import { defineShims } from '#/app/shims.ts'
import { backgroundOf } from '#/lib/background.ts'
import type { CardConfig, HomeAssistant } from '#/types.ts'

defineShims()

type CardElement = HTMLElement & { setConfig: (config: CardConfig) => void; hass: HomeAssistant }
type EditorElement = CardElement & { openOnStart: boolean }

const view = document.getElementById('view')!
const status = document.getElementById('status')!
const editButton = document.getElementById('edit-house') as HTMLButtonElement

let hass: HomeAssistant | null = null
let house: CardConfig | null = null
let houseCard: CardElement | null = null
let editor: EditorElement | null = null
const live = new Set<CardElement>()

// ------------------------------------------------------------ saving

let saveTimer: ReturnType<typeof setTimeout> | undefined
let unsaved: CardConfig | null = null

// The house can run to megabytes with imported models, so it travels
// compressed, through Home Assistant's ingress, to about a third.
async function packed(json: string): Promise<RequestInit> {
  if (typeof CompressionStream === 'undefined') return { headers: { 'Content-Type': 'application/json' }, body: json }
  const stream = new Blob([json]).stream().pipeThrough(new CompressionStream('gzip'))
  return {
    headers: { 'Content-Type': 'application/octet-stream', 'X-Sims-Gzip': '1' },
    body: await new Response(stream).blob(),
  }
}

async function flushSave() {
  clearTimeout(saveTimer)
  const config = unsaved
  if (!config) return
  unsaved = null
  const r = await fetch('api/house', { method: 'PUT', ...(await packed(JSON.stringify(config))) }).catch(
    () => ({ ok: false }) as Response,
  )
  if (!r.ok) {
    unsaved ??= config
    toast('Could not save the house. Trying again…', true)
    saveTimer = setTimeout(() => void flushSave(), 5000)
  }
}

function changed(config: CardConfig) {
  house = config
  unsaved = config
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => void flushSave(), 800)
}

window.addEventListener('pagehide', () => {
  if (unsaved) navigator.sendBeacon?.('api/house', new Blob([JSON.stringify(unsaved)], { type: 'application/json' }))
})

// ------------------------------------------------------------ views

function make<T extends CardElement>(tag: string) {
  const element = document.createElement(tag) as T
  element.setConfig(house!)
  if (hass) element.hass = hass
  live.add(element)
  return element
}

function forget(element: CardElement | null) {
  if (element) live.delete(element)
}

// The house stays on the page while another tab shows, only hidden, so
// going back to it does not load the whole house again.
let stage: HTMLElement | null = null
let panel: HTMLElement | null = null

function showHouse() {
  forget(editor)
  editor = null
  panel?.remove()
  panel = null
  if (!houseCard) {
    houseCard = make<CardElement>('diorama-card')
    stage = document.createElement('section')
    stage.className = 'house'
    stage.append(houseCard)
    view.replaceChildren(stage)
  } else houseCard.setConfig(house!)
  const background = backgroundOf(house!.background, true)
  stage!.style.background = background ?? ''
  stage!.hidden = false
}

function showSettings(openEditor = false) {
  forget(editor)
  panel?.remove()
  if (stage) stage.hidden = true
  if (!houseCard) view.replaceChildren()
  const element = document.createElement('diorama-card-editor') as EditorElement
  element.openOnStart = openEditor
  element.setConfig(house!)
  if (hass) element.hass = hass
  live.add(element)
  editor = element
  element.addEventListener('config-changed', event => {
    changed((event as CustomEvent<{ config: CardConfig }>).detail.config)
  })
  element.addEventListener('editor-closed', () => {
    void flushSave()
    if (openEditor) location.hash = '#house'
  })
  panel = document.createElement('section')
  panel.className = 'settings'
  panel.append(element)
  view.append(panel)
}

function route() {
  if (!house) return
  const tab = location.hash.replace('#', '') || 'house'
  for (const link of document.querySelectorAll<HTMLAnchorElement>('.tabs a'))
    link.classList.toggle('active', link.dataset.tab === (tab === 'edit' ? 'house' : tab))
  if (tab === 'settings') showSettings()
  else if (tab === 'edit') showSettings(true)
  else showHouse()
}

window.addEventListener('hashchange', route)
editButton.addEventListener('click', () => {
  if (location.hash === '#edit') route()
  else location.hash = '#edit'
})

// A tap on a device opens its details, which Home Assistant would show on a
// dashboard.
window.addEventListener('hass-more-info', event => {
  const id = (event as CustomEvent<{ entityId?: string }>).detail?.entityId
  if (id && hass) openMoreInfo(hass, id)
})

// ------------------------------------------------------------ toast

let toastTimer: ReturnType<typeof setTimeout> | undefined
function toast(message: string, bad = false) {
  const box = document.getElementById('toast')!
  box.textContent = message
  box.className = `show${bad ? ' bad' : ''}`
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => (box.className = ''), bad ? 5000 : 2500)
}
window.addEventListener('hass-notification', event => {
  const message = (event as CustomEvent<{ message?: string }>).detail?.message
  if (message) toast(message)
})

// ------------------------------------------------------------ start

async function start() {
  const connection = new HomeConnection()
  try {
    await connection.start()
  } catch {
    status.textContent = 'S.I.M.S. could not reach Home Assistant. Check the app is running, then reload.'
    return
  }
  connection.onChange(next => {
    hass = next
    for (const element of live) element.hass = next
    updateMoreInfo(next)
  })
  const r = await fetch('api/house')
  if (!r.ok) {
    status.textContent = 'S.I.M.S. could not load the house.'
    return
  }
  const { config, imported_from } = (await r.json()) as { config: CardConfig; imported_from: string | null }
  house = config
  if (imported_from) toast(`Brought your house over from the "${imported_from}" dashboard`)
  if (!house.rooms?.length && !location.hash) location.hash = '#edit'
  route()
}

void start()
