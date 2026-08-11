# Design system

A restrained engineering product UI: deep slate ink, paper background, mint support colour, coral action colour. Manrope carries the reading hierarchy; DM Mono marks technical labels and statuses.

## Tokens

Defined on `:root` in `app/globals.css`:

| Token | Value | Use |
|---|---|---|
| `--ink` | `#082f3d` | Body text, headings |
| `--muted` | `#4f6f72` | Secondary text |
| `--line` | `#d4e5e1` | Borders |
| `--paper` | `#f8fcfa` | Page background |
| `--mint` | `#d6f1df` | Focus rings, soft fills |
| `--brand` | `#12706d` | Eyebrows, links, success notices |
| `--accent` | `#f47b32` | Primary actions |

Cards use subtle borders, modest radii, and light shadows. `.btn-primary` carries a hard offset shadow that lifts on hover; `.btn-secondary` is a bordered white surface.

## Components

Navigation, Footer, TrackCard, ApplicationForm, InterestForm, WaitlistModal, TurnstileWidget, DashboardNav, PortalHeader, MissionChecklist, KnowledgeCheck, KnowledgeGate, CommandCard, ProgressSummary, GoogleSignIn, InquiryTable, SubmissionReview.

## Conventions

- **Mobile first.** Section shells keep horizontal gutters at every breakpoint, headings use `overflow-wrap: anywhere`, and wide content scrolls inside its own container rather than the page body. The admin table sets `min-width` and scrolls horizontally inside its card.
- **Status colour is meaning, not decoration.** Inquiry statuses map to fixed colours — approved reads green, rejected and blocked read red, contacted amber, closed muted.
- **Say what happened.** Admin actions report their outcome in words, including whether an email actually reached the applicant, and distinguish a delivery failure that retrying can fix from email simply not being configured.
- **Third-party surfaces are exempt.** The Google sign-in button is rendered by Google inside its own iframe and cannot take these tokens. Lay out around it rather than trying to restyle it.
