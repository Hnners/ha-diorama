// The app's own link to Home Assistant. A card on a dashboard is handed a
// `hass` object by Home Assistant; the app's page is not, so it builds one
// from the websocket the app's backend passes through, with the parts of it
// the card uses: the states, the registries, and ways to call services, the
// websocket and the REST API.
import {
  createConnection,
  ERR_CANNOT_CONNECT,
  ERR_INVALID_AUTH,
  subscribeEntities,
  type Connection,
  type HassEntities,
  type HaWebSocket,
} from 'home-assistant-js-websocket'
import { formatAttribute, formatState } from '#/app/format.ts'
import type { Area, DeviceRegistryEntry, EntityRegistryEntry, EntityState, HomeAssistant } from '#/types.ts'

// The page is served under ingress, so its own address is the base of the
// app's websocket.
function socketUrl() {
  const url = new URL('api/websocket', location.href)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  return url.toString()
}

// The backend signs in to Home Assistant itself, so the handshake here only
// goes through the motions the client library expects.
function createSocket(): Promise<HaWebSocket> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(socketUrl()) as HaWebSocket
    socket.haVersion = ''
    const onMessage = (event: MessageEvent) => {
      const message = JSON.parse(event.data as string) as { type: string; ha_version?: string }
      if (message.type === 'auth_required') socket.send(JSON.stringify({ type: 'auth', access_token: 'ingress' }))
      else if (message.type === 'auth_ok') {
        socket.haVersion = message.ha_version ?? ''
        socket.removeEventListener('message', onMessage)
        socket.removeEventListener('close', onClose)
        resolve(socket)
      } else if (message.type === 'auth_invalid') reject(ERR_INVALID_AUTH)
    }
    const onClose = () => reject(ERR_CANNOT_CONNECT)
    socket.addEventListener('message', onMessage)
    socket.addEventListener('close', onClose)
  })
}

type Me = { id: string; name: string }
type Listener = (hass: HomeAssistant) => void

export class HomeConnection {
  private connection: Connection | null = null
  private states: Record<string, EntityState> = {}
  private entities: Record<string, EntityRegistryEntry> = {}
  private devices: Record<string, DeviceRegistryEntry> = {}
  private areas: Record<string, Area> = {}
  private me: Me = { id: '', name: '' }
  private listeners = new Set<Listener>()
  private current: HomeAssistant | null = null
  private ready = { states: false, registries: false }
  private reload: ReturnType<typeof setTimeout> | undefined

  async start() {
    this.me = await fetch('api/me')
      .then(r => r.json() as Promise<Me>)
      .catch(() => this.me)
    this.connection = await createConnection({ createSocket })
    subscribeEntities(this.connection, (states: HassEntities) => {
      this.states = states as unknown as Record<string, EntityState>
      this.ready.states = true
      this.emit()
    })
    await this.loadRegistries()
    // A device moved to another room or renamed shows at once.
    for (const event of ['entity_registry_updated', 'device_registry_updated', 'area_registry_updated'])
      void this.connection.subscribeEvents(() => {
        clearTimeout(this.reload)
        this.reload = setTimeout(() => void this.loadRegistries(), 500)
      }, event)
    this.connection.addEventListener('ready', () => void this.loadRegistries())
  }

  onChange(listener: Listener) {
    this.listeners.add(listener)
    if (this.current) listener(this.current)
    return () => this.listeners.delete(listener)
  }

  private async loadRegistries() {
    const conn = this.connection!
    const [entities, devices, areas] = await Promise.all([
      conn.sendMessagePromise<(EntityRegistryEntry & { original_name?: string; hidden_by?: string | null })[]>({
        type: 'config/entity_registry/list',
      }),
      conn.sendMessagePromise<DeviceRegistryEntry[]>({ type: 'config/device_registry/list' }),
      conn.sendMessagePromise<Area[]>({ type: 'config/area_registry/list' }),
    ])
    this.entities = Object.fromEntries(
      entities.map(e => [
        e.entity_id,
        {
          entity_id: e.entity_id,
          device_id: e.device_id,
          area_id: e.area_id,
          name: e.name,
          hidden: !!e.hidden_by,
          entity_category: e.entity_category,
          platform: e.platform,
        },
      ]),
    )
    this.devices = Object.fromEntries(devices.map(d => [d.id, d]))
    this.areas = Object.fromEntries(areas.map(a => [a.area_id, a]))
    this.ready.registries = true
    this.emit()
  }

  // A new object on every change, the way Home Assistant hands one to its
  // cards, so what compares them sees the change.
  private emit() {
    if (!this.ready.states || !this.ready.registries) return
    const conn = this.connection!
    const hass: HomeAssistant = {
      states: this.states,
      entities: this.entities,
      devices: this.devices,
      areas: this.areas,
      themes: { darkMode: true },
      user: this.me.id ? { id: this.me.id, name: this.me.name } : undefined,
      locale: { language: navigator.language || 'en-GB' },
      language: navigator.language || 'en-GB',
      callService: (domain, service, data, target) =>
        conn.sendMessagePromise({ type: 'call_service', domain, service, service_data: data, target }),
      callWS: <T>(message: Record<string, unknown>) => conn.sendMessagePromise<T>(message as never),
      callApi: async <T>(method: 'GET' | 'POST', path: string, data?: Record<string, unknown>) => {
        const r = await fetch(`api/ha/${path}`, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: data ? JSON.stringify(data) : undefined,
        })
        if (!r.ok) throw new Error(`${r.status} ${r.statusText}`)
        return (await r.json()) as T
      },
      connection: {
        subscribeMessage: (callback, message) => conn.subscribeMessage(callback, message as never),
      },
      formatEntityState: (entity, state) => formatState(entity, state),
      formatEntityAttributeValue: (entity, attribute, value) => formatAttribute(entity, attribute, value),
    }
    this.current = hass
    for (const listener of this.listeners) listener(hass)
  }
}
