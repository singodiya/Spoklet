import { z } from 'zod';
const cefr = z.enum(['A1', 'A2', 'B1', 'B2', 'C1']);
const correctionSchema = z.object({ original: z.string().min(1).max(1000), corrected: z.string().min(1).max(1000), type: z.enum(['grammar', 'vocabulary', 'pronunciation', 'fluency', 'word_order']), explanation: z.string().min(1).max(1000) });
const assessmentSchema = z.object({ level: cefr, goal: z.string().min(3).max(1000), native_language: z.string().min(2).max(100), weaknesses: z.array(z.string().max(250)).min(1).max(6) });
const stageSchema = z.object({ stage_number: z.number().int().min(1).max(6), title: z.string().min(3).max(120), cefr_level: cefr, focus_skills: z.array(z.string().min(1).max(120)).min(1).max(5), description: z.string().min(20).max(1200) });
export const onboardingSchema = z.object({ done: z.boolean(), reply: z.string().min(1).max(2500), assessment: assessmentSchema.optional(), roadmap: z.array(stageSchema).length(6).optional() }).superRefine((value, ctx) => {
  if (value.done && (!value.assessment || !value.roadmap || value.roadmap.some((s, i) => s.stage_number !== i + 1))) ctx.addIssue({ code: 'custom', message: 'A complete assessment needs six ordered stages.' });
});
export type OnboardingResult = z.infer<typeof onboardingSchema>;
export function parseModelReply(raw: string, mode: 'onboarding' | 'practice') {
  const fallback = { reply: raw.trim().slice(0, 2500) || 'I’m here. Tell me a little more.', corrections: [] as z.infer<typeof correctionSchema>[], done: false, assessment: undefined as OnboardingResult['assessment'], roadmap: undefined as OnboardingResult['roadmap'] };
  let value: unknown;
  try { value = JSON.parse(raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')); } catch { return fallback; }
  if (mode === 'onboarding') {
    const result = onboardingSchema.safeParse(value);
    if (result.success) return { ...fallback, ...result.data, corrections: [] };
  } else {
    const result = z.object({ reply: z.string().min(1).max(2500), corrections: z.array(z.unknown()).default([]) }).safeParse(value);
    if (result.success) return { ...fallback, reply: result.data.reply, corrections: result.data.corrections.map(c => correctionSchema.safeParse(c)).flatMap(c => c.success ? [c.data] : []).slice(0, 2) };
  }
  // A readable reply still works even if the optional structured data is invalid.
  if (value && typeof value === 'object' && 'reply' in value && typeof value.reply === 'string' && value.reply.trim()) fallback.reply = value.reply.slice(0, 2500);
  return fallback;
}
export function canAssess(messages: { role: string; content: string }[]) {
  const turns = messages.filter(m => m.role === 'user' && m.content.trim());
  return turns.length >= 4;
}
export function parseSummary(raw: string) {
  try {
    return z.object({ summary: z.string().min(1).max(1800), score: z.number().min(0).max(100).nullable() }).parse(JSON.parse(raw));
  } catch { return { summary: 'You made time for a conversation. Revisit your transcript and corrections to keep building on it.', score: null }; }
}
