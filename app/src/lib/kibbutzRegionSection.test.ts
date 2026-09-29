import { describe, it, expect, vi } from 'vitest';

const rpc = vi.fn();
vi.mock('@/lib/supabase', () => ({ getSupabase: async () => ({ rpc }) }));

import {
  canEditRegionSection, buildRegionSectionEdit, buildUndoEdit, applyEdit, regionChoices,
  saveRegionSection, regionErrorMessage, RPC_MISSING_MSG,
} from './kibbutzRegionSection';

const row = { name: 'דפנה', region: 'העמקים', section: 'new' };

describe('role matrix', () => {
  it.each([
    ['עידן', false, true], ['עמיחי', false, true],
    ['עידן', true, false], ['אביאם', false, false], ['ניתאי', false, false], ['', false, false],
  ])('%s viewer=%s -> %s', (u, v, want) => expect(canEditRegionSection(u as string, v as boolean)).toBe(want));
});

describe('builders', () => {
  it('null when unchanged or invalid', () => {
    expect(buildRegionSectionEdit(row, 'העמקים', 'new')).toBeNull();
    expect(buildRegionSectionEdit(row, '  ', 'new')).toBeNull();
    expect(buildRegionSectionEdit(row, 'גליל וגולן', 'x' as any)).toBeNull();
  });
  it('builds a change and its undo', () => {
    expect(buildRegionSectionEdit(row, 'גליל וגולן', 'active'))
      .toEqual({ name: 'דפנה', region: 'גליל וגולן', section: 'active' });
    expect(buildUndoEdit(row)).toEqual({ name: 'דפנה', region: 'העמקים', section: 'new' });
  });
  it('applyEdit patches only that row', () => {
    const out = applyEdit([row, { name: 'אלון', region: 'x' }], { name: 'דפנה', region: 'R', section: 'active' });
    expect(out[0]).toMatchObject({ region: 'R', section: 'active' });
    expect(out[1]).toEqual({ name: 'אלון', region: 'x' });
  });
  it('regionChoices keeps an off-list region', () => {
    expect(regionChoices({ name: 'a', region: 'ישן' })).toContain('ישן');
    expect(regionChoices(row).filter(r => r === 'העמקים')).toHaveLength(1);
  });
});

describe('saveRegionSection', () => {
  it('sends the rpc args', async () => {
    rpc.mockResolvedValueOnce({ error: null });
    await saveRegionSection({ name: 'דפנה', region: 'R', section: 'active' });
    expect(rpc).toHaveBeenCalledWith('set_kibbutz_region_section', { p_kibbutz: 'דפנה', p_region: 'R', p_section: 'active' });
  });
  it('missing rpc -> Hebrew message', async () => {
    rpc.mockResolvedValueOnce({ error: { code: 'PGRST202', message: 'Could not find the function' } });
    await expect(saveRegionSection({ name: 'a', region: 'R', section: 'new' })).rejects.toThrow(RPC_MISSING_MSG);
  });
  it('forbidden -> permission message', () => {
    expect(regionErrorMessage({ code: '42501', message: 'not allowed' })).toContain('הרשאה');
  });
});
