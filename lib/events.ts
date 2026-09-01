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
export function formatEventDate(date: string | null) { return date ? new Intl.DateTimeFormat('en', {dateStyle: 'medium', timeStyle: 'short'}).format(new Date(date)) : null; }
