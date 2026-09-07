import {allLessonMissions} from './lesson-catalog';
import {tracks} from './tracks';

/**
 * Shared shape of one submission plus the thread hanging off it. The admin queue and
 * the learner's own history render from the same data, so feedback reads identically
 * on both sides.
 */
export type SubmissionMessage = {
  id: string; submission_id: string; author_role: 'admin' | 'learner';
  author_name: string | null; body: string; created_at: string;
};
export type SubmissionRecord = {
  id: string; user_id: string; mission_id: string; evidence: string;
  status: 'pending' | 'approved' | 'needs_changes';
  reviewer_notes: string | null; reviewed_at: string | null; reviewed_by_email?: string | null;
  rating: number | null; rating_comment: string | null; created_at: string;
};

/**
 * Mission ids are catalog keys, so the track, week, and title come from the catalog
 * rather than another column that could drift out of step with the lesson content.
 */
export function missionContext(missionId: string) {
  const mission = allLessonMissions.find(item => item.id === missionId);
  const track = mission ? tracks.find(item => item.slug === mission.track) : undefined;
  const sequence = mission ? allLessonMissions.filter(item => item.track === mission.track).sort((a, b) => a.number - b.number) : [];
  return {
    missionTitle: mission?.title || missionId,
    milestone: mission?.milestone || null,
    trackSlug: mission?.track || null,
    trackTitle: track?.title || mission?.track || 'Unassigned track',
    week: mission?.week ?? null,
    number: mission?.number ?? null,
    total: sequence.length,
    known: Boolean(mission),
  };
}

/** How far along a track this learner is, for context beside their submission. */
export function trackStage(trackSlug: string | null, completedMissionIds: string[]) {
  if (!trackSlug) return null;
  const sequence = allLessonMissions.filter(item => item.track === trackSlug).sort((a, b) => a.number - b.number);
  if (!sequence.length) return null;
  const done = sequence.filter(item => completedMissionIds.includes(item.id)).length;
  return {done, total: sequence.length, percent: Math.round((done / sequence.length) * 100)};
}

export const statusLabel = (status: string) =>
  status === 'approved' ? 'Approved' : status === 'needs_changes' ? 'Changes requested' : 'Awaiting review';
