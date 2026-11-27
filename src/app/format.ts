// States and attributes worded for people, as Home Assistant's own frontend
// does for a card. The app has no copy of its translations, so this covers
// the common cases in English: open and closed, detected and clear, numbers
// with their units, and the rest made readable.
import type { EntityState } from '#/types.ts'

const domainOf = (entity: EntityState) => entity.entity_id.split('.', 1)[0]

const BINARY: Record<string, [on: string, off: string]> = {
  battery: ['Low', 'Normal'],
  battery_charging: ['Charging', 'Not charging'],
  cold: ['Cold', 'Normal'],
  connectivity: ['Connected', 'Disconnected'],
  door: ['Open', 'Closed'],
  garage_door: ['Open', 'Closed'],
  gas: ['Detected', 'Clear'],
  heat: ['Hot', 'Normal'],
  light: ['Light detected', 'No light'],
  lock: ['Unlocked', 'Locked'],
  moisture: ['Wet', 'Dry'],
  motion: ['Detected', 'Clear'],
  moving: ['Moving', 'Not moving'],
  occupancy: ['Detected', 'Clear'],
  opening: ['Open', 'Closed'],
  plug: ['Plugged in', 'Unplugged'],
  power: ['Detected', 'Clear'],
  presence: ['Home', 'Away'],
  problem: ['Problem', 'OK'],
  running: ['Running', 'Not running'],
  safety: ['Unsafe', 'Safe'],
  smoke: ['Detected', 'Clear'],
  sound: ['Detected', 'Clear'],
  tamper: ['Tampering', 'Clear'],
  update: ['Update available', 'Up to date'],
  vibration: ['Detected', 'Clear'],
  window: ['Open', 'Closed'],
}

const WORDS: Record<string, string> = {
  on: 'On',
  off: 'Off',
  unavailable: 'Unavailable',
  unknown: 'Unknown',
  home: 'Home',
  not_home: 'Away',
  heat_cool: 'Heat/Cool',
  fan_only: 'Fan only',
  armed_home: 'Armed home',
  armed_away: 'Armed away',
  armed_night: 'Armed night',
  armed_vacation: 'Armed vacation',
  armed_custom_bypass: 'Armed custom bypass',
  above_horizon: 'Above horizon',
  below_horizon: 'Below horizon',
}

const readable = (value: string) => {
  if (WORDS[value]) return WORDS[value]
  const spaced = value.replace(/_/g, ' ')
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

const NO_SPACE = new Set(['%', '°', '°C', '°F'])

function number(value: number, entity: EntityState) {
  const precision = entity.attributes.display_precision
  const digits = typeof precision === 'number' ? precision : Number.isInteger(value) ? 0 : Math.abs(value) < 10 ? 2 : 1
  return new Intl.NumberFormat(navigator.language || 'en-GB', {
    minimumFractionDigits: typeof precision === 'number' ? digits : 0,
    maximumFractionDigits: digits,
  }).format(value)
}

const withUnit = (text: string, unit: unknown) =>
  typeof unit === 'string' && unit ? (NO_SPACE.has(unit) ? `${text}${unit}` : `${text} ${unit}`) : text

export function formatState(entity: EntityState, state = entity.state): string {
  if (state === 'unavailable' || state === 'unknown') return readable(state)
  const domain = domainOf(entity)
  const deviceClass = entity.attributes.device_class as string | undefined
  if (domain === 'binary_sensor') {
    const words = (deviceClass && BINARY[deviceClass]) || ['On', 'Off']
    return state === 'on' ? words[0] : state === 'off' ? words[1] : readable(state)
  }
  if (deviceClass === 'timestamp' || domain === 'input_datetime') {
    const date = new Date(state)
    if (!Number.isNaN(date.getTime()))
      return date.toLocaleString(navigator.language || 'en-GB', { dateStyle: 'medium', timeStyle: 'short' })
  }
  const value = Number(state)
  if (state.trim() !== '' && Number.isFinite(value))
    return withUnit(number(value, entity), entity.attributes.unit_of_measurement)
  return readable(state)
}

const TEMPERATURE = /temperature|^target_temp/
const PERCENT = new Set(['current_position', 'current_tilt_position', 'humidity', 'current_humidity', 'battery_level'])

export function formatAttribute(
  entity: EntityState,
  attribute: string,
  value: unknown = entity.attributes[attribute],
): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'number') {
    const text = number(value, entity)
    if (TEMPERATURE.test(attribute)) return `${text}°`
    if (PERCENT.has(attribute)) return `${text}%`
    if (attribute === 'brightness') return `${Math.round((value / 255) * 100)}%`
    return text
  }
  if (typeof value === 'string') return readable(value)
  if (Array.isArray(value)) return value.map(v => (typeof v === 'string' ? readable(v) : String(v))).join(', ')
  return String(value)
}
