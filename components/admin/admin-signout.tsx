'use client';

import {LogOut} from 'lucide-react';
import {useRouter} from 'next/navigation';
import {createSupabaseBrowserClient} from '@/lib/supabase/browser';

export function AdminSignOut(){
  const router=useRouter();
  async function signOut(){
    await createSupabaseBrowserClient().auth.signOut();
    router.push('/login');
    router.refresh();
  }
  return <button onClick={signOut} className="admin-signout"><LogOut size={16}/> Sign out</button>;
}
