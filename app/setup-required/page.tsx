import { redirect } from 'next/navigation';
import { AudioLines, Check, RotateCcw } from 'lucide-react';
import { isConfigured, serverSupabase } from '@/lib/supabase/server';
import LogoutButton from '@/components/logout-button';

export const metadata = { title: 'One setup step to go' };
export const dynamic = 'force-dynamic';

export default async function SetupRequired() {
  if (!isConfigured()) redirect('/login?notice=setup');
  const supabase = serverSupabase();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) redirect('/login');
  const { data, error } = await supabase.from('profiles').select('onboarding_complete').eq('id', user.id).maybeSingle();
  if (!error && data) redirect('/dashboard');

  return <main id="main" className="full-page-state">
    <AudioLines size={42}/>
    <span className="level-pill"><Check size={15}/>Your account is connected</span>
    <h1>One setup step to go.</h1>
    <p>You’re signed in. Spoklet’s learning space still needs to be prepared before your first conversation can begin.</p>
    <p className="helper-text">Once the app setup is finished, check again to continue. You don’t need to create another account.</p>
    <form action="/" method="get"><button type="submit" className="button">Check again <RotateCcw size={17}/></button></form>
    <LogoutButton/>
  </main>;
}
