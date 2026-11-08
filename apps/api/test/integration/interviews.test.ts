import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app';
import { FakeLlmProvider, type LlmRequest } from '../../src/interview/llm';
import { FakeSttProvider } from '../../src/interview/stt';
import { sweepInterviews } from '../../src/interview/sessions';
import { createDataCipher } from '../../src/services/crypto';
import { ConsoleEmailProvider } from '../../src/services/email';
import { resetAndSeed, signedInAgent, testConfig, testPrisma } from '../helpers';

const prisma = testPrisma();
const mail = new ConsoleEmailProvider(() => {});
const config = testConfig({ INTERVIEW_PREP_ENABLED: 'true' });
const llm = new FakeLlmProvider();
const stt = new FakeSttProvider();
let clock = new Date('2026-11-08T09:00:00Z');
const app = createApp({ prisma, config, email: mail, llm, stt, now: () => clock });
const appOff = createApp({ prisma, config: testConfig(), email: mail, now: () => clock });
const advance = (secs: number) => { clock = new Date(clock.getTime() + secs * 1000); };
const ictx = { prisma, config, llm, stt, cipher: createDataCipher(config), now: () => clock };

const JD = `Software QA Engineer at Kigali Tech Ltd. We need 3+ years in software testing. Responsibilities: design automated
tests with Playwright and Java, validate APIs and databases with SQL, manage defects. Competencies: communication, teamwork.`;

const PROFILE = {
  position: 'Software QA Engineer', organisation: 'Kigali Tech Ltd', experience: '3+ years in software testing',
  responsibilities: ['Design automated tests', 'Validate APIs and databases'], qualifications: ['Degree in IT'],
  technicalSkills: ['Java', 'SQL', 'Playwright', 'API testing'], behavioralCompetencies: ['Communication', 'Teamwork'],
  topics: [
    { name: 'Test automation', kind: 'technical', priority: 'high' },
    { name: 'Database validation', kind: 'technical', priority: 'high' },
    { name: 'Teamwork', kind: 'behavioral', priority: 'medium' },
  ],
  recommendedLevel: 'INTERMEDIATE', recommendedKind: 'MIXED', recommendedDurationMinutes: 28,
};
const EVALUATION = {
  rubric: { technical_knowledge: 80, problem_solving: 70, communication: 90, answer_structure: 60, practical_examples: 50 },
  topicScores: [{ topicId: 't1', score: 75 }, { topicId: 't2', score: 45 }, { topicId: 'zz', score: 99 }],
  strengths: ['Clear explanation of Playwright fixtures'],
  improvements: [{ title: 'Database validation', detail: 'You did not describe how to compare stored records with the API response.' }],
  questions: [{ question: 'How do you validate an API?', answer: 'I check the status code.', competencies: ['API testing'], score: 45, verdict: 'Partially correct', missing: ['Database queries'], improvedAnswer: 'I would query the database...' }],
  plan: [{ topic: 'Database validation', priority: 'high', score: 45, practiceQuestions: 4 }, { topic: 'Teamwork', priority: 'low', score: 85, practiceQuestions: 9 }],
  comparison: 'Your database answers improved.',
};

function script(req: LlmRequest): string {
  if (req.purpose === 'extract') return JSON.stringify(PROFILE);
  if (req.purpose === 'evaluate') return JSON.stringify(EVALUATION);
  if (req.purpose === 'summary') return 'Notes so far.';
  const last = req.messages[req.messages.length - 1]!.content;
  if (/TIME IS UP|about one minute left/.test(last)) return '[[topic:none]] Thank you for your time. Your report will be ready shortly. [[end]]';
  if (/The candidate has joined/.test(last)) return '[[topic:none]] Welcome! I am your interviewer today. Could you briefly introduce yourself?';
  return '[[topic:t2]] You mentioned APIs. How would you check that the data was stored correctly in the database?';
}

let seq = 900000;
type Agent = ReturnType<typeof request.agent>;
const newUser = async () => signedInAgent(app, mail, `iv${seq++}@example.com`);

/** Parse a text/event-stream body into its events. */
function events(text: string): { event: string; data: Record<string, unknown> }[] {
  return text.split('\n\n').filter((f) => f.trim()).map((f) => {
    const event = /^event: (.*)$/m.exec(f)?.[1] ?? 'message';
    const data = JSON.parse(/^data: (.*)$/m.exec(f)?.[1] ?? '{}');
    return { event, data };
  });
}
const spoken = (evs: ReturnType<typeof events>) => evs.filter((e) => e.event === 'delta').map((e) => e.data.text).join('');

