import { afterEach, describe, expect, it, vi } from 'vitest';
import { downloadCsv, fileNameFrom, waitingListExportUrl } from './questions-demand';

afterEach(() => vi.unstubAllGlobals());

describe('export downloads', () => {
  it('the waiting-list export URL is the admin API with the country', () => {
    expect(waitingListExportUrl('KE')).toBe('/api/admin/demand/waiting-list/export?country=KE');
  });

  it('takes the file name from Content-Disposition, else the fallback', () => {
    expect(fileNameFrom('attachment; filename="waiting-list-ke.csv"', 'x.csv')).toBe('waiting-list-ke.csv');
    expect(fileNameFrom('attachment; filename=export.csv', 'x.csv')).toBe('export.csv');
    expect(fileNameFrom(null, 'x.csv')).toBe('x.csv');
  });

  it('fetches with the session, saves the file and answers with its name', async () => {
    const fetchMock = vi.fn(async () => new Response('email,interest\na@b.c,\n', { status: 200, headers: { 'Content-Disposition': 'attachment; filename="waiting-list.csv"' } }));
    vi.stubGlobal('fetch', fetchMock);
    const create = vi.fn(() => 'blob:x');
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: create, revokeObjectURL: vi.fn() }));
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    const name = await downloadCsv('/api/admin/demand/waiting-list/export?country=KE', 'fallback.csv');
    expect(name).toBe('waiting-list.csv');
    expect(fetchMock).toHaveBeenCalledWith('/api/admin/demand/waiting-list/export?country=KE', expect.objectContaining({ credentials: 'include' }));
    expect(create).toHaveBeenCalled();
    expect(click).toHaveBeenCalled();
    click.mockRestore();
  });

  it('says why it failed, in words', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 403 })));
    await expect(downloadCsv('/x', 'f.csv')).rejects.toThrow(/role does not allow/);
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 500 })));
    await expect(downloadCsv('/x', 'f.csv')).rejects.toThrow(/could not be made/);
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('offline'); }));
    await expect(downloadCsv('/x', 'f.csv')).rejects.toThrow(/Could not reach/);
  });
});
