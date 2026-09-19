import { redirect } from 'next/navigation';
import { requireProfile } from '@/lib/auth';
import AppShell from '@/components/app-shell';
import VoiceRoom from '@/components/voice-room';
export const metadata = { title: 'A conversation to begin' };
export default async function Onboarding() { const { profile } = await requireProfile(); if (profile.onboarding_complete) redirect('/dashboard'); return <AppShell profile={profile}><VoiceRoom mode="onboarding" profile={profile}/></AppShell>; }
