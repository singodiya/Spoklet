'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { browserSupabase } from '@/lib/supabase/client';
export default function LogoutButton() {
  const router = useRouter(); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  async function logout() { setBusy(true); try { const { error } = await browserSupabase().auth.signOut(); if (error) throw error; router.replace('/login'); router.refresh(); } catch { setError('Could not log out. Please try again.'); setBusy(false); } }
  return <div className="account-logout"><button type="button" className="button button-ghost" onClick={logout} disabled={busy}><LogOut size={16}/>Log out of Spoklet</button>{error && <p className="error-banner" role="alert">{error}</p>}</div>;
}
