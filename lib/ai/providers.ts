import 'server-only';
import { ApiError } from '../api';
import { responseFormat, type ReplyKind } from './response-format';
export async function providerRequest(url: string, init: RequestInit) {
  try {
    const response = await fetch(url, { ...init, cache: 'no-store', signal: AbortSignal.timeout(45000) });
    if (!response.ok) throw new ApiError(response.status === 429 ? 429 : 502, response.status === 429 ? 'Our voice partner is busy. Please try again shortly.' : 'The voice service is temporarily unavailable. Please try again.');
    return await response.json();
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(502, 'The voice service took too long to respond. Please try again.');
  }
}
export async function chatCompletion(messages: { role: 'system' | 'user' | 'assistant'; content: string }[], kind: ReplyKind = 'practice'): Promise<string> {
  if (!process.env.SARVAM_API_KEY) throw new ApiError(503, 'The voice partner is not configured yet.');
  const data = await providerRequest('https://api.sarvam.ai/v1/chat/completions', {
    method: 'POST', headers: { 'api-subscription-key': process.env.SARVAM_API_KEY, 'Content-Type': 'application/json' },
    // Sarvam enables reasoning by default; it can consume the budget without a spoken answer.
    body: JSON.stringify({ model: 'sarvam-105b', messages, reasoning_effort: null, response_format: responseFormat(kind), temperature: 0.3, max_tokens: kind === 'roadmap' ? 3600 : 1000 }),
  });
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) throw new ApiError(502, 'Vashu couldn’t finish that reply. Please try again.');
  return content;
}
