import { describe, expect, it } from 'vitest';
import type { TeamMemberRole } from '../../api/types';
import { assignments, canScope, editPatch, inviteBody, removePatch, restorePatch, scopeLabel, validateInvite } from './teamModel';

const editor: TeamMemberRole = { code: 'CONTENT_EDITOR', label: 'Content editor', countryScope: ['RW'], active: true };

describe('team model', () => {
  it('validates an invite', () => {
    expect(validateInvite({ name: 'A', email: 'nope' })).toEqual({ name: expect.any(String), email: expect.any(String) });
    expect(validateInvite({ name: 'Marie C.', email: 'marie@example.com' })).toEqual({});
  });

  it('a System admin is never limited to countries', () => {
    expect(canScope('SYSTEM_ADMIN')).toBe(false);
    const b = inviteBody({ name: ' Marie ', email: 'Marie@Example.com ', role: 'SYSTEM_ADMIN', countries: ['RW'], reason: '' }, 'New lead');
    expect(b).toEqual({ name: 'Marie', email: 'marie@example.com', role: 'SYSTEM_ADMIN', countryScope: [], reason: 'New lead' });
    expect(inviteBody({ name: 'Marie', email: 'm@e.com', role: 'SUPPORT', countries: ['KE'], reason: '' }, 'x1234').countryScope).toEqual(['KE']);
  });

  it('builds the smallest role change and refuses an empty one', () => {
    expect(editPatch(editor, { role: 'CONTENT_EDITOR', countries: ['RW'] }, 'why now')).toBeNull();
    expect(editPatch(editor, { role: 'SUPPORT', countries: ['RW'] }, 'why now')).toEqual({ role: 'CONTENT_EDITOR', newRole: 'SUPPORT', reason: 'why now' });
    expect(editPatch(editor, { role: 'CONTENT_EDITOR', countries: [] }, 'why now')).toEqual({ role: 'CONTENT_EDITOR', countryScope: [], reason: 'why now' });
    expect(removePatch(editor, 'left')).toEqual({ role: 'CONTENT_EDITOR', active: false, reason: 'left' });
    expect(restorePatch(editor, 'back')).toEqual({ role: 'CONTENT_EDITOR', active: true, reason: 'back' });
  });

  it('words the scope and reads the legacy single-role shape', () => {
    expect(scopeLabel([])).toBe('All countries');
    expect(scopeLabel(['RW', 'KE'])).toBe('Rwanda, Kenya');
    expect(assignments({ role: 'SUPPORT', roleLabel: 'Support', countryScope: [], active: true })).toEqual([{ code: 'SUPPORT', label: 'Support', countryScope: [], active: true }]);
  });
});
