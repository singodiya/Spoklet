'use client';
import { createBrowserClient } from '@supabase/ssr';
export function browserSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Spoklet is still being set up. Please try again later.');
  return createBrowserClient(url, key);
}
