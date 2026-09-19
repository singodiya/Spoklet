import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ApiError, authenticate, failure, jsonBody, ownedSession, rateLimit, claimSession, releaseSession } from '@/lib/api';
import { adminSupabase } from '@/lib/supabase/admin';
import { chatCompletion } from '@/lib/ai/providers';
import { parseSummary } from '@/lib/ai/parser';
import { summaryPrompt } from '@/lib/ai/prompts';
import { supportLanguage } from '@/lib/language';
export const runtime = 'nodejs';
export const maxDuration = 60;
export async function POST(request: Request) {
  let lease: { sessionId: string; requestId: string } | undefined;
  try {
    const { user, supabase } = await authenticate(request);
    const body = await jsonBody(request, z.object({ sessionId: z.string().uuid(), requestId: z.string().uuid() }));
    const session = await ownedSession(supabase, user.id, body.sessionId);
    if (session.mode !== 'practice') throw new ApiError(400, 'Finish your first conversation with Vashu to save your roadmap.');
    const claim = await claimSession(user.id, body.sessionId, body.requestId);
    if (claim.ended) return NextResponse.json(claim);
    if (claim.cached) throw new ApiError(400, 'Please use a new request to finish the session.');
    lease = body;
    await rateLimit(user.id, 'end', 6);
    const [transcript, profile, stage, memories] = await Promise.all([
      supabase.from('messages').select('role,content').eq('session_id', body.sessionId).order('sequence'),
      supabase.from('profiles').select('current_cefr_level,learning_goal,native_language').eq('id', user.id).single(),
      supabase.from('roadmap_stages').select('title,focus_skills,stage_number').eq('id', session.stage_id).single(),
      supabase.from('conversation_sessions').select('summary').eq('user_id', user.id).not('ended_at', 'is', null).order('ended_at', { ascending: false }).limit(3),
    ]);
    if (transcript.error || profile.error || stage.error || memories.error) throw new ApiError(503, 'Your conversation could not be loaded. Please try again.');
    const raw = transcript.data.length ? await chatCompletion([{ role: 'system', content: `${summaryPrompt}\nLearner context: ${JSON.stringify({ ...profile.data, support_language: supportLanguage(user.user_metadata?.support_language), stage: stage.data, memories: memories.data })}` }, ...transcript.data], 'summary') : '';
    const summary = parseSummary(raw);
    const { data, error } = await adminSupabase().rpc('finish_session', { p_user_id: user.id, p_session_id: body.sessionId, p_request_id: body.requestId, p_summary: summary.summary, p_score: summary.score });
    if (error) throw new ApiError(503, 'We couldn’t finish saving your session. Please try again.');
    lease = undefined;
    return NextResponse.json(data);
  } catch (error) { return failure(error); }
  finally { if (lease) await releaseSession(lease.sessionId, lease.requestId); }
}