async function newJob(agent: Agent) {
  const res = await agent.post('/api/interviews/jobs').send({ text: JD });
  expect(res.status).toBe(201);
  return res.body;
}
async function startedSession(agent: Agent, over: object = {}) {
  const job = await newJob(agent);
  const s = await agent.post('/api/interviews/sessions').send({ jobId: job.id, durationMinutes: 15, ...over });
  expect(s.status).toBe(201);
  const start = await agent.post(`/api/interviews/sessions/${s.body.id}/start`);
  expect(start.status).toBe(200);
  return { job, id: s.body.id as string, start: events(start.text) };
}
async function waitForStatus(id: string, status: string) {
  for (let i = 0; i < 50; i++) {
    const s = await prisma.interviewSession.findUniqueOrThrow({ where: { id } });
    if (s.status === status) return s;
    await new Promise((r) => setTimeout(r, 40));
  }
  throw new Error(`session ${id} never reached ${status}`);
}
const answer = (agent: Agent, id: string, text: string) => agent.post(`/api/interviews/sessions/${id}/turns`).send({ text });

beforeAll(() => resetAndSeed(prisma));
beforeEach(() => { clock = new Date('2026-11-08T09:00:00Z'); llm.handler = script; stt.nextText = null; stt.fail = false; });
afterAll(() => prisma.$disconnect());

describe('interview prep: access', () => {
  it('does not exist while switched off, and needs a session', async () => {
    const { agent } = await signedInAgent(appOff, mail, `iv${seq++}@example.com`);
    expect((await agent.get('/api/interviews/overview')).status).toBe(404);
    expect((await request(app).get('/api/interviews/overview')).status).toBe(401);
  });

  it('the first visit gives the 5-minute trial once', async () => {
    const { agent } = await newUser();
    const a = (await agent.get('/api/interviews/overview')).body;
    expect(a.wallet).toMatchObject({ remainingSeconds: 300, totalSeconds: 300, usedSeconds: 0, hasPackage: false, trialRemainingSeconds: 300 });
    expect(a.stats).toEqual({ interviews: 0, averageScore: null, improvement: null });
    expect((await agent.get('/api/interviews/overview')).body.wallet.remainingSeconds).toBe(300);
  });

  it('other people cannot see or touch someone else’s jobs and interviews', async () => {
    const a = await newUser();
    const b = await newUser();
    const { id, job } = await startedSession(a.agent);
    expect((await b.agent.get(`/api/interviews/sessions/${id}`)).status).toBe(404);
    expect((await b.agent.get(`/api/interviews/jobs/${job.id}`)).status).toBe(404);
    expect((await answer(b.agent, id, 'hi')).status).toBe(404);
  });
});

describe('job descriptions', () => {
  it('a pasted description is analysed into an editable profile and stored encrypted', async () => {
    const { agent, userId } = await newUser();
    const job = await newJob(agent);
    expect(job.title).toBe('Software QA Engineer');
    expect(job.profile.topics.map((t: { id: string }) => t.id)).toEqual(['t1', 't2', 't3']);
    expect(job.profile.recommendedDurationMinutes).toBe(30); // snapped to an offered length
    const row = await prisma.interviewJob.findFirstOrThrow({ where: { userId } });
    expect(row.textEnc).not.toContain('Playwright');
    const extract = llm.calls.filter((c) => c.purpose === 'extract').at(-1)!;
    expect(extract.messages[0]!.content).toContain('Playwright');

    const edited = { ...job.profile, position: 'Senior QA Engineer', technicalSkills: ['Java', 'Cypress'] };
    const res = await agent.patch(`/api/interviews/jobs/${job.id}`).send({ profile: edited });
    expect(res.body).toMatchObject({ title: 'Senior QA Engineer', profile: { technicalSkills: ['Java', 'Cypress'] } });
    expect((await agent.patch(`/api/interviews/jobs/${job.id}`).send({ profile: { ...edited, topics: [] } })).status).toBe(400);
  });

  it('refuses text too short to be a job description, and unreadable uploads', async () => {
    const { agent } = await newUser();
    expect((await agent.post('/api/interviews/jobs').send({ text: 'Accountant' })).body.error).toBe('jd_too_short');
    const garbage = Buffer.from([0x00, 0x01, 0x02, 0xff, 0x00, 0x10]);
    expect((await agent.post('/api/interviews/jobs/upload').set('Content-Type', 'application/octet-stream').send(garbage)).body.error).toBe('jd_unreadable');
  });

  it('a text file upload is read; the file name becomes the title', async () => {
    const { agent } = await newUser();
    const res = await agent.post('/api/interviews/jobs/upload').set('Content-Type', 'text/plain').set('X-File-Name', encodeURIComponent('QA engineer advert.txt')).send(Buffer.from(JD));
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ source: 'UPLOAD', title: 'QA engineer advert', fileName: 'QA engineer advert.txt' });
  });

  it('a JobPrep job is a starting point too (its name and institution are sent for analysis)', async () => {
    const { agent } = await newUser();
    const exam = await prisma.exam.findFirstOrThrow({ where: { profession: { category: { countryCode: 'RW' } }, mockTests: { some: { status: 'PUBLISHED' } } } });
    const res = await agent.post('/api/interviews/jobs/from-exam').send({ examSlug: exam.slug });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ source: 'JOBPREP', examId: exam.id, title: exam.name });
    expect(llm.calls.at(-1)!.messages[0]!.content).toContain(`Job title: ${exam.name}`);
    expect((await agent.post('/api/interviews/jobs/from-exam').send({ examSlug: 'nope' })).status).toBe(404);
  });
});

