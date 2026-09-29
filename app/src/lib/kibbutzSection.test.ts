import { describe, it, expect, vi } from 'vitest';

const rpc = vi.fn();
vi.mock('@/lib/supabase', () => ({ getSupabase: async () => ({ rpc }) }));

import {
  canEditSection, buildSectionEdit, buildUndoEdit, applyEdit, saveSection, sectionErrorMessage,
  RPC_MISSING_MSG, triggerDecision,
} from './kibbutzSection';

const row = { name: 'דפנה', region: 'העמקים', section: 'new' };

describe('role matrix', () => {
  it.each([
    ['עידן', false, true], ['עמיחי', false, true],
    ['עידן', true, false], ['אביאם', false, false], ['ניתאי', false, false], ['', false, false],
  ])('%s viewer=%s -> %s', (u, v, want) => expect(canEditSection(u as string, v as boolean)).toBe(want));
});

describe('builders', () => {
  it('null when unchanged or invalid', () => {
    expect(buildSectionEdit(row, 'new')).toBeNull();
    expect(buildSectionEdit(row, 'x' as any)).toBeNull();
  });
  it('builds a change and its undo (never carries region)', () => {
    expect(buildSectionEdit(row, 'active')).toEqual({ name: 'דפנה', section: 'active' });
    expect(buildUndoEdit(row)).toEqual({ name: 'דפנה', section: 'new' });
  });
  it('applyEdit patches only that row and never touches region', () => {
    const out = applyEdit([row, { name: 'אלון', region: 'x' }], { name: 'דפנה', section: 'active' });
    expect(out[0]).toMatchObject({ region: 'העמקים', section: 'active' });
    expect(out[1]).toEqual({ name: 'אלון', region: 'x' });
  });
});

describe('saveSection', () => {
  it('sends the rpc args', async () => {
    rpc.mockResolvedValueOnce({ error: null });
    await saveSection({ name: 'דפנה', section: 'active' });
    expect(rpc).toHaveBeenCalledWith('set_kibbutz_section', { p_kibbutz: 'דפנה', p_section: 'active' });
  });
  it('missing rpc -> Hebrew message', async () => {
    rpc.mockResolvedValueOnce({ error: { code: 'PGRST202', message: 'Could not find the function' } });
    await expect(saveSection({ name: 'a', section: 'new' })).rejects.toThrow(RPC_MISSING_MSG);
  });
  it('forbidden -> permission message', () => {
    expect(sectionErrorMessage({ code: '42501', message: 'not allowed' })).toContain('הרשאה');
  });
});

describe('trigger decision table (mirror of kibbutzim_lock_region_section)', () => {
  const base = { op: 'UPDATE' as const, role: 'authenticated', regionChanged: false, sectionChanged: false, viaRpc: false };
  it.each([
    // [label, overrides, expected]
    ['insert by authenticated', { op: 'INSERT', regionChanged: true, sectionChanged: true }, 'allow'],
    ['unrelated column update', {}, 'allow'],
    ['region change by authenticated', { regionChanged: true }, 'deny'],
    ['region change even via rpc flag', { regionChanged: true, viaRpc: true }, 'deny'],
    ['section change direct', { sectionChanged: true }, 'deny'],
    ['section change via rpc', { sectionChanged: true, viaRpc: true }, 'allow'],
    ['region + section via rpc', { regionChanged: true, sectionChanged: true, viaRpc: true }, 'deny'],
    ['region change by service_role', { role: 'service_role', regionChanged: true }, 'allow'],
    ['section change by postgres', { role: 'postgres', sectionChanged: true }, 'allow'],
    ['section change by anon', { role: 'anon', sectionChanged: true }, 'deny'],
    ['rpc flag alone, nothing changed', { viaRpc: true }, 'allow'],
  ])('%s -> %s', (_l, o, want) => expect(triggerDecision({ ...base, ...(o as any) })).toBe(want));
});
