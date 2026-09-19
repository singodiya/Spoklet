import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
const alice = '00000000-0000-4000-8000-000000000001';
const bob = '00000000-0000-4000-8000-000000000002';

test('Postgres: trigger, atomic onboarding, RLS, idempotency, leases, progression and UTC streak', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls; create schema auth;
      create table auth.users(id uuid primary key, raw_user_meta_data jsonb);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema auth to authenticated, anon; grant execute on function auth.uid() to authenticated, anon;`);
    // Someone may sign in with Google before the application schema is installed.
    // Installing it must backfill that existing account as well as handle new signups.
    await db.query('insert into auth.users(id,raw_user_meta_data) values($1,$2)', ['00000000-0000-4000-8000-000000000003', { full_name: 'Existing learner' }]);
    const schema = (await fs.readFile('supabase/schema.sql', 'utf8')).replace('create extension if not exists pgcrypto;', '-- gen_random_uuid is built into this PostgreSQL runtime.');
    await db.exec(schema);
    await db.query('insert into auth.users(id,raw_user_meta_data) values($1,$2),($3,$4)', [alice, { full_name: 'Alice' }, bob, { full_name: 'Bob' }]);
    const profiles = await db.query<{ full_name: string }>('select full_name from public.profiles order by full_name');
    assert.deepEqual(profiles.rows.map(p => p.full_name), ['Alice','Bob','Existing learner']);
    async function scalar<T>(query: string, params: unknown[]) { return (await db.query<{ result: T }>(query, params)).rows[0].result; }
    const onboarding = await scalar<string>('select public.start_session($1,$2) as result', [alice, 'onboarding']);
    assert.equal(await scalar('select public.start_session($1,$2) as result', [alice, 'onboarding']), onboarding);
    await assert.rejects(() => scalar('select public.start_session($1,$2) as result', [alice, 'practice']));
    const roadmap = Array.from({ length: 6 }, (_, i) => ({ stage_number: i + 1, title: `Interview confidence ${i + 1}`, cefr_level: 'B1', focus_skills: ['past tense', 'clear examples'], description: 'Explain a past project using clear examples to build confidence for interviews.' }));
    // Hindi explanations and example buttons save assistant replies, not invented learner turns.
    for (let i = 0; i < 4; i++) {
      const requestId = crypto.randomUUID();
      await scalar('select public.claim_session($1,$2,$3) as result', [alice, onboarding, requestId]);
      await scalar('select public.save_chat_turn($1,$2,$3,$4,$5) as result', [alice, onboarding, requestId, '', { reply: 'यह एक छोटा example है।', corrections: [], done: false }]);
    }
    assert.equal(await scalar("select count(*)::int as result from public.messages where session_id=$1 and role='user'", [onboarding]), 0);
    assert.equal(await scalar('select onboarding_complete as result from public.profiles where id=$1', [alice]), false);
    for (let i = 0; i < 4; i++) {
      const requestId = crypto.randomUUID();
      await scalar('select public.claim_session($1,$2,$3) as result', [alice, onboarding, requestId]);
      await assert.rejects(() => scalar('select public.claim_session($1,$2,$3) as result', [alice, onboarding, crypto.randomUUID()]), /busy/);
      await assert.rejects(() => scalar('select public.claim_session($1,$2,$3) as result', [bob, onboarding, crypto.randomUUID()]));
      const result = { reply: 'Tell me about the next step.', corrections: [], done: i === 3, ...(i === 3 ? { assessment: { level: 'B1', goal: 'Interview confidence', native_language: 'Hindi', weaknesses: ['past tense'] }, roadmap } : {}) };
      const saved = await scalar<{ messageId: string }>('select public.save_chat_turn($1,$2,$3,$4,$5) as result', [alice, onboarding, requestId, ['काम के लिए।', 'हिंदी।', 'I work.', 'I drink tea.'][i], result]);
      const replay = await scalar<{ cached: boolean; response: { messageId: string } }>('select public.claim_session($1,$2,$3) as result', [alice, onboarding, requestId]);
      assert.equal(replay.cached, true); assert.equal(replay.response.messageId, saved.messageId);
    }
    assert.equal(await scalar('select count(*)::int as result from public.roadmap_stages where user_id=$1', [alice]), 6);
    assert.equal(await scalar('select onboarding_complete as result from public.profiles where id=$1', [alice]), true);
    async function practice(turns: number) {
      const id = await scalar<string>('select public.start_session($1,$2) as result', [alice, 'practice']);
      for (let i = 0; i < turns; i++) {
        const rid = crypto.randomUUID(); await scalar('select public.claim_session($1,$2,$3) as result', [alice,id,rid]);
        await scalar('select public.save_chat_turn($1,$2,$3,$4,$5) as result', [alice,id,rid,'Yesterday I go to work.',{ done: false, reply: 'You went to work. How was it?', corrections: [{ original: 'I go', corrected: 'I went', type: 'grammar', explanation: 'Past tense.' }] }]);
      }
      const rid = crypto.randomUUID(); await scalar('select public.claim_session($1,$2,$3) as result', [alice,id,rid]);
      const result = await scalar<{ counted: boolean }>('select public.finish_session($1,$2,$3,$4,$5) as result', [alice,id,rid,'Practiced describing yesterday.',75]);
      await scalar('select public.finish_session($1,$2,$3,$4,$5) as result', [alice,id,rid,'Must not replace first summary.',99]);
      return { id, ...result };
    }
    assert.equal((await practice(2)).counted, false);
    assert.equal(await scalar('select total_sessions as result from public.profiles where id=$1',[alice]), 0);
    for (let i=0;i<3;i++) assert.equal((await practice(4)).counted, true);
    const progress = (await db.query<{ total_sessions:number; streak_count:number; current_stage_number:number }>('select total_sessions,streak_count,current_stage_number from public.profiles where id=$1',[alice])).rows[0];
    assert.deepEqual(progress, { total_sessions:3, streak_count:1, current_stage_number:2 });
    assert.equal(await scalar('select count(*)::int as result from public.roadmap_stages where user_id=$1 and status=$2',[alice,'active']),1);
    // Yesterday extends the streak; a gap resets it. UTC dates are deliberate.
    await db.query("update public.profiles set last_active_at=now()-interval '1 day' where id=$1",[alice]); await practice(4);
    assert.equal(await scalar('select streak_count as result from public.profiles where id=$1',[alice]),2);
    await db.query("update public.profiles set last_active_at=now()-interval '3 days' where id=$1",[alice]); await practice(4);
    assert.equal(await scalar('select streak_count as result from public.profiles where id=$1',[alice]),1);
    assert.equal(await scalar('select public.consume_api_quota($1,$2,$3) as result',[alice,'test',1]),true);
    assert.equal(await scalar('select public.consume_api_quota($1,$2,$3) as result',[alice,'test',1]),false);
    await db.exec(`set role authenticated; set request.jwt.claim.sub='${bob}';`);
    assert.equal(await scalar('select count(*)::int as result from public.profiles',[]),1);
    assert.equal(await scalar('select count(*)::int as result from public.messages',[]),0);
    assert.equal(await scalar('select count(*)::int as result from public.mistakes',[]),0);
    assert.equal(await scalar('select count(*)::int as result from public.roadmap_stages',[]),0);
    assert.equal(await scalar('select count(*)::int as result from public.conversation_sessions',[]),0);
    await assert.rejects(() => db.query('update public.profiles set total_sessions=100 where id=$1',[bob]), /permission denied/);
    await assert.rejects(() => scalar('select public.start_session($1,$2) as result',[bob,'onboarding']), /permission denied/);
    await db.query('update public.profiles set preferred_voice=$1 where id=$2',['priya',bob]);
    assert.equal(await scalar('select preferred_voice as result from public.profiles where id=$1',[bob]),'priya');
    await db.exec('reset role;');
    const aliceSession = await scalar<string>('select public.start_session($1,$2) as result',[alice,'practice']);
    await assert.rejects(() => db.query('insert into public.messages(session_id,user_id,role,content,request_id) values($1,$2,$3,$4,$5)',[aliceSession,bob,'user','forged message',crypto.randomUUID()]), /foreign key/);
  } finally { await db.close(); }
});
