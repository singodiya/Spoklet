'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { AudioLines, LayoutDashboard, LogOut, Settings2, Sparkles } from 'lucide-react';
import { Logo } from './brand';
import { browserSupabase } from '@/lib/supabase/client';
import type { Profile } from '@/lib/types';
export default function AppShell({ profile, children }: { profile: Profile; children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function logout() {
    setBusy(true); setError('');
    try {
      const { error: failure } = await browserSupabase().auth.signOut();
      if (failure) throw failure;
      router.replace('/login'); router.refresh();
    } catch { setError('Could not log out. Please try again.'); setBusy(false); }
  }
  const links = [
    { href: '/dashboard', label: 'Roadmap', Icon: LayoutDashboard },
    { href: '/practice', label: 'Practice', Icon: AudioLines },
    { href: '/settings', label: 'Settings', Icon: Settings2 },
  ];
  return <div className="app-frame"><aside className="sidebar">
    <Logo/><div className="sidebar-caption">A LITTLE MORE YOU, EVERY DAY.</div>
    <nav aria-label="Main navigation">{links.map(({ href, label, Icon }) => {
      const current = path === href || (href === '/practice' && path === '/onboarding');
      return <Link key={href} href={href} className={current ? 'current' : ''} aria-current={current ? 'page' : undefined} aria-label={label}><Icon size={19}/><span>{label}</span></Link>;
    })}</nav>
    <button className="mobile-logout" onClick={logout} disabled={busy} aria-label="Log out" title="Log out"><LogOut size={20}/><span>Logout</span></button>
    <div className="sidebar-bottom"><div className="sidebar-note"><Sparkles size={19}/><p>थोड़ी practice.<br/>थोड़ा confidence.</p><span>One conversation at a time.</span></div><div className="profile-mini"><span>{profile.full_name.charAt(0).toUpperCase() || 'Y'}</span><div><strong>{profile.full_name || 'Your profile'}</strong><small>{profile.onboarding_complete ? profile.current_cefr_level + ' · Growing every day' : 'Your journey is beginning'}</small></div><button className="logout" onClick={logout} disabled={busy} aria-label="Log out" title="Log out"><LogOut size={18}/></button></div></div>
    {error && <p className="error-banner shell-error" role="alert">{error}</p>}
  </aside><div className="app-body">{children}</div></div>;
}

