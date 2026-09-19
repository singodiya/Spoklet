import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ApiError, authenticate, failure, jsonBody, ownedSession, rateLimit, claimSession, releaseSession } from '@/lib/api';
import { adminSupabase } from '@/lib/supabase/admin';
import { chatCompletion } from '@/lib/ai/providers';
import { parseModelReply, canAssess } from '@/lib/ai/parser';
import { CHAT_INTENTS, systemPrompt } from '@/lib/ai/prompts';
import { SUPPORT_LANGUAGES, supportLanguage } from '@/lib/language';
import { MAX_USER_TURNS } from '@/lib/constants';
import type { Profile, Stage, Message } from '@/lib/types';
export const runtime = 'nodejs';
export const maxDuration = 60;
const input = z.object({ sessionId: z.string().uuid(), requestId: z.string().uuid(), message: z.string().trim().max(4000), mode: z.enum(['onboarding', 'practice']), intent: z.enum(CHAT_INTENTS).default('message'), support_language: z.enum(SUPPORT_LANGUAGES).optional() });
export async function POST(request: Request) {
  let lease: { sessionId: string; requestId: string } | undefined;
  try {
    const { supabase, user } = await authenticate(request);
    const body = await jsonBody(request, input);
    const session = await ownedSession(supabase, user.id, body.sessionId);
    if (session.mode !== body.mode) throw new ApiError(400, 'This conversation has a different purpose.');
    const claim = await claimSession(user.id, body.sessionId, body.requestId);
    if (claim.cached) return NextResponse.json(claim.response);
    if (claim.ended) throw new ApiError(409, 'This conversation has ended. Start another from your dashboard.');
    lease = body;
    await rateLimit(user.id, 'chat', 20);
    const [profile, history, stage, memories] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', user.id).single(),
      supabase.from('messages').select('*').eq('session_id', body.sessionId).order('sequence'),
      session.stage_id ? supabase.from('roadmap_stages').select('*').eq('id', session.stage_id).single() : Promise.resolve({ data: null, error: null }),
      supabase.from('conversation_sessions').select('summary').eq('user_id', user.id).not('ended_at', 'is', null).not('summary', 'is', null).order('ended_at', { ascending: false }).limit(3),
    ]);
    if (profile.error || history.error || stage.error || memories.error) throw new ApiError(503, 'Your conversation memory could not be loaded. Please try again.');
    const messages = history.data as Message[];
    if (body.intent !== 'message' && body.message) throw new ApiError(400, 'Send your answer separately from a help action.');
    if (body.intent === 'message' && !body.message && messages.length) throw new ApiError(400, 'Please say something to continue.');
    if (body.intent === 'finish' && (body.mode !== 'onboarding' || !canAssess(messages))) throw new ApiError(400, 'पहले चार छोटे जवाब दें, फिर अपना roadmap बनाएं।');
    if (body.message && messages.filter(m => m.role === 'user').length >= MAX_USER_TURNS) throw new ApiError(400, 'That was a good conversation. Finish this session and start a new one.');
    const conversation = messages.map(m => ({ role: m.role, content: m.content }));
    if (body.message) conversation.push({ role: 'user', content: body.message });
    const language = body.support_language ?? supportLanguage(user.user_metadata?.support_language);
    const learner = { ...profile.data, support_language: language } as Profile;
    const planning = body.mode === 'onboarding' && canAssess(conversation) && ['message', 'finish'].includes(body.intent);
    const raw = await chatCompletion([{ role: 'system', content: systemPrompt(body.mode, learner, stage.data as Stage | null, memories.data.map(m => m.summary as string), planning ? 'finish' : body.intent, conversation.filter(m => m.role === 'user').length) }, ...conversation], planning ? 'roadmap' : body.mode);
    const result = parseModelReply(raw, body.mode);
    if (result.done && (!canAssess(conversation) || !['message', 'finish'].includes(body.intent))) { result.done = false; result.assessment = undefined; result.roadmap = undefined; result.reply = language === 'english' ? 'A little more will help us make your starter plan. Where would you like to use English?' : 'आपके लिए plan बनाने से पहले थोड़ा और जान लें। आपको English कहाँ बोलनी है — काम पर या रोज़ की बातचीत में?'; }
    if (planning && !result.done) throw new ApiError(502, language === 'english' ? 'Your roadmap could not be prepared. Please retry this reply.' : 'Roadmap तैयार नहीं हो पाया। कृपया दोबारा कोशिश करें।');
    result.corrections = result.corrections.filter(c => body.message.toLowerCase().includes(c.original.toLowerCase()) && c.type !== 'pronunciation');
    const { data, error } = await adminSupabase().rpc('save_chat_turn', { p_user_id: user.id, p_session_id: body.sessionId, p_request_id: body.requestId, p_message: body.message, p_result: result });
    if (error) throw new ApiError(503, 'Your reply could not be saved. Retry to continue this conversation.');
    lease = undefined;
    return NextResponse.json(data);
  } catch (error) { return failure(error); }
  finally { if (lease) await releaseSession(lease.sessionId, lease.requestId); }
}
