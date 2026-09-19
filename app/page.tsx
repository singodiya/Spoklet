import Landing from '@/components/landing';
import { isConfigured, serverSupabase } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
export const dynamic = 'force-dynamic';
export default async function Home() {
  if (isConfigured()) {
    const supabase = serverSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data, error } = await supabase.from('profiles').select('onboarding_complete').eq('id', user.id).maybeSingle();
      if (error?.code === 'PGRST205' || error?.code === '42P01' || (!error && !data)) redirect('/setup-required');
      if (error) throw new Error('Your learning profile could not be loaded. Please try again.');
      redirect('/dashboard');
    }
  }
  return <Landing/>;
}
