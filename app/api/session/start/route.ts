import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ApiError, authenticate, failure, jsonBody, rateLimit } from '@/lib/api';
import { adminSupabase } from '@/lib/supabase/admin';
export async function POST(request: Request) {
  try {
    const { user, supabase } = await authenticate(request);
    const { mode } = await jsonBody(request, z.object({ mode: z.enum(['onboarding', 'practice']) }));
    await rateLimit(user.id, 'start', 12);
    const { data: sessionId, error } = await adminSupabase().rpc('start_session', { p_user_id: user.id, p_mode: mode });
    if (error) throw new ApiError(400, 'Your conversation could not start. Check your learning path and try again.');
    const [session, messages, mistakes] = await Promise.all([
      supabase.from('conversation_sessions').select('*').eq('id', sessionId).single(),
      supabase.from('messages').select('id,session_id,user_id,role,content,created_at,sequence').eq('session_id', sessionId).order('sequence'),
      supabase.from('mistakes').select('*').eq('session_id', sessionId).order('created_at'),
    ]);
    if (session.error || messages.error || mistakes.error) throw new ApiError(503, 'Your conversation could not be loaded. Please try again.');
    return NextResponse.json({ session: session.data, messages: messages.data, mistakes: mistakes.data });
  } catch (error) { return failure(error); }
}
