"use client";
import {useState} from 'react';
import {CheckCircle2, Send, LoaderCircle, Star} from 'lucide-react';
import type {Mission} from '@/lib/missions';
import type {LessonMission} from '@/lib/lesson-content';
import {KnowledgeGate} from '@/components/learning/knowledge-gate';
import {SubmissionThread} from '@/components/learning/submission-thread';

export function MissionChecklist({mission}: {mission: Mission | LessonMission}) {
  const [checks, setChecks] = useState<boolean[]>(mission.tasks.map(() => false));
  const [evidence, setEvidence] = useState('');
  const [rating, setRating] = useState(0);
  const [ratingComment, setRatingComment] = useState('');
  const [quizPassed, setQuizPassed] = useState(false);
  const [sent, setSent] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const complete = checks.every(Boolean);
  const ready = complete && quizPassed && Boolean(evidence.trim()) && !saving;

  async function submit() {
    setSaving(true); setError('');
    const response = await fetch('/api/submissions', {
      method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({mission_id: mission.id, evidence, rating: rating || null, rating_comment: ratingComment}),
    });
    if (!response.ok) { setError('Sign in and complete the database setup before submitting evidence.'); setSaving(false); return; }
    // Progress is recorded immediately and independently of review: waiting on a
    // reviewer must never hold a learner at the same mission.
    const progress = await fetch('/api/progress', {
      method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({mission_id: mission.id, status: 'completed'}),
    });
    if (!progress.ok) { setError('Evidence was saved, but progress could not be updated. Please try again.'); setSaving(false); return; }
    setEvidence(''); setRatingComment(''); setRating(0);
    setSent(count => count + 1);
    setSaving(false);
  }

  return <div>
    <div style={{display: 'grid', gap: 10}}>
      {mission.tasks.map((task, index) => <label className="card" style={{padding: 15, display: 'flex', gap: 11, alignItems: 'center', cursor: 'pointer'}} key={task}>
        <input type="checkbox" checked={checks[index]} onChange={event => setChecks(previous => previous.map((value, position) => position === index ? event.target.checked : value))} />
        <span>{task}</span>
        {checks[index] && <CheckCircle2 size={17} color="var(--brand)" style={{marginLeft: 'auto'}} />}
      </label>)}
    </div>

    <KnowledgeGate track={mission.track} missionId={mission.id} onPassed={setQuizPassed} />

    <div className="card" style={{padding: 22, marginTop: 25}}>
      <span className="eyebrow">Challenge evidence</span>
      <p style={{fontWeight: 700}}>Submit only after completing the tasks and passing the knowledge check.</p>
      <textarea value={evidence} onChange={event => setEvidence(event.target.value)} rows={6}
        placeholder="Paste your command output, explanation, GitHub link, or other evidence here…"
        style={{width: '100%', font: 'inherit', padding: 12, border: '1px solid var(--line)', borderRadius: 8}} />

      <div style={{borderTop: '1px solid var(--line)', marginTop: 18, paddingTop: 16}}>
        <b style={{fontSize: 14}}>How was this module?</b>
        <p style={{fontSize: 12, color: 'var(--muted)', margin: '3px 0 9px'}}>Optional, and it goes to the team with your evidence.</p>
        <div style={{display: 'flex', gap: 6}}>
          {[1, 2, 3, 4, 5].map(step => <button key={step} type="button" onClick={() => setRating(rating === step ? 0 : step)}
            aria-label={`Rate ${step} out of 5`} aria-pressed={rating === step}
            style={{background: 'none', border: 0, padding: 2, cursor: 'pointer', lineHeight: 0}}>
            <Star size={24} fill={step <= rating ? 'var(--accent)' : 'none'} color={step <= rating ? 'var(--accent)' : '#c7d6d4'} />
          </button>)}
        </div>
        <input value={ratingComment} onChange={event => setRatingComment(event.target.value)} maxLength={2000}
          placeholder="What worked, what was confusing?"
          style={{width: '100%', font: 'inherit', fontSize: 13, padding: 11, border: '1px solid var(--line)', borderRadius: 8, marginTop: 10}} />
      </div>

      <button disabled={!ready} className="btn btn-primary" style={{marginTop: 14, opacity: ready ? 1 : .5}} onClick={submit}>
        {saving ? <LoaderCircle className="spin" size={16} /> : <Send size={16} />} {saving ? 'Saving…' : !quizPassed ? 'Pass the knowledge check first' : 'Complete mission'}
      </button>
      {error && <p role="alert" style={{color: '#b9462b', fontSize: 13}}>{error}</p>}
      {sent > 0 && <p role="status" style={{color: 'var(--brand)', fontSize: 13}}>Evidence submitted. The next mission is open now — your reviewer will reply here.</p>}
      <style>{`.spin{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>

    <SubmissionThread missionId={mission.id} refreshKey={sent} />
  </div>;
}
