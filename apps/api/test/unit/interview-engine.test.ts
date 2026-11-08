import { describe, expect, it } from 'vitest';
import { buildMessages, MarkerStripper, stripMarkers } from '../../src/interview/engine';
import { planTopics, snapDuration, toProfile } from '../../src/interview/profile';
import { cleanText, sniff } from '../../src/interview/documents';
import { headlineFor } from '../../src/interview/evaluate';

/** Feed `text` in every possible pair of chunks: markers split anywhere must still be removed. */
function allSplits(text: string) {
  const outs = new Set<string>();
  for (let i = 0; i <= text.length; i++) {
    const s = new MarkerStripper();
    const out = s.push(text.slice(0, i)) + s.push(text.slice(i)) + s.finish();
    outs.add(JSON.stringify({ out, topic: s.topicId, ended: s.ended }));
  }
  return [...outs].map((o) => JSON.parse(o));
}

describe('marker stripping', () => {
  it('removes the topic tag and the end marker wherever the chunks break', () => {
    expect(allSplits('[[topic:t3]] How do you test an API? [[end]]')).toEqual([{ out: 'How do you test an API? ', topic: 't3', ended: true }]);
    expect(allSplits('[[topic:none]] Welcome to the interview.')).toEqual([{ out: 'Welcome to the interview.', topic: null, ended: false }]);
  });

  it('passes text without markers through unchanged', () => {
    expect(allSplits('Thank you. Next question?')).toEqual([{ out: 'Thank you. Next question?', topic: null, ended: false }]);
  });

  it('drops stray tags in the middle, and works on a whole reply', () => {
    expect(stripMarkers('[[topic:t1]] Good. [[topic:t2]] Now, teamwork? ')).toEqual({ text: 'Good.  Now, teamwork?', topicId: 't1', ended: false });
  });
});

describe('conversation window', () => {
  const opening = '[The candidate has joined.]';
  it('starts with the opening, alternates roles and puts the state note on the last answer', () => {
    const m = buildMessages({
      summary: null, opening, note: '[notes]',
      turns: [{ seq: 1, role: 'INTERVIEWER', text: 'Q1' }, { seq: 2, role: 'CANDIDATE', text: 'A1' }],
    });
    expect(m).toEqual([
      { role: 'user', content: opening },
      { role: 'assistant', content: 'Q1' },
      { role: 'user', content: 'A1\n\n[notes]' },
    ]);
  });

  it('after a summary the window starts at an interviewer turn, and the note is its own message after an interviewer turn', () => {
    const m = buildMessages({
      summary: 'They know SQL.', opening, note: '[notes]',
      turns: [{ seq: 9, role: 'CANDIDATE', text: 'old answer' }, { seq: 10, role: 'INTERVIEWER', text: 'Q6' }],
    });
    expect(m[0]!.content).toContain('They know SQL.');
    expect(m.map((x) => x.role)).toEqual(['user', 'assistant', 'user']);
    expect(m[2]!.content).toBe('[notes]');
  });
});

describe('job profile', () => {
  it('normalises what the model returns: ids, duplicates, lengths, a duration on offer', () => {
    const p = toProfile({
      position: '  ', organisation: 'MINEDUC', experience: '', responsibilities: ['Teach', 'Teach', ' '],
      qualifications: [], technicalSkills: ['A'.repeat(200)], behavioralCompetencies: ['Integrity'],
      topics: [], recommendedLevel: 'BEGINNER', recommendedKind: 'MIXED', recommendedDurationMinutes: 50,
    }, 'Headteacher');
    expect(p.position).toBe('Headteacher');
    expect(p.responsibilities).toEqual(['Teach']);
    expect(p.technicalSkills[0]).toHaveLength(80);
    expect(p.topics.map((t) => t.id)).toEqual(['t1', 't2']); // fallback topics
    expect(p.recommendedDurationMinutes).toBe(45);
    expect(snapDuration(10)).toBe(15);
  });

  it('plans topics by interview type, focus first, then priority', () => {
    const profile = toProfile({
      position: 'QA', organisation: '', experience: '', responsibilities: [], qualifications: [], technicalSkills: [], behavioralCompetencies: [],
      topics: [
        { name: 'Teamwork', kind: 'behavioral', priority: 'high' },
        { name: 'SQL', kind: 'technical', priority: 'low' },
        { name: 'Automation', kind: 'technical', priority: 'high' },
      ],
      recommendedLevel: 'INTERMEDIATE', recommendedKind: 'MIXED', recommendedDurationMinutes: 30,
    }, 'QA');
    expect(planTopics(profile, 'TECHNICAL').map((t) => t.name)).toEqual(['Automation', 'SQL']);
    expect(planTopics(profile, 'MIXED', ['sql']).map((t) => t.name)).toEqual(['SQL', 'Teamwork', 'Automation']);
    expect(planTopics(profile, 'BEHAVIORAL').map((t) => t.name)).toEqual(['Teamwork']);
  });
});

describe('documents', () => {
  it('recognises files by their bytes', () => {
    expect(sniff(Buffer.from('%PDF-1.7 ...'))).toBe('pdf');
    expect(sniff(Buffer.from([0x50, 0x4b, 0x03, 0x04, 1, 2]))).toBe('docx');
    expect(sniff(Buffer.from('Job title: Accountant\nDuties: ...'))).toBe('text');
    expect(sniff(Buffer.from([0x00, 0xff, 0x10]))).toBeNull();
  });
  it('cleans whitespace', () => {
    expect(cleanText('  A\t\tB \r\n\r\n\r\n\r\nC  ')).toBe('A B\n\nC');
  });
});

it('report headline follows the score', () => {
  expect([null, 90, 72, 60, 30].map(headlineFor)).toEqual(['Not enough to evaluate', 'Excellent', 'Good progress', 'Getting there', 'Keep practising']);
});
