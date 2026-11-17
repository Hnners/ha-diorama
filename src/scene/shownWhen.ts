import { areaName, domainOf, entityArea, entityName, type EntityInfo } from '#/devices/catalog.ts'
import type { DecorationConfig, HomeAssistant } from '#/types.ts'

// States that say nothing yet about the entity, as just after Home
// Assistant starts. A piece is left showing through them rather than
// blinking away and back.
const UNSURE = ['unavailable', 'unknown']

// Whether a piece is meant to be there now, by the entity it is shown by.
// One with no such entity, or whose entity is not known, always is.
function shownNow(hass: HomeAssistant, item: DecorationConfig) {
  const when = item.show_when
  if (!when?.entity) return true
  const state = hass.states[when.entity]?.state
  if (state === undefined || UNSURE.includes(state)) return true
  return state === (when.state ?? 'on')
}

// The ids of the pieces to leave out of the view now: those whose entity
// says they are not there, and everything standing on one of them, so a
// lamp does not float where its table was.
export function hiddenPieces(hass: HomeAssistant | undefined, items: DecorationConfig[]) {
  const hidden = new Set<string>()
  if (!hass || !items.some(item => item.show_when?.entity)) return hidden
  const byId = new Map(items.map(item => [item.id, item]))
  for (const item of items) {
    let at: DecorationConfig | undefined = item
    for (let depth = 0; at && depth < 8; depth++) {
      if (!shownNow(hass, at)) {
        hidden.add(item.id)
        break
      }
      at = at.on ? byId.get(at.on) : undefined
    }
  }
  return hidden
}

// The ids of the pieces that can come and go: those shown by an entity and
// everything standing on one of them. They are never merged into the room.
export function comingAndGoing(items: DecorationConfig[]) {
  const ids = new Set<string>()
  if (!items.some(item => item.show_when?.entity)) return ids
  const byId = new Map(items.map(item => [item.id, item]))
  for (const item of items) {
    let at: DecorationConfig | undefined = item
    for (let depth = 0; at && depth < 8; depth++) {
      if (at.show_when?.entity) {
        ids.add(item.id)
        break
      }
      at = at.on ? byId.get(at.on) : undefined
    }
  }
  return ids
}

// Domains whose entities are worth offering even when their state is not
// on or off just now.
const SWITCHED = ['input_boolean', 'binary_sensor', 'switch', 'light', 'fan', 'automation', 'schedule']

// Every entity that is on or off, to show a piece by: helpers first, as
// that is what one is most often made for, then the rest by name.
export function onOffEntities(hass: HomeAssistant): EntityInfo[] {
  const out: EntityInfo[] = []
  for (const [entityId, state] of Object.entries(hass.states)) {
    const domain = domainOf(entityId)
    if (!SWITCHED.includes(domain) && state.state !== 'on' && state.state !== 'off') continue
    const areaId = entityArea(hass, entityId)
    out.push({
      entity_id: entityId,
      name: entityName(hass, entityId),
      domain,
      area_id: areaId,
      area_name: areaName(hass, areaId),
      device_id: null,
      device_name: null,
    })
  }
  const rank = (e: EntityInfo) => (e.domain === 'input_boolean' ? 0 : 1)
  return out.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name))
}
