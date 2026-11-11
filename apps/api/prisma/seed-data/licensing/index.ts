import type { TestDef } from '../types';
import { NCNM_MOCKS } from './ncnm';
import { NPC_MOCKS } from './npc';
import { RMDC_MOCKS } from './rmdc';
import { RAHPC_LAB_MOCKS } from './rahpc-lab';
import { RAHPC_CLINMED_MOCKS } from './rahpc-clinmed';
import { RAHPC_ANAES_MOCKS } from './rahpc-anaes';
import { NCNM_PAST_PAPERS } from './ncnm-past-papers';

/**
 * Professional licensing exams (category "licensing-exams"): practice mocks for Rwanda's council licensing exams.
 * Generated from the checked question pools by the licensing assembler — do not edit by hand.
 */
export const LICENSING_MOCKS: TestDef[] = [...NCNM_MOCKS, ...NCNM_PAST_PAPERS, ...NPC_MOCKS, ...RMDC_MOCKS, ...RAHPC_LAB_MOCKS, ...RAHPC_CLINMED_MOCKS, ...RAHPC_ANAES_MOCKS];

/** Slugs of the NCNM past papers (real questions word for word; they may repeat questions in the practice mocks). */
export const NCNM_PAST_PAPER_SLUGS: string[] = NCNM_PAST_PAPERS.map((t) => t.slug);
