import { api, apiStream, apiUpload, type StreamEvent } from './client';

/** AI interview preparation (/api/interviews). Signed-in only; 404 while the feature is switched off. */

export type InterviewMode = 'REAL' | 'PRACTICE';
export type InterviewKind = 'MIXED' | 'TECHNICAL' | 'BEHAVIORAL';
export type InterviewLevel = 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED';
export type InterviewStatus = 'READY' | 'ACTIVE' | 'PAUSED' | 'ENDED' | 'EVALUATED' | 'FAILED';

export interface InterviewTopic { id: string; name: string; kind: 'technical' | 'behavioral'; priority: 'high' | 'medium' | 'low' }

export interface JobProfile {
  position: string;
  organisation: string;
  experience: string;
  responsibilities: string[];
  qualifications: string[];
  technicalSkills: string[];
  behavioralCompetencies: string[];
  topics: InterviewTopic[];
  recommendedLevel: InterviewLevel;
  recommendedKind: InterviewKind;
  recommendedDurationMinutes: number;
}

export interface InterviewJob {
  id: string;
  title: string;
  source: 'PASTE' | 'UPLOAD' | 'JOBPREP';
  examId: string | null;
  fileName: string | null;
  profile: JobProfile;
  createdAt: string;
}

export interface SessionSummary {
  id: string;
  title: string;
  status: InterviewStatus;
  mode: InterviewMode;
  durationMinutes: number;
  activeSeconds: number;
  overallScore: number | null;
  createdAt: string;
  previousSessionId?: string | null;
}

export interface PlanItem { topic: string; priority: 'high' | 'medium' | 'low'; score: number; practiceQuestions: number }

export interface InterviewOverview {
  wallet: {
    remainingSeconds: number;
    totalSeconds: number;
    usedSeconds: number;
    hasPackage: boolean;
    packageExpiresAt: string | null;
    trialRemainingSeconds: number;
  };
  stats: { interviews: number; averageScore: number | null; improvement: number | null };
  inProgress: string | null;
  recent: SessionSummary[];
  improvementPlan: null | { sessionId: string; jobTitle: string; items: PlanItem[] };
}

export interface ScoreLine { key: string; label: string; score: number; change: number | null }

export interface InterviewReport {
  version: 1;
  insufficient: boolean;
  overallScore: number | null;
  headline: string;
  rubric: ScoreLine[];
  topics: ScoreLine[];
  strengths: string[];
  improvements: { title: string; detail: string }[];
  questions: { question: string; answer: string; competencies: string[]; score: number; verdict: string; missing: string[]; improvedAnswer: string }[];
  plan: PlanItem[];
  comparison: string;
  previous: null | { sessionId: string; overallScore: number | null };
}

export interface TranscriptTurn { seq: number; role: 'INTERVIEWER' | 'CANDIDATE'; text: string; topicId: string | null; at: string }

export interface InterviewSessionView {
  id: string;
  status: InterviewStatus;
  mode: InterviewMode;
  kind: InterviewKind;
  level: InterviewLevel;
  durationMinutes: number;
  language: string;
  activeSeconds: number;
  startedAt: string | null;
  endedAt: string | null;
  endReason: string | null;
  createdAt: string;
  previousSessionId: string | null;
  focus: string[];
  job: { id: string; title: string; position: string };
  topics: (InterviewTopic & { covered: boolean })[];
  remainingSeconds: number;
  transcript: TranscriptTurn[];
  overallScore: number | null;
  report: InterviewReport | null;
}

/** The interview clock the server sends after each turn and heartbeat. */
export interface InterviewClock {
  activeSeconds: number;
  remainingSeconds: number;
  sessionLeftSeconds: number;
  wrapUp: boolean;
  timeUp: boolean;
}

export interface NewSessionInput {
  jobId: string;
  mode: InterviewMode;
  kind: InterviewKind;
  level: InterviewLevel;
  durationMinutes: number;
}

export const interviewKeys = {
  all: ['interviews'] as const,
  overview: ['interviews', 'overview'] as const,
  sessions: ['interviews', 'sessions'] as const,
  session: (id: string) => ['interviews', 'session', id] as const,
  job: (id: string) => ['interviews', 'job', id] as const,
};

const base = '/interviews';
const enc = encodeURIComponent;

export const getOverview = () => api<InterviewOverview>(`${base}/overview`);
export const listSessions = () => api<{ sessions: SessionSummary[] }>(`${base}/sessions`);
export const getJob = (id: string) => api<InterviewJob>(`${base}/jobs/${enc(id)}`);
export const createJobFromText = (text: string, title?: string) => api<InterviewJob>(`${base}/jobs`, { method: 'POST', body: { text, title } });
export const uploadJob = (file: File) => apiUpload<InterviewJob>(`${base}/jobs/upload`, file, { 'X-File-Name': enc(file.name) });
export const createJobFromExam = (examSlug: string) => api<InterviewJob>(`${base}/jobs/from-exam`, { method: 'POST', body: { examSlug } });
export const updateJob = (id: string, profile: JobProfile) => api<InterviewJob>(`${base}/jobs/${enc(id)}`, { method: 'PATCH', body: { profile } });
export const deleteJob = (id: string) => api<void>(`${base}/jobs/${enc(id)}`, { method: 'DELETE' });

export const createSession = (input: NewSessionInput) => api<InterviewSessionView>(`${base}/sessions`, { method: 'POST', body: input });
export const practiceWeakAreas = (id: string, input: { mode?: InterviewMode; durationMinutes?: number } = {}) =>
  api<InterviewSessionView>(`${base}/sessions/${enc(id)}/practice`, { method: 'POST', body: input });
export const getSession = (id: string) => api<InterviewSessionView>(`${base}/sessions/${enc(id)}`);
export const deleteSession = (id: string) => api<void>(`${base}/sessions/${enc(id)}`, { method: 'DELETE' });

export const beat = (id: string) => api<InterviewClock & { status: InterviewStatus }>(`${base}/sessions/${enc(id)}/beat`, { method: 'POST', body: {} });
export const pauseSession = (id: string) => api<InterviewClock & { status: InterviewStatus }>(`${base}/sessions/${enc(id)}/pause`, { method: 'POST', body: {} });
export const resumeSession = (id: string) => api<InterviewClock & { status: InterviewStatus }>(`${base}/sessions/${enc(id)}/resume`, { method: 'POST', body: {} });
export const endSession = (id: string) => api<InterviewSessionView>(`${base}/sessions/${enc(id)}/end`, { method: 'POST', body: {} });
export const retryEvaluation = (id: string) => api<{ status: InterviewStatus }>(`${base}/sessions/${enc(id)}/evaluate`, { method: 'POST', body: {} });

/** Start: streams the interviewer's welcome. */
export const startSession = (id: string, onEvent: (e: StreamEvent) => void, signal?: AbortSignal) =>
  apiStream(`${base}/sessions/${enc(id)}/start`, { signal }, onEvent);

/** One answer, spoken (a recording) or typed; streams `transcript`, `delta`… and `done`. */
export const sendAnswer = (id: string, answer: Blob | string, onEvent: (e: StreamEvent) => void, signal?: AbortSignal) =>
  apiStream(`${base}/sessions/${enc(id)}/turns`, { body: typeof answer === 'string' ? { text: answer } : answer, signal }, onEvent);