describe('the live interview', () => {
  it('start streams the welcome without the markers; answers stream the next question', async () => {
    const { agent } = await newUser();
    const { id, start } = await startedSession(agent);
    expect(spoken(start)).toBe('Welcome! I am your interviewer today. Could you briefly introduce yourself?');
    expect(start.at(-1)).toMatchObject({ event: 'done', data: { ended: false } });
    expect(llm.calls.at(-1)!.system).toContain('Position: Software QA Engineer');
    expect(llm.calls.at(-1)!.effort).toBe('low');

    advance(20);
    const r = events((await answer(agent, id, 'I have three years in QA with Playwright and API testing.')).text);
    expect(r[0]).toMatchObject({ event: 'transcript', data: { text: 'I have three years in QA with Playwright and API testing.' } });
    expect(spoken(r)).toContain('How would you check that the data was stored correctly');
    expect(spoken(r)).not.toContain('[[');
    expect(r.at(-1)!.data).toMatchObject({ ended: false, activeSeconds: 20, remainingSeconds: 280 });

    const last = llm.calls.at(-1)!.messages;
    expect(last[last.length - 1]!.content).toContain('[Interviewer notes: 0 of 15 minutes used');
    const view = (await agent.get(`/api/interviews/sessions/${id}`)).body;
    expect(view.transcript.map((t: { role: string }) => t.role)).toEqual(['INTERVIEWER', 'CANDIDATE', 'INTERVIEWER']);
    expect(view.topics.find((t: { id: string }) => t.id === 't2').covered).toBe(true);
    const rows = await prisma.interviewTurn.findMany({ where: { sessionId: id } });
    expect(rows.every((t) => !t.textEnc.includes('Playwright'))).toBe(true);
  });

  it('spoken answers are transcribed (the audio is not kept); an empty transcription asks again', async () => {
    const { agent } = await newUser();
    const { id } = await startedSession(agent);
    stt.nextText = 'I compare the API response with a SQL query on the table.';
    const r = events((await agent.post(`/api/interviews/sessions/${id}/turns`).set('Content-Type', 'audio/webm;codecs=opus').send(Buffer.alloc(16000, 1))).text);
    expect(r[0]!.data.text).toBe('I compare the API response with a SQL query on the table.');
    expect(stt.calls.at(-1)).toMatchObject({ bytes: 16000, mime: 'audio/webm;codecs=opus' });
    stt.nextText = '   ';
    const again = events((await agent.post(`/api/interviews/sessions/${id}/turns`).set('Content-Type', 'audio/webm').send(Buffer.alloc(800, 1))).text);
    expect(again.at(-1)!.data).toMatchObject({ unclear: true });
    expect(await prisma.interviewTurn.count({ where: { sessionId: id } })).toBe(3);
    expect((await prisma.interviewSession.findUniqueOrThrow({ where: { id } })).sttSeconds).toBeGreaterThan(0);
  });

  it('charges only active time: a long silence counts at most 45 s and a pause counts nothing', async () => {
    const { agent, userId } = await newUser();
    const { id } = await startedSession(agent);
    advance(15);
    expect((await agent.post(`/api/interviews/sessions/${id}/beat`)).body).toMatchObject({ activeSeconds: 15, remainingSeconds: 285 });
    advance(600); // the connection dropped for 10 minutes
    expect((await agent.post(`/api/interviews/sessions/${id}/beat`)).body.activeSeconds).toBe(60);
    expect((await agent.post(`/api/interviews/sessions/${id}/pause`)).body.status).toBe('PAUSED');
    advance(300);
    expect((await answer(agent, id, 'hello')).body.error).toBe('interview_not_active');
    await agent.post(`/api/interviews/sessions/${id}/resume`);
    advance(10);
    expect((await agent.post(`/api/interviews/sessions/${id}/beat`)).body.activeSeconds).toBe(70);
    const debits = await prisma.minuteDebit.findMany({ where: { sessionId: id } });
    expect(debits.reduce((s, d) => s + d.seconds, 0)).toBe(70);
    expect((await agent.get('/api/interviews/overview')).body.wallet).toMatchObject({ remainingSeconds: 230, usedSeconds: 70 });
    expect(await prisma.minuteBucket.count({ where: { userId } })).toBe(1);
  });

  it('with about a minute of balance left the interviewer closes; at zero the interview stops; then no new one starts', async () => {
    const { agent } = await newUser();
    const { id } = await startedSession(agent);
    for (let i = 0; i < 6; i++) { advance(42); await agent.post(`/api/interviews/sessions/${id}/beat`); }
    advance(20);
    const r = events((await answer(agent, id, 'One more thing about testing.')).text);
    expect(spoken(r)).toContain('Thank you for your time');
    expect(r.at(-1)!.data).toMatchObject({ ended: true, wrapUp: true, remainingSeconds: 28 });
    expect((await agent.post(`/api/interviews/sessions/${id}/beat`)).body.status).not.toBe('ACTIVE');
    // 28 seconds left: not enough to start another interview.
    const jobId = (await prisma.interviewSession.findUniqueOrThrow({ where: { id } })).jobId;
    const next = await agent.post('/api/interviews/sessions').send({ jobId, durationMinutes: 15 });
    expect((await agent.post(`/api/interviews/sessions/${next.body.id}/start`)).body).toMatchObject({ error: 'insufficient_minutes', remainingSeconds: 28 });
  });

  it('a running interview stops when the balance reaches zero', async () => {
    const { agent } = await newUser();
    const { id } = await startedSession(agent);
    for (let i = 0; i < 7; i++) { advance(42); await agent.post(`/api/interviews/sessions/${id}/beat`); }
    advance(45);
    expect((await agent.post(`/api/interviews/sessions/${id}/beat`)).body).toMatchObject({ status: 'ENDED', remainingSeconds: 0, timeUp: true });
    expect((await prisma.interviewSession.findUniqueOrThrow({ where: { id } })).endReason).toBe('out_of_minutes');
    expect((await answer(agent, id, 'still there?')).body.error).toBe('interview_not_active');
  });

  it('a second start, or an answer to an interview that is not running, is refused', async () => {
    const { agent } = await newUser();
    const { id } = await startedSession(agent);
    expect((await agent.post(`/api/interviews/sessions/${id}/start`)).status).toBe(409);
    await agent.post(`/api/interviews/sessions/${id}/end`);
    expect((await answer(agent, id, 'late')).body.error).toBe('interview_not_active');
  });
});

