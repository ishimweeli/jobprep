import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app';
import { ConsoleEmailProvider } from '../../src/services/email';
import { resetAndSeed, signedInAgent, testConfig, testPrisma } from '../helpers';

const prisma = testPrisma();
const mail = new ConsoleEmailProvider(() => {});
const app = createApp({ prisma, config: testConfig(), email: mail });

// These tests are about the real job-specific catalogue (MIFOTRA postings with closing dates), so they seed all of it;
// catalog.test.ts uses the small fixed catalogue so its counts stay put.
beforeAll(() => resetAndSeed(prisma, { full: true }));
afterAll(() => prisma.$disconnect());

describe('jobs: grouped catalog', () => {
  const jobs = async (qs = '') => (await request(app).get(`/api/countries/RW/jobs${qs}`)).body;
  const job = async (jobSlug: string) => request(app).get(`/api/countries/RW/jobs/${jobSlug}`);

  it('groups the catalog into one card per job, aggregating its mock tests', async () => {
    const body = await jobs('?pageSize=50');
    const bio = body.results.find((j: { jobSlug: string }) => j.jobSlug === 'rw-biostatistician');
    // 5 full mocks of 50 questions at 60 min + 1 psychometric mock at 90 min: non-uniform, so a range instead of one value.
    expect(bio).toMatchObject({
      jobName: 'Biostatistician', mockTestCount: 6, freeCount: 0,
      durationMinutes: null, durationRange: { min: 60, max: 90 },
    });
    expect(bio.jobDeadlineAt).not.toBeNull();
  });

  it('total counts distinct jobs, not mock tests, and every mock test is accounted for exactly once', async () => {
    const flat = await request(app).get('/api/countries/RW/mock-tests?pageSize=50');
    const grouped = await jobs('?pageSize=50');
    const distinctExams = await prisma.mockTest.groupBy({ by: ['examId'], where: { countryCode: 'RW', status: 'PUBLISHED' } });
    expect(grouped.total).toBe(distinctExams.length);
    expect(grouped.total).toBeLessThan(flat.body.total);
    const mockTestsAccounted = grouped.results.reduce((n: number, j: { mockTestCount: number }) => n + j.mockTestCount, 0);
    expect(mockTestsAccounted).toBe(flat.body.total);
  });

  it('facets match the flat catalog (they describe mock tests, not jobs)', async () => {
    const flat = await request(app).get('/api/countries/RW/mock-tests');
    const grouped = await jobs();
    expect(grouped.facets).toEqual(flat.body.facets);
  });

  it('sort=deadline only returns jobs with a deadline, soonest first', async () => {
    const body = await jobs('?sort=deadline&pageSize=50');
    expect(body.total).toBeGreaterThan(0);
    for (const j of body.results) expect(j.jobDeadlineAt).not.toBeNull();
    const dates = body.results.map((j: { jobDeadlineAt: string }) => new Date(j.jobDeadlineAt).getTime());
    expect(dates).toEqual([...dates].sort((a, b) => a - b));
  });

  it('paginates independently of the flat catalog', async () => {
    const p1 = await jobs('?pageSize=2&page=1&sort=title');
    expect(p1.results).toHaveLength(2);
    expect(p1.hasMore).toBe(true);
  });

  it('a job page lists every published mock test under it with its own access state', async () => {
    const res = await job('rw-cpd-coordination-officer');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      exam: { slug: 'rw-cpd-coordination-officer', name: 'CPD Coordination Officer' },
      freeCount: 0, totalMockTests: 5,
    });
    expect(res.body.mockTests).toHaveLength(5);
    for (const m of res.body.mockTests) {
      expect(m.access).toMatchObject({ state: 'LOCKED', canStart: false, needsFullAccess: true });
    }
  });

  it('a signed-in user’s grant unlocks every mock test under the job, not just one', async () => {
    const { agent, userId } = await signedInAgent(app, mail, 'jobs.one@example.com');
    const plan = await prisma.planConfig.findFirstOrThrow({ where: { countryCode: 'RW' } });
    await prisma.accessGrant.create({
      data: { userId, countryCode: 'RW', planId: plan.id, startsAt: new Date(Date.now() - 86_400_000), endsAt: new Date(Date.now() + 10 * 86_400_000), source: 'MANUAL', reason: 'test' },
    });
    const res = await agent.get('/api/countries/RW/jobs/rw-cpd-coordination-officer');
    for (const m of res.body.mockTests) expect(m.access).toMatchObject({ state: 'GRANTED', canStart: true });
  });

  it('404s for an unknown job slug, and for a job with no mock tests in this country', async () => {
    expect((await job('does-not-exist')).body.error).toBe('job_not_found');
    // ke-accountant exists, but has no RW mock tests.
    expect((await job('ke-accountant')).body.error).toBe('job_not_found');
  });
});
