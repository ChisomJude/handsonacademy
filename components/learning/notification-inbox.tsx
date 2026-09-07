'use client';
import {useCallback, useEffect, useState} from 'react';
import Link from 'next/link';
import {Bell, Check} from 'lucide-react';

type Notification = {id: string; kind: string; title: string; body: string | null; link: string | null; created_at: string; read_at: string | null};
const ago = (value: string) => {
  const minutes = Math.round((Date.now() - new Date(value).getTime()) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 1440) return `${Math.round(minutes / 60)}h ago`;
  return new Date(value).toLocaleDateString('en', {day: 'numeric', month: 'short'});
};

/**
 * What a reviewer said, waiting for the learner at sign-in. Fails quietly: before
 * migration 006 the endpoint has no table to read and the bell simply stays hidden.
 */
export function NotificationInbox() {
  const [items, setItems] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/notifications');
      if (!response.ok) return;
      const body = await response.json() as {notifications?: Notification[]};
      setItems(body.notifications || []);
      setReady(true);
    } catch { /* offline or not migrated yet: leave the bell hidden */ }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const unread = items.filter(item => !item.read_at).length;

  async function markAll() {
    setItems(previous => previous.map(item => ({...item, read_at: item.read_at || new Date().toISOString()})));
    await fetch('/api/notifications', {method: 'PATCH', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({all: true})});
  }
  async function markOne(id: string) {
    setItems(previous => previous.map(item => item.id === id ? {...item, read_at: item.read_at || new Date().toISOString()} : item));
    await fetch('/api/notifications', {method: 'PATCH', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({id})});
  }

  if (!ready) return null;
  return <div style={{position: 'relative'}}>
    <button onClick={() => setOpen(!open)} className="bell" aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`} aria-expanded={open}>
      <Bell size={19} />
      {unread > 0 && <span className="bell-dot">{unread > 9 ? '9+' : unread}</span>}
    </button>
    {open && <div className="bell-panel">
      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 4px 10px'}}>
        <b style={{fontSize: 14}}>Notifications</b>
        {unread > 0 && <button onClick={markAll} style={{background: 'none', border: 0, font: '600 12px Manrope', color: 'var(--brand)', cursor: 'pointer'}}><Check size={13} /> Mark all read</button>}
      </div>
      {items.length === 0
        ? <p style={{fontSize: 13, color: 'var(--muted)', padding: '14px 4px', margin: 0}}>Nothing yet. Feedback on your submissions shows up here.</p>
        : <div style={{display: 'grid', gap: 6, maxHeight: 380, overflowY: 'auto'}}>
            {items.map(item => {
              const inner = <>
                <b style={{fontSize: 13, display: 'block'}}>{item.title}</b>
                {item.body && <span style={{fontSize: 12, color: 'var(--muted)', lineHeight: 1.5, display: 'block', marginTop: 2}}>{item.body}</span>}
                <span style={{fontSize: 11, color: 'var(--muted)'}}>{ago(item.created_at)}</span>
              </>;
              return item.link
                ? <Link key={item.id} href={item.link} className={`bell-item ${item.read_at ? '' : 'bell-unread'}`} onClick={() => {void markOne(item.id); setOpen(false);}}>{inner}</Link>
                : <div key={item.id} className={`bell-item ${item.read_at ? '' : 'bell-unread'}`} onClick={() => void markOne(item.id)}>{inner}</div>;
            })}
          </div>}
    </div>}
    <style>{`.bell{position:relative;background:none;border:0;color:var(--ink);cursor:pointer;padding:6px;display:flex}.bell-dot{position:absolute;top:0;right:0;background:var(--accent);color:#fff;border-radius:99px;min-width:16px;height:16px;font:800 10px Manrope;display:grid;place-items:center;padding:0 3px}.bell-panel{position:absolute;right:0;top:40px;width:min(340px,calc(100vw - 40px));background:#fff;border:1px solid var(--line);border-radius:12px;box-shadow:0 14px 40px #17404a1f;padding:12px;z-index:20}.bell-item{display:block;padding:9px 10px;border-radius:8px;text-decoration:none;color:inherit;cursor:pointer}.bell-item:hover{background:#f4faf8}.bell-unread{background:#eef8f4}`}</style>
  </div>;
}
