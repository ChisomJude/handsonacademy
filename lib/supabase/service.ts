import {createClient} from '@supabase/supabase-js';
// Service-role client: bypasses RLS and needs no signed-in user. It exists for the
// one job that has no session to act as -- the email outbox, which is written from
// anonymous registration requests and drained by a cron. Nothing else should import
// it; every other route keeps using the cookie-bound client and RLS. Returns null
// when the key is not configured so callers can degrade instead of crash.
export function createSupabaseServiceClient(){const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;if(!url||!key)return null;return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}})}
