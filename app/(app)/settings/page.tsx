import { requireProfile } from '@/lib/auth';
import SettingsForm from '@/components/settings-form';
export const metadata = { title: 'Make it yours' };
export default async function Settings() { const { profile, user } = await requireProfile(); return <SettingsForm profile={profile} email={user.email || ''}/>; }