describe('evaluation, history and practice', () => {
  async function interviewed(agent: Agent) {
    const { id, job } = await startedSession(agent);
    for (const a of ['I have three years in QA.', 'I check the status code of the API.', 'I work closely with developers.']) {
      advance(30);
      await answer(agent, id, a);
    }
    const ended = await agent.post(`/api/interviews/sessions/${id}/end`);
    expect(ended.body.status).toBe('ENDED');
    await waitForStatus(id, 'EVALUATED');
    return { id, job };
  }

  it('ending scores the interview: overall = mean of the rubric, per-question feedback, encrypted at rest', async () => {
    const { agent } = await newUser();
    const { id } = await interviewed(agent);
    const v = (await agent.get(`/api/interviews/sessions/${id}`)).body;
    expect(v.overallScore).toBe(70); // (80 + 70 + 90 + 60 + 50) / 5
    expect(v.report).toMatchObject({ insufficient: false, headline: 'Good progress', strengths: ['Clear explanation of Playwright fixtures'] });
    expect(v.report.rubric.map((r: { label: string }) => r.label)).toEqual(['Technical knowledge', 'Problem-solving', 'Communication', 'Answer structure', 'Practical examples']);
    expect(v.report.topics).toEqual([
      { key: 'topic:test automation', label: 'Test automation', score: 75, change: null },
      { key: 'topic:database validation', label: 'Database validation', score: 45, change: null },
    ]); // the unknown topic id is dropped
    expect(v.report.questions[0]).toMatchObject({ score: 45, verdict: 'Partially correct', missing: ['Database queries'] });
    expect(v.report.plan[1].practiceQuestions).toBe(5); // clamped
    expect(v.report.comparison).toBe(''); // nothing to compare with
    const row = await prisma.interviewSession.findUniqueOrThrow({ where: { id } });
    expect(row.reportEnc).not.toContain('Playwright');
    expect(await prisma.interviewScore.count({ where: { sessionId: id } })).toBe(7);
    const evalCall = llm.calls.filter((c) => c.purpose === 'evaluate').at(-1)!;
    expect(evalCall.messages[0]!.content).toContain('Interviewer [t2]: You mentioned APIs.');
    expect(evalCall.messages[0]!.content).toContain('Candidate: I check the status code of the API.');
  });

  it('an interview with fewer than two real answers is not scored', async () => {
    const { agent } = await newUser();
    const { id } = await startedSession(agent);
    await agent.post(`/api/interviews/sessions/${id}/end`);
    const s = await waitForStatus(id, 'EVALUATED');
    expect(s.overallScore).toBeNull();
    expect((await agent.get(`/api/interviews/sessions/${id}`)).body.report).toMatchObject({ insufficient: true, headline: 'Not enough to evaluate' });
  });

  it('practising weak areas focuses the next interview and compares the scores', async () => {
    const { agent } = await newUser();
    const { id } = await interviewed(agent);
    const practice = await agent.post(`/api/interviews/sessions/${id}/practice`).send({ durationMinutes: 10 });
    expect(practice.status).toBe(201);
    expect(practice.body).toMatchObject({ previousSessionId: id, mode: 'PRACTICE', focus: ['Database validation'], durationMinutes: 10 });
    expect(practice.body.topics[0].name).toBe('Database validation');

    EVALUATION.rubric.practical_examples = 70;
    try {
      await agent.post(`/api/interviews/sessions/${practice.body.id}/start`);
      expect(llm.calls.at(-1)!.system).toContain('In the previous interview the candidate was weak on');
      expect(llm.calls.at(-1)!.system).toContain('practice interview: after each answer you may give ONE short coaching remark');
      for (const a of ['I would query the table.', 'Then compare each field.']) { advance(20); await answer(agent, practice.body.id, a); }
      await agent.post(`/api/interviews/sessions/${practice.body.id}/end`);
      await waitForStatus(practice.body.id, 'EVALUATED');
    } finally {
      EVALUATION.rubric.practical_examples = 50;
    }
    const v = (await agent.get(`/api/interviews/sessions/${practice.body.id}`)).body;
    expect(v.report.rubric.find((r: { key: string }) => r.key === 'practical_examples').change).toBe(20);
    expect(v.report.comparison).toBe('Your database answers improved.');
    expect(v.report.previous).toEqual({ sessionId: id, overallScore: 70 });
    const o = (await agent.get('/api/interviews/overview')).body;
    expect(o.stats).toEqual({ interviews: 2, averageScore: 72, improvement: 4 });
    expect(o.improvementPlan.items[0].topic).toBe('Database validation');
  });

  it('deleting an interview removes the transcript and report but keeps the charged time on record', async () => {
    const { agent, userId } = await newUser();
    const { id } = await interviewed(agent);
    const charged = (await prisma.minuteDebit.findMany({ where: { sessionId: id } })).reduce((s, d) => s + d.seconds, 0);
    expect(charged).toBe(90);
    expect((await agent.delete(`/api/interviews/sessions/${id}`)).status).toBe(204);
    expect(await prisma.interviewTurn.count({ where: { sessionId: id } })).toBe(0);
    expect((await prisma.minuteDebit.findMany({ where: { userId } })).reduce((s, d) => s + d.seconds, 0)).toBe(90);
    expect((await agent.get('/api/interviews/overview')).body.wallet.remainingSeconds).toBe(210);
  });

  it('the sweeper ends an interview whose browser went away, and evaluates it', async () => {
    const { agent } = await newUser();
    const { id } = await startedSession(agent);
    advance(30);
    await answer(agent, id, 'First answer about test automation.');
    advance(30);
    await answer(agent, id, 'Second answer about the database.');
    advance(200);
    await sweepInterviews(ictx);
    const s = await waitForStatus(id, 'EVALUATED');
    expect(s.endReason).toBe('disconnected');
    expect(s.activeSeconds).toBe(60); // the silent 200 s were not charged
  });
});
