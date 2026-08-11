# Content model

## How it actually works today

Course content lives in **two places**, and they are not the same shape. Understanding this split is the prerequisite for the v2 content management work.

**Static TypeScript — what learners read.**
`lib/lesson-content.ts` defines the `LessonMission` type and the lesson bodies. `lib/lesson-catalog.ts` composes them and exports `allLessonMissions`. Every learner-facing page reads from here, and `/dashboard/missions/[id]` pre-renders each mission at build time via `generateStaticParams`. `lib/tracks.ts` holds the track list the same way.

A `LessonMission` carries roughly twenty fields, several of them nested arrays of objects:

```
id, track, week, number, milestone, title, objective, time, difficulty,
objectives[], prerequisites[], setup[{platform, instructions[]}],
concepts[{title, body}], steps[{title, instruction, command, code,
explanation, expected, verify}], troubleshooting[{symptom, cause, fix}],
mistakes[], knowledge[{question, answer}], challenge{prompt, hint},
evidence[], learned[], next, tasks[], commands[], expected, hint
```

**The `missions` table — what the database knows.**
A thinner record: `id, track_slug, milestone, title, objective, estimated_minutes, tasks, commands, expected_outcome, hint, sort_order`. It exists so `mission_progress` and `submissions` have something to reference, and it backs the read-only listing at `/admin/content`. It holds none of the lesson body.

**Consequence:** editing what a learner sees means editing TypeScript and redeploying. The admin content page can list tracks and missions but cannot change them.

## What v2 requires

Adding CRUD forms alone would not work. In order:

1. **Extend the schema.** The lesson shape needs somewhere to live. JSONB columns on `missions` fit the nested arrays and match the existing `tasks`/`commands` treatment; a fully relational model would mean roughly eight new tables for little gain.
2. **Add admin write policies.** `learning_tracks` and `missions` currently have *only* public `SELECT` policies. There are no insert, update, or delete policies at all, so admin writes would be rejected by RLS before any UI could work.
3. **Migrate the content.** Move the existing 25 missions out of TypeScript without losing the lesson bodies learners currently see. Generate the seed from the compiled catalog rather than transcribing by hand.
4. **Change rendering.** Drop `generateStaticParams` from `/dashboard/missions/[id]` and `/tracks/[slug]`, or revalidate those paths after an edit. Without this, saved changes will not appear until the next deploy.
5. **Then build the CRUD UI.**

A decision worth making before starting: whether admins edit the full lesson body — steps, concepts, troubleshooting, knowledge checks — or only the lighter fields such as title, objective, tasks, commands, and ordering, with lesson bodies staying in code. The first is a genuine authoring tool; the second is a much smaller change.

## Principle to preserve

Rendering stays decoupled from storage. Pages should read through a repository boundary rather than importing content modules directly, so the source can move from TypeScript to Postgres without rewriting the views.
