export type ReplyKind = 'onboarding' | 'roadmap' | 'practice' | 'summary';
const text = (minLength = 1, maxLength = 2500) => ({ type: 'string', minLength, maxLength });
const object = (properties: Record<string, unknown>) => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
const array = (items: unknown, minItems: number, maxItems: number) => ({ type: 'array', items, minItems, maxItems });
const level = { type: 'string', enum: ['A1', 'A2', 'B1', 'B2', 'C1'] };
const roadmap = object({
  done: { type: 'boolean', enum: [true] }, reply: text(),
  assessment: object({ level, goal: text(3, 1000), native_language: text(2, 100), weaknesses: array(text(1, 250), 1, 6) }),
  roadmap: array(object({ stage_number: { type: 'integer', minimum: 1, maximum: 6 }, title: text(3, 120), cefr_level: level, focus_skills: array(text(1, 120), 1, 5), description: text(20, 1200) }), 6, 6),
});
const formats = {
  onboarding: object({ done: { type: 'boolean', enum: [false] }, reply: text() }),
  roadmap,
  practice: object({ reply: text(), corrections: array(object({ original: text(1, 1000), corrected: text(1, 1000), type: { type: 'string', enum: ['grammar', 'vocabulary', 'fluency', 'word_order'] }, explanation: text(1, 1000) }), 0, 2) }),
  summary: object({ summary: text(1, 1800), score: { type: ['number', 'null'], minimum: 0, maximum: 100 } }),
};
export function responseFormat(kind: ReplyKind) {
  return { type: 'json_schema', json_schema: { name: `vashu_${kind}`, strict: true, schema: formats[kind] } };
}
