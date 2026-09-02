export type EventType = 'webinar' | 'bootcamp';
export type RegistrationMode = 'website' | 'luma';
export type AcademyEvent = {
  id: string; title: string; description: string; event_type: EventType; flyer_url: string | null;
  application_deadline: string | null; event_starts_at: string | null; event_ends_at: string | null;
  call_link: string | null; registration_mode: RegistrationMode; luma_url: string | null;
  is_active: boolean; created_at: string; updated_at: string;
};

export function isOpenForRegistration(event: AcademyEvent) {
  return event.is_active && event.registration_mode === 'website' && (!event.application_deadline || new Date(event.application_deadline).getTime() >= Date.now());
}

export function eventTypeLabel(type: EventType) { return type === 'bootcamp' ? 'Bootcamp' : 'Webinar'; }
/** Event times are entered, stored, and shown against one fixed zone so an admin's
    laptop clock or the server's UTC clock can never shift a published start time. */
export const EVENT_TIME_ZONE = process.env.NEXT_PUBLIC_EVENT_TIME_ZONE || 'Africa/Lagos';
const wallClockFormatter = new Intl.DateTimeFormat('en-CA', {timeZone: EVENT_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false});
const eventDateFormatter = new Intl.DateTimeFormat('en', {timeZone: EVENT_TIME_ZONE, month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short'});
function wallClock(date: Date) { const part = Object.fromEntries(wallClockFormatter.formatToParts(date).map(({type, value}) => [type, value])); return `${part.year}-${part.month}-${part.day}T${part.hour === '24' ? '00' : part.hour}:${part.minute}`; }
function zoneOffset(utcMs: number) { return Date.parse(`${wallClock(new Date(utcMs))}:00Z`) - utcMs; }

/** Stored UTC timestamp -> the value a datetime-local input should display. */
export function toEventInputValue(iso: string | null) { return iso ? wallClock(new Date(iso)) : ''; }
/** datetime-local value (wall clock in EVENT_TIME_ZONE) -> UTC timestamp to store. */
export function fromEventInputValue(value: unknown) { if (typeof value !== 'string' || !value) return null; const guess = Date.parse(`${value.slice(0, 16)}:00Z`); return Number.isNaN(guess) ? null : new Date(guess - zoneOffset(guess)).toISOString(); }
export function formatEventDate(date: string | null) { return date ? eventDateFormatter.format(new Date(date)) : null; }
