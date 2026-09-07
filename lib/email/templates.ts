import {siteUrl, type EmailMessage} from './send';
import {EVENT_TIME_ZONE} from '../events';

// Brand tokens mirrored from app/globals.css. Email clients ignore CSS custom
// properties and external stylesheets, so every value is inlined literally.
const INK = '#082f3d';
const MUTED = '#4f6f72';
const LINE = '#d4e5e1';
const PAPER = '#f8fcfa';
const BRAND = '#12706d';
const ACCENT = '#f47b32';

/** Escapes learner-supplied text before it is interpolated into email HTML. */
function escape(value: string): string {
  return value.replace(/[&<>"']/g, character => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[character] as string));
}

/** First name where we have one, falling back to a warm generic greeting. */
function firstName(fullName: string): string {
  const first = fullName.trim().split(/\s+/)[0];
  return first ? escape(first) : 'there';
}

function button(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:26px 0"><tr><td style="border-radius:9px;background:${ACCENT}"><a href="${href}" style="display:inline-block;padding:14px 26px;font-family:Manrope,Arial,sans-serif;font-size:15px;font-weight:800;color:#ffffff;text-decoration:none;border-radius:9px">${label}</a></td></tr></table>`;
}

/** Wraps body markup in the shared shell: header, card, footer. */
function layout(preheader: string, body: string): string {
  const site = siteUrl();
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>HandsOn Academy</title></head>
<body style="margin:0;padding:0;background:${PAPER};color:${INK};font-family:Manrope,Arial,Helvetica,sans-serif">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escape(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PAPER};padding:32px 16px">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">
<tr><td style="padding-bottom:22px"><a href="${site}" style="font-size:22px;font-weight:800;letter-spacing:-.06em;color:${INK};text-decoration:none">HandsOn<span style="color:${ACCENT}">.</span></a></td></tr>
<tr><td style="background:#ffffff;border:1px solid ${LINE};border-radius:14px;padding:32px">${body}</td></tr>
<tr><td style="padding-top:20px;font-size:12px;line-height:1.7;color:${MUTED}">
HandsOn Academy &middot; project-based technology learning<br>
<a href="${site}" style="color:${MUTED}">${site.replace(/^https?:\/\//, '')}</a> &middot;
<a href="${site}/privacy" style="color:${MUTED}">Privacy</a> &middot;
<a href="${site}/terms" style="color:${MUTED}">Terms</a><br>
You are receiving this because you applied to HandsOn Academy.
</td></tr>
</table></td></tr></table></body></html>`;
}

const eyebrow = (text: string) => `<p style="margin:0 0 10px;font:600 12px 'DM Mono',Consolas,monospace;letter-spacing:.1em;text-transform:uppercase;color:${BRAND}">${escape(text)}</p>`;
const heading = (text: string) => `<h1 style="margin:0 0 16px;font-size:27px;line-height:1.2;letter-spacing:-.04em;color:${INK}">${escape(text)}</h1>`;
const paragraph = (html: string) => `<p style="margin:0 0 15px;font-size:15px;line-height:1.75;color:${MUTED}">${html}</p>`;
const bullets = (items: string[]) => `<ul style="margin:0 0 15px;padding-left:20px;font-size:15px;line-height:1.75;color:${MUTED}">${items.map(item => `<li style="margin-bottom:8px">${item}</li>`).join('')}</ul>`;

/** Sent to the applicant when an admin approves them. Carries the portal link. */
export function applicationApprovedEmail(applicant: {full_name: string; email: string}): EmailMessage {
  const site = siteUrl();
  const name = firstName(applicant.full_name);
  const loginUrl = `${site}/login`;
  return {
    to: applicant.email,
    subject: 'You are in — your HandsOn Academy portal is open',
    html: layout('Your application was approved. Sign in to start your first mission.', [
      eyebrow('Application approved'),
      heading('You are in.'),
      paragraph(`Hi ${name}, your application has been approved and the HandsOn Academy learning portal is now open to you.`),
      button(loginUrl, 'Sign in to the portal'),
      paragraph(`<strong style="color:${INK}">Sign in with the Google account on this email address</strong> (${escape(applicant.email)}). Access is tied to it, so another address will not be recognised.`),
      paragraph(`<strong style="color:${INK}">Your first hour:</strong> pick a track, open the first mission, work through the checklist on your own machine, then submit your evidence. A reviewer reads every submission and replies.`),
      paragraph('Both tracks and every mission in them are free.'),
      paragraph(`If the button does not work, paste this into your browser: <a href="${loginUrl}" style="color:${BRAND}">${loginUrl}</a>`),
    ].join('')),
    text: `Hi ${applicant.full_name.trim().split(/\s+/)[0] || 'there'},

Your application has been approved and the HandsOn Academy learning portal is now open to you.

Sign in here: ${loginUrl}

Sign in with the Google account on this email address (${applicant.email}). Access is tied to it, so another address will not be recognised.

Your first hour: pick a track, open the first mission, work through the checklist on your own machine, then submit your evidence. A reviewer reads every submission and replies.

Both tracks and every mission in them are free.

HandsOn Academy
${site}`,
  };
}

/** Sent to the applicant when an admin rejects them. */
export function applicationDeclinedEmail(applicant: {full_name: string; email: string}): EmailMessage {
  const site = siteUrl();
  const name = firstName(applicant.full_name);
  return {
    to: applicant.email,
    subject: 'An update on your HandsOn Academy application',
    html: layout('An update on your application.', [
      eyebrow('Application update'),
      heading('Not this time.'),
      paragraph(`Hi ${name}, thank you for applying to HandsOn Academy. We are not able to offer you a place in the current cohort.`),
      paragraph(`<strong style="color:${INK}">Possible reasons:</strong>`),
      bullets([
        'A duplicate application. We already had one from you.',
        '<strong>You applied with an address that is not Gmail.</strong> Portal access is only available through a Google account at the moment, so we cannot let you in with any other address.',
        'A security concern, such as a phone number that does not look correct or an email address that looks like spam.',
      ]),
      paragraph(`If none of these apply to you, please tell us. Reply directly to this email, or reach us through <a href="${site}/community" style="color:${BRAND}">the community</a>, and we will look at your application again.`),
      paragraph('You are also welcome to apply again for a future cohort. Applications that show hands-on work you have already attempted stand out most.'),
      button(`${site}/tracks`, 'See what the tracks cover'),
    ].join('')),
    text: `Hi ${applicant.full_name.trim().split(/\s+/)[0] || 'there'},

Thank you for applying to HandsOn Academy. We are not able to offer you a place in the current cohort.

Possible reasons:

* A duplicate application. We already had one from you.
* You applied with an address that is not Gmail. Portal access is only available through a Google account at the moment, so we cannot let you in with any other address.
* A security concern, such as a phone number that does not look correct or an email address that looks like spam.

If none of these apply to you, please tell us. Reply directly to this email, or reach us through the community at ${site}/community, and we will look at your application again.

You are also welcome to apply again for a future cohort. Applications that show hands-on work you have already attempted stand out most.

Tracks: ${site}/tracks

HandsOn Academy
${site}`,
  };
}

/** Immediate confirmation for a bootcamp or webinar registration. */
export function eventRegistrationEmail(registration: {full_name: string; email: string}, event: {title: string; event_type: string; event_starts_at: string | null; event_ends_at: string | null; call_link: string | null}): EmailMessage {
  const site = siteUrl();
  const name = firstName(registration.full_name);
  const when = event.event_starts_at ? new Intl.DateTimeFormat('en', {timeZone: EVENT_TIME_ZONE, weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short'}).format(new Date(event.event_starts_at)) : null;
  const kind = event.event_type === 'bootcamp' ? 'bootcamp' : 'webinar';
  const details = [when && `<strong style="color:${INK}">Starts:</strong> ${escape(when)}`, event.call_link && `<strong style="color:${INK}">Event link:</strong> <a href="${escape(event.call_link)}" style="color:${BRAND}">Open the event link</a>`].filter(Boolean).join('<br>');
  return {
    to: registration.email,
    subject: `You’re registered for ${event.title}`,
    html: layout(`Your ${kind} registration is confirmed.`, [
      eyebrow(`${kind} registration`), heading('You’re on the list.'),
      paragraph(`Hi ${name}, we’ve received your registration for <strong style="color:${INK}">${escape(event.title)}</strong>.`),
      details && paragraph(details),
      paragraph('We’ll send further updates and important event information to this email address. Please keep an eye on your inbox.'),
      button(`${site}/bootcamp`, 'View bootcamps'),
    ].join('')),
    text: `Hi ${registration.full_name.trim().split(/\s+/)[0] || 'there'},\n\nYou’re registered for ${event.title}.${when ? `\nStarts: ${when}` : ''}${event.call_link ? `\nEvent link: ${event.call_link}` : ''}\n\nWe’ll send further updates and important event information to this email address.\n\nHandsOn Academy\n${site}`,
  };
}

/**
 * Sent when an existing admin invites someone to the admin team. There is no token
 * in this link: access is granted by signing in with Google on the invited address,
 * so a forwarded copy of this email gets the recipient nowhere.
 */
export function adminInviteEmail(invite: {full_name: string; email: string}, invitedBy: string | null): EmailMessage {
  const site = siteUrl();
  const name = firstName(invite.full_name);
  const loginUrl = `${site}/login`;
  const from = invitedBy ? ` by ${escape(invitedBy)}` : '';
  return {
    to: invite.email,
    subject: 'You have been added as a HandsOn Academy admin',
    html: layout('Sign in with Google on this address to open the admin portal.', [
      eyebrow('Admin access'),
      heading('You are now an admin.'),
      paragraph(`Hi ${name}, you have been added${from} to the HandsOn Academy admin team.`),
      button(loginUrl, 'Open the admin portal'),
      paragraph(`<strong style="color:${INK}">Sign in with the Google account on this email address</strong> (${escape(invite.email)}). Your access is tied to it, and signing in is what activates it — there is nothing else to accept.`),
      paragraph(`<strong style="color:${INK}">What you can do:</strong> review learner submissions and applications, manage bootcamps and their participants, email registrants, and invite other admins.`),
      paragraph('If you were not expecting this, you can ignore the email and tell us — access can be removed at any time.'),
      paragraph(`If the button does not work, paste this into your browser: <a href="${loginUrl}" style="color:${BRAND}">${loginUrl}</a>`),
    ].join('')),
    text: `Hi ${invite.full_name.trim().split(/\s+/)[0] || 'there'},

You have been added${invitedBy ? ` by ${invitedBy}` : ''} to the HandsOn Academy admin team.

Open the admin portal: ${loginUrl}

Sign in with the Google account on this email address (${invite.email}). Your access is tied to it, and signing in is what activates it — there is nothing else to accept.

What you can do: review learner submissions and applications, manage bootcamps and their participants, email registrants, and invite other admins.

If you were not expecting this, you can ignore the email and tell us — access can be removed at any time.

HandsOn Academy
${site}`,
  };
}

/** A hand-written update sent by an administrator to opted-in community contacts. */
export function announcementEmail(recipient: string, announcement: {title: string; body: string}): EmailMessage {
  const textBody = announcement.body.trim();
  return {
    to: recipient,
    subject: announcement.title.trim(),
    html: layout(announcement.title, [eyebrow('HandsOn Academy update'), heading(announcement.title), paragraph(escape(textBody).replace(/\n/g, '<br>'))].join('')),
    text: `${announcement.title.trim()}\n\n${textBody}\n\nHandsOn Academy\n${siteUrl()}`,
  };
}
