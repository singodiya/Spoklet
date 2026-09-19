import { requireProfile } from '@/lib/auth';
import VoiceRoom from '@/components/voice-room';
export const metadata = { title: 'Let’s talk' };
export default async function Practice() {
  const { profile, supabase, user } = await requireProfile();
  if (!profile.onboarding_complete) return <VoiceRoom mode="onboarding" profile={profile}/>;
  const { data: stage, error } = await supabase.from('roadmap_stages').select('*').eq('user_id', user.id).eq('stage_number', profile.current_stage_number).single();
  if (error) throw new Error('Your current learning stage could not be loaded.');
  return <VoiceRoom mode="practice" profile={profile} stage={stage}/>;
}
