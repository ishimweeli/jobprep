import type { TestDef } from '../types';
import { MOCKS as m_conservation_agriculture_field_specialist } from './conservation-agriculture-field-specialist';
import { MOCKS as m_conservation_agriculture_project_manager } from './conservation-agriculture-project-manager';
import { MOCKS as m_cpd_coordination_officer } from './cpd-coordination-officer';
import { MOCKS as m_environmental_safeguards_specialist } from './environmental-safeguards-specialist';
import { MOCKS as m_postgraduate_coordination_officer } from './postgraduate-coordination-officer';
import { MOCKS as m_protection_specialist } from './protection-specialist';
import { MOCKS as m_research_and_grant_management_specialist } from './research-and-grant-management-specialist';
import { MOCKS as m_social_and_religious_education_teacher } from './social-and-religious-education-teacher';

/** Mocks written by the daily content pipeline (prisma/pipeline), one file per advertised job. Generated — do not edit. */
export const AUTO_MOCKS: TestDef[] = [...m_conservation_agriculture_field_specialist, ...m_conservation_agriculture_project_manager, ...m_cpd_coordination_officer, ...m_environmental_safeguards_specialist, ...m_postgraduate_coordination_officer, ...m_protection_specialist, ...m_research_and_grant_management_specialist, ...m_social_and_religious_education_teacher];
