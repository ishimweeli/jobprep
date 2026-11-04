import { api } from './client';
import type {
  AnswerChangeDto, AttemptState, DashboardResponse, InProgressAttempt, PracticeCheckResponse, PracticeStartResponse, ResultResponse, ReviewFilter, ReviewResponse,
  SaveAnswersResponse, StartAttemptResponse, SubmitResponse, TimerResponse,
} from './types';

export const attemptKeys = {
  state: (id: string, lang?: string) => (lang && lang !== 'en' ? (['attempt', id, 'state', lang] as const) : (['attempt', id] as const)),
  result: (id: string) => ['attempt', id, 'result'] as const,
  review: (id: string, filter: ReviewFilter, lang?: string) => ['attempt', id, 'review', filter, lang && lang !== 'en' ? lang : 'en'] as const,
  inProgress: ['attempts', 'in-progress'] as const,
  dashboard: ['me', 'dashboard'] as const,
};

export const startAttempt = (countryCode: string, slug: string) =>
  api<StartAttemptResponse>(`/countries/${countryCode.toUpperCase()}/mock-tests/${encodeURIComponent(slug)}/attempts`, { method: 'POST', body: {} });

/** `lang` (rw / sw) overlays the translated text; questions without a translation stay in English (`language` in the answer says how many). */
export const getAttempt = (id: string, lang?: string) =>
  api<AttemptState>(`/attempts/${encodeURIComponent(id)}`, { query: { lang: lang && lang !== 'en' ? lang : undefined } });
export const getAttemptTimer = (id: string) => api<TimerResponse>(`/attempts/${encodeURIComponent(id)}/timer`);

export const saveAnswers = (id: string, changes: AnswerChangeDto[], keepalive = false) =>
  api<SaveAnswersResponse>(`/attempts/${encodeURIComponent(id)}/answers`, { method: 'PUT', body: { changes }, keepalive });

export const submitAttempt = (id: string, changes: AnswerChangeDto[] = []) =>
  api<SubmitResponse>(`/attempts/${encodeURIComponent(id)}/submit`, { method: 'POST', body: changes.length > 0 ? { changes } : {} });

export const getResult = (id: string) => api<ResultResponse>(`/attempts/${encodeURIComponent(id)}/result`);
export const getReview = (id: string, filter: ReviewFilter, lang?: string) =>
  api<ReviewResponse>(`/attempts/${encodeURIComponent(id)}/review`, { query: { filter, lang: lang && lang !== 'en' ? lang : undefined } });

export const listInProgress = () => api<{ attempts: InProgressAttempt[] }>('/attempts/in-progress').then((r) => r.attempts);
export const getDashboard = () => api<DashboardResponse>('/me/dashboard');

/** "Practice Weak Areas" on the results screen: a set built from that attempt's weak topics. */
export const startWeakPractice = (attemptId: string) =>
  api<PracticeStartResponse>(`/attempts/${encodeURIComponent(attemptId)}/practice`, { method: 'POST', body: {} });

/** "Start practice" / "Practise" on the dashboard: a set for one topic. */
export const startTopicPractice = (countryCode: string, topicId: string) =>
  api<PracticeStartResponse>(`/countries/${countryCode.toUpperCase()}/practice`, { method: 'POST', body: { topicId } });

/** Practice only: reveal the answer and the explanation of a question that has been answered. */
export const checkPracticeAnswer = (attemptId: string, questionId: string) =>
  api<PracticeCheckResponse>(`/attempts/${encodeURIComponent(attemptId)}/check`, { method: 'POST', body: { questionId } });
