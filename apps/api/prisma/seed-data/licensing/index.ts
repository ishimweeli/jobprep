import type { TestDef } from '../types';
import { NCNM_MOCKS } from './ncnm';
import { NPC_MOCKS } from './npc';
import { RMDC_MOCKS } from './rmdc';
import { RAHPC_LAB_MOCKS } from './rahpc-lab';
import { RAHPC_CLINMED_MOCKS } from './rahpc-clinmed';
import { RAHPC_ANAES_MOCKS } from './rahpc-anaes';

/**
 * Professional licensing exams (category "licensing-exams"): practice mocks for Rwanda's council licensing exams.
 * Generated from the checked question pools by the licensing assembler — do not edit by hand.
 */
export const LICENSING_MOCKS: TestDef[] = [...NCNM_MOCKS, ...NPC_MOCKS, ...RMDC_MOCKS, ...RAHPC_LAB_MOCKS, ...RAHPC_CLINMED_MOCKS, ...RAHPC_ANAES_MOCKS];
