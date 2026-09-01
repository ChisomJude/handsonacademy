'use client';
import {useState} from 'react';
import {TurnstileWidget} from './turnstile-widget';
import type {AcademyEvent} from '@/lib/events';

export function EventRegistrationForm({event}: {event: AcademyEvent}) {
  const [submitted, setSubmitted] = useState(false); const [saving, setSaving] = useState(false); const [error, setError] = useState(''); const [token, setToken] = useState('');
  async function submit(form: React.FormEvent<HTMLFormElement>) {
    form.preventDefault(); setSaving(true); setError('');
    const values = Object.fromEntries(new FormData(form.currentTarget).entries());
    const response = await fetch('/api/event-registrations', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({...values, event_id: event.id, is_in_community_whatsapp: values.is_in_community_whatsapp === 'yes', wants_community_add: values.wants_community_add === 'on', consent: values.consent === 'on', turnstile_token: token})});
    const body = await response.json().catch(() => ({}));
    if (!response.ok) { setError(body.error || 'We could not save your registration. Please try again.'); setSaving(false); return; }
    setSubmitted(true); setSaving(false);
  }
  if (submitted) return <div className="card" style={{padding: 24, marginTop: 20}}><span className="tag">Registration received</span><h3 style={{fontSize: 23, marginBottom: 8}}>You’re on the list.</h3><p className="lede" style={{fontSize: 14}}>We sent a confirmation to your email. We’ll use it for future updates about {event.title}.</p></div>;
  return <form className="card" style={{padding: 24, marginTop: 20}} onSubmit={submit}>
    <h3 style={{fontSize: 23, margin: 0}}>Apply for this {event.event_type}</h3>
    <div className="form-field"><label htmlFor={`${event.id}-name`}>Full name</label><input id={`${event.id}-name`} name="full_name" autoComplete="name" minLength={2} maxLength={160} required /></div>
    <div className="form-field"><label htmlFor={`${event.id}-email`}>Email address</label><input id={`${event.id}-email`} name="email" type="email" autoComplete="email" maxLength={254} required /></div>
    <div className="form-field"><label htmlFor={`${event.id}-whatsapp`}>WhatsApp number</label><input id={`${event.id}-whatsapp`} name="whatsapp" type="tel" autoComplete="tel" minLength={5} maxLength={50} pattern="[+0-9()\s-]+" placeholder="+234 800 000 0000" required /></div>
    <fieldset style={{border: 0, padding: 0, margin: '18px 0'}}><legend style={{fontWeight: 700, fontSize: 13, marginBottom: 9}}>Are you in the HandsOn community WhatsApp group?</legend><label style={{marginRight: 16}}><input name="is_in_community_whatsapp" type="radio" value="yes" required /> Yes</label><label><input name="is_in_community_whatsapp" type="radio" value="no" /> No</label></fieldset>
    <label style={{display: 'flex', gap: 9, alignItems: 'flex-start', fontSize: 13, lineHeight: 1.5, margin: '16px 0'}}><input type="checkbox" name="wants_community_add" /> Add me to the HandsOn community WhatsApp group.</label>
    <div className="form-field"><label htmlFor={`${event.id}-source`}>How did you hear about this {event.event_type}?</label><input id={`${event.id}-source`} name="referral_source" required placeholder="Friend, WhatsApp, LinkedIn…" /></div>
    <label style={{display: 'flex', gap: 9, alignItems: 'flex-start', fontSize: 12, lineHeight: 1.5, margin: '14px 0'}}><input type="checkbox" name="consent" required /> I agree that HandsOn Academy may use these details to manage this event and email me about it.</label>
    <TurnstileWidget onToken={setToken} />
    {error && <p role="alert" style={{color: '#b9462b', fontSize: 13}}>{error}</p>}
    <button className="btn btn-primary" disabled={saving || Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY && !token)}>{saving ? 'Submitting…' : 'Apply now'}</button>
  </form>;
}
