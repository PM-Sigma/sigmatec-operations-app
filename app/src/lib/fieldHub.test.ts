import { describe, it, expect } from 'vitest';
import { hubSections, sectionForPage, HUB_SECTION_ID } from './fieldHub';

// The gate rules of js/src/00-bridge.js canShowPage, re-stated per person (spec §3).
const ATT_PEOPLE = ['אביאם', 'ניתאי'];
function gates(user: string, viewer = false) {
  return (g: 'attendance' | 'modbus' | 'burns') => {
    if (g === 'attendance') return viewer || ATT_PEOPLE.includes(user) || user === 'עמיחי' || user === 'עידן';
    if (g === 'modbus') return !viewer && !!user;
    if (viewer) return true;
    if (['מתניה', 'אליה'].includes(user)) return false;
    return ['אביאם', 'ניתאי', 'עידן', 'עמיחי'].includes(user);
  };
}

describe('hubSections — role matrix', () => {
  it.each([
    ['עידן', ['today', 'attendance', 'ip', 'burns']],
    ['עמיחי', ['today', 'attendance', 'ip', 'burns']],
    ['אביאם', ['today', 'attendance', 'ip', 'burns']],
    ['ניתאי', ['today', 'attendance', 'ip', 'burns']],
    ['מתניה', ['today', 'ip']],
  ])('%s', (user, want) => {
    expect(hubSections(false, gates(user))).toEqual(want);
  });
  it('viewer: נוכחות + צריבות, never IP or היום שלי', () => {
    expect(hubSections(true, gates('', true))).toEqual(['attendance', 'burns']);
  });
});

describe('sectionForPage — redirects', () => {
  it('attendance and burns are sections; everything else is not', () => {
    expect(sectionForPage('attendance')).toBe('attendance');
    expect(sectionForPage('burns')).toBe('burns');
    expect(sectionForPage('fieldops')).toBeNull();
    expect(sectionForPage('kibbutz')).toBeNull();
  });
  it('section ids match index.html', () => {
    expect(HUB_SECTION_ID.attendance).toBe('attendance-view');
    expect(HUB_SECTION_ID.burns).toBe('burns-view');
    expect(HUB_SECTION_ID.ip).toBe('fieldops-ip');
  });
});
