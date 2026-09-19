import test from 'node:test';
import assert from 'node:assert/strict';
import { canAssess, parseModelReply, parseSummary } from '../lib/ai/parser';

test('malformed JSON becomes a spoken reply without corrections or assessment', () => {
  const result = parseModelReply('That sounds interesting. Tell me more!', 'onboarding');
  assert.equal(result.reply, 'That sounds interesting. Tell me more!'); assert.equal(result.done, false); assert.deepEqual(result.corrections, []);
});
test('a malformed roadmap cannot complete onboarding', () => {
  const result = parseModelReply(JSON.stringify({ done: true, reply: 'Let’s keep talking.', assessment: { level: 'B1', goal: 'Interviews', native_language: 'Hindi', weaknesses: ['past tense'] }, roadmap: [] }), 'onboarding');
  assert.equal(result.done, false); assert.equal(result.reply, 'Let’s keep talking.');
});
test('corrections are validated independently and capped at two', () => {
  const correction = { original: 'I go yesterday', corrected: 'I went yesterday', type: 'grammar', explanation: 'Use the past tense for yesterday.' };
  const result = parseModelReply(JSON.stringify({ reply: 'What happened next?', corrections: [{ wrong: true }, correction, correction, correction] }), 'practice');
  assert.equal(result.corrections.length, 2); assert.equal(result.reply, 'What happened next?');
});
test('fenced JSON is recovered, but invalid JSON never awards progress', () => {
  const result = parseModelReply('```json\n{"reply":"Hello!", "corrections":[]}\n```', 'practice');
  assert.equal(result.reply, 'Hello!'); assert.equal(result.done, false);
});
test('a provisional starter plan accepts four short replies, but never counts help responses', () => {
  assert.equal(canAssess(Array.from({ length: 4 }, () => ({ role: 'user', content: 'हाँ।' }))), true);
  assert.equal(canAssess(Array.from({ length: 4 }, () => ({ role: 'assistant', content: 'Here is an example.' }))), false);
  assert.equal(canAssess(Array.from({ length: 4 }, () => ({ role: 'user', content: '   ' }))), false);
  assert.equal(canAssess(Array.from({ length: 3 }, () => ({ role: 'user', content: 'I want to explain my work experience in interviews with confidence.' }))), false);
  assert.equal(canAssess(Array.from({ length: 4 }, () => ({ role: 'user', content: 'I want to explain my work experience in interviews with confidence.' }))), true);
});
test('failed summaries never invent a score', () => { assert.equal(parseSummary('not JSON').score, null); assert.equal(parseSummary('{"summary":"Good conversation", "score":500}').score, null); });
