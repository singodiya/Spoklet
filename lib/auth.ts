import 'server-only';
import { redirect } from 'next/navigation';
import { isConfigured, serverSupabase } from './supabase/server';
import type { Profile } from './types';
import { supportLanguage } from './language';
export async function requireProfile() {
  if (!isConfigured()) redirect('/login?notice=setup');
  const supabase = serverSupabase();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) redirect('/login');
  const { data, error } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
  if (error?.code === 'PGRST205' || error?.code === '42P01' || (!error && !data)) redirect('/setup-required');
  if (error || !data) throw new Error('Your learning profile could not be loaded. Please try again.');
  return { supabase, user, profile: { ...data, support_language: supportLanguage(user.user_metadata?.support_language) } as Profile };
}
