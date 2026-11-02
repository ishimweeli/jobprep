import { api } from './client';
import type {
  AnswerChangeDto, AttemptState, DashboardResponse, InProgressAttempt, ResultResponse, ReviewFilter, ReviewResponse,
  SaveAnswersResponse, StartAttemptResponse, SubmitResponse, TimerResponse,
} from './types';

export const attemptKeys = {
  state: (id: string) => ['attempt', id] as const,
  result: (id: string) => ['attempt', id, 'result'] as const,
  review: (id: string, filter: ReviewFilter) => ['attempt', id, 'review', filter] as const,
  inProgress: ['attempts', 'in-progress'] as const,
  dashboard: ['me', 'dashboard'] as const,
};

export const startAttempt = (countryCode: string, slug: string) =>
  api<StartAttemptResponse>(`/countries/${countryCode.toUpperCase()}/mock-tests/${encodeURIComponent(slug)}/attempts`, { method: 'POST', body: {} });

export const getAttempt = (id: string) => api<AttemptState>(`/attempts/${encodeURIComponent(id)}`);
export const getAttemptTimer = (id: string) => api<TimerResponse>(`/attempts/${encodeURIComponent(id)}/timer`);

export const saveAnswers = (id: string, changes: AnswerChangeDto[], keepalive = false) =>
  api<SaveAnswersResponse>(`/attempts/${encodeURIComponent(id)}/answers`, { method: 'PUT', body: { changes }, keepalive });

export const submitAttempt = (id: string, changes: AnswerChangeDto[] = []) =>
  api<SubmitResponse>(`/attempts/${encodeURIComponent(id)}/submit`, { method: 'POST', body: changes.length > 0 ? { changes } : {} });

export const getResult = (id: string) => api<ResultResponse>(`/attempts/${encodeURIComponent(id)}/result`);
export const getReview = (id: string, filter: ReviewFilter) =>
  api<ReviewResponse>(`/attempts/${encodeURIComponent(id)}/review`, { query: { filter } });

export const listInProgress = () => api<{ attempts: InProgressAttempt[] }>('/attempts/in-progress').then((r) => r.attempts);
export const getDashboard = () => api<DashboardResponse>('/me/dashboard');
