// @vitest-environment jsdom
// Render goldens for ▶ מצב ישיבה (company-process spec §1.2 + §1.2b). The pure rules live in
// app/src/lib/meetingSession.test.ts; what is pinned HERE is everything a golden cannot see —
// that each key does exactly one thing, that `P` and `Space` do NOT move the screen, that Esc
// from the note field returns to navigation instead of ending the meeting, that the ✏️ chips
// create immediately through the paths that already exist, and that the screen never talks
// about itself.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor, act } from '@testing-library/react';

afterEach(cleanup);

const { state, inserted, updated, sonner, created, tracked } = vi.hoisted(() => ({
  state: { user: 'עידן', viewer: false, admin: true },
  inserted: [] as Array<{ table: string; row: any }>,
  updated: [] as Array<{ table: string; row: any }>,
  created: [] as any[],
  tracked: [] as string[],
  sonner: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

const KIBBUTZIM = [
  { name: 'אלון', region: 'גליל וגולן', section: 'active', kind: 'kibbutz', energy: ['electric'] },
  { name: 'בארי', region: 'גליל וגולן', section: 'active', kind: 'kibbutz', energy: ['gas'] },
  { name: 'גבים', region: 'העמקים', section: 'active', kind: 'kibbutz', energy: ['electric'] },
  { name: 'דפנה', region: 'העמקים', section: 'new', kind: 'kibbutz', energy: ['electric'] },
];

const NOTES = [
  {
    id: 'n1', kibbutz: 'דפנה', meeting_date: '2026-09-12', meeting_kind: 'company', seq: 1,
    text: 'להשלים החלפת מונה ראשי', owners: ['אביאם'], done_at: null,
  },
  {
    id: 'n2', kibbutz: 'דפנה', meeting_date: '2026-09-12', meeting_kind: 'company', seq: 2,
    text: 'לתאם חתימה מול הגזבר', owners: [], done_at: null,
  },
];

vi.mock('@/bridge', () => ({
  sigma: {
    getCurrentUser: () => state.user,
    isAdmin: () => state.admin,
    isViewer: () => state.viewer,
    createTask: (row: any) => { created.push(row); return Promise.resolve({ sent: true, id: 'T-1' }); },
    emsCacheTasksForKibbutz: () => [{ id: 'a', title: 'משימת א', status: 'open' }, { id: 'b', title: 'משימת ב', status: 'open' }],
    loadAllVisitsCombined: () => [],
    calFetchEvents: async () => [{ title: 'ישיבת חברה', hangoutLink: 'https://meet.google.com/abc-defg-hij' }],
  },
  sigmaBus: { addEventListener: () => {}, removeEventListener: () => {} },
  useCurrentUser: () => ({ name: state.user, role: state.viewer ? 'viewer' : 'idan', isViewer: state.viewer }),
  useSigmaEvent: () => {},
  useEmsConnected: () => true,
}));

vi.mock('sonner', () => ({ toast: sonner }));
vi.mock('@/islands', () => ({ mount: vi.fn(() => true) }));
vi.mock('@/lib/track', () => ({ track: (a: string, b?: string) => { tracked.push(b ? a + ':' + b : a); }, trackMount: vi.fn() }));
vi.mock('@/lib/registry', () => ({ registerMoreItem: vi.fn() }));

vi.mock('@/lib/supabase', () => {
  const table = (name: string) => ({
    select: () => ({
      is: async () => ({ data: name === 'kibbutzim' ? KIBBUTZIM : [], error: null }),
      then: (res: any) => Promise.resolve({ data: name === 'kibbutz_meeting_notes' ? NOTES : [], error: null }).then(res),
    }),
    insert: (row: any) => {
      inserted.push({ table: name, row });
      return { select: () => ({ single: async () => ({ data: { id: name + '-1', ...row }, error: null }) }) };
    },
    update: (row: any) => {
      updated.push({ table: name, row });
      return { eq: () => ({ select: () => ({ single: async () => ({ data: { id: 'x' }, error: null }) }) }) };
    },
  });
  return {
    SB_URL: 'https://sb.test', SB_ANON: 'anon',
    getSupabase: async () => ({ from: table }),
    sbWrite: async (run: any) => {
      const res = await run({ from: table });
      if (res?.error) throw res.error;
      return res?.data ?? null;
    },
  };
});

const { Presenter, openPresenter } = await import('./Presenter');

async function openScreen() {
  render(<Presenter />);
  await act(async () => { openPresenter(); });
  await screen.findByTestId('presenter');
  // the session row and the first `kibbutz` event settle one microtask later
  await waitFor(() => expect(inserted.some(i => i.table === 'meeting_sessions')).toBe(true));
  await screen.findByTestId('presenter-kibbutz');
}

const key = (k: string, target: Element | Document = document.body) =>
  act(() => { fireEvent.keyDown(target, { key: k }); });

const events = () => inserted.filter(i => i.table === 'meeting_events').map(i => i.row);
const kibbutzShown = () => screen.getByTestId('presenter-kibbutz').textContent;

beforeEach(() => {
  inserted.length = 0; updated.length = 0; created.length = 0; tracked.length = 0;
  state.user = 'עידן'; state.viewer = false; state.admin = true;
  vi.clearAllMocks();
});

// ───────────────────────────── the screen ─────────────────────────────

describe('presenter screen', () => {
  it('opens on the FIRST kibbutz of the board order — 🆕 before ✅', async () => {
    await openScreen();
    expect(kibbutzShown()).toBe('דפנה');                       // the only new client
    expect(screen.getByTestId('presenter-counter').textContent).toContain('1 / 4');
  });

  it('shows the clock, both state strips and the previous meeting\'s bullets', async () => {
    await openScreen();
    expect(screen.getByTestId('presenter-timer').textContent).toMatch(/^\d{2}:\d{2}$/);
    expect(screen.getByTestId('presenter-strip-admin')).toBeTruthy();
    expect(screen.getByTestId('presenter-strip-field')).toBeTruthy();
    expect(screen.getByText('להשלים החלפת מונה ראשי')).toBeTruthy();
    expect(screen.getByTestId('presenter-carry').textContent).toBe('מהישיבה הקודמת: 2 פתוחים');
  });

  it('renders NOTHING for Task 28\'s strip while that task has not shipped', async () => {
    await openScreen();
    expect(screen.queryByTestId('presenter-strip-extra')).toBeNull();
  });

  it('shows the 🎥 link of today\'s meeting, and only opens it in a new tab', async () => {
    await openScreen();
    const meet = await screen.findByTestId('presenter-meet');
    expect(meet.getAttribute('href')).toBe('https://meet.google.com/abc-defg-hij');
    expect(meet.getAttribute('target')).toBe('_blank');
  });

  it('logs every arrival as the segment boundary it is — once per kibbutz', async () => {
    await openScreen();
    await waitFor(() => expect(events().filter(e => e.kind === 'kibbutz')).toHaveLength(1));
    expect(events()[0]).toMatchObject({ kind: 'kibbutz', kibbutz: 'דפנה' });
  });
});

// ───────────────────────────── the key map ─────────────────────────────

describe('keys', () => {
  it('← moves forward and → moves back (the board runs right to left)', async () => {
    await openScreen();
    await key('ArrowLeft');
    expect(kibbutzShown()).toBe('אלון');
    await key('ArrowLeft');
    expect(kibbutzShown()).toBe('בארי');
    await key('ArrowRight');
    expect(kibbutzShown()).toBe('אלון');
  });

  it('J / K do the same thing as the arrows', async () => {
    await openScreen();
    await key('j');
    expect(kibbutzShown()).toBe('אלון');
    await key('k');
    expect(kibbutzShown()).toBe('דפנה');
  });

  it('does not wrap past either end', async () => {
    await openScreen();
    await key('ArrowRight');
    expect(kibbutzShown()).toBe('דפנה');                        // already first
    for (let i = 0; i < 8; i++) await key('ArrowLeft');
    expect(kibbutzShown()).toBe('גבים');                        // the last one, and it stays
  });

  it('Space marks the moment and the screen does NOT move', async () => {
    await openScreen();
    await key(' ');
    await waitFor(() => expect(events().some(e => e.kind === 'marker')).toBe(true));
    expect(events().find(e => e.kind === 'marker')).toMatchObject({ kind: 'marker', kibbutz: 'דפנה' });
    expect(kibbutzShown()).toBe('דפנה');
  });

  it('P parks the tangent with the kibbutz as a HINT — and does NOT move the screen', async () => {
    await openScreen();
    await key('p');
    await waitFor(() => expect(events().some(e => e.kind === 'parking')).toBe(true));
    const row = events().find(e => e.kind === 'parking');
    expect(row).toMatchObject({ kind: 'parking', hint: 'דפנה' });
    expect(row).not.toHaveProperty('kibbutz');
    expect(kibbutzShown()).toBe('דפנה');
  });

  it('N focuses the quick-note line, and then letters are TEXT, not commands', async () => {
    await openScreen();
    await key('n');
    const field = screen.getByTestId('presenter-quicknote') as HTMLInputElement;
    expect(document.activeElement).toBe(field);
    await key('p', field);                                       // would park, if it were a command
    await key('j', field);                                       // would move, if it were a command
    expect(events().some(e => e.kind === 'parking')).toBe(false);
    expect(kibbutzShown()).toBe('דפנה');
  });

  it('Esc from the note field returns to navigation — it does NOT end the meeting', async () => {
    await openScreen();
    await key('n');
    const field = screen.getByTestId('presenter-quicknote');
    await key('Escape', field);
    expect(screen.queryByTestId('presenter-exit-sheet')).toBeNull();
    expect(screen.getByTestId('presenter')).toBeTruthy();
    // …and the SECOND Esc, now from navigation, is the one that asks
    await key('Escape');
    expect(await screen.findByTestId('presenter-exit-sheet')).toBeTruthy();
  });

  it('leaving is confirmed, and closes the session instead of abandoning it', async () => {
    await openScreen();
    await key('Escape');
    await act(async () => { fireEvent.click(await screen.findByTestId('presenter-exit-yes')); });
    await waitFor(() => expect(updated.some(u => u.table === 'meeting_sessions' && u.row.ended_at)).toBe(true));
    await waitFor(() => expect(screen.queryByTestId('presenter')).toBeNull());
  });
});

// ───────────────────────────── the quick note ─────────────────────────────

describe('quick note', () => {
  it('Enter writes ONE line and clears the field', async () => {
    await openScreen();
    const field = screen.getByTestId('presenter-quicknote') as HTMLInputElement;
    fireEvent.change(field, { target: { value: 'לבדוק את המונה הראשי' } });
    await key('Enter', field);
    await waitFor(() => expect(events().filter(e => e.kind === 'note')).toHaveLength(1));
    expect(events().find(e => e.kind === 'note')).toMatchObject({
      kind: 'note', kibbutz: 'דפנה', hint: 'לבדוק את המונה הראשי',
    });
    expect(field.value).toBe('');
  });

  it('an empty line writes nothing at all', async () => {
    await openScreen();
    const field = screen.getByTestId('presenter-quicknote');
    fireEvent.change(field, { target: { value: '   ' } });
    await key('Enter', field);
    expect(events().some(e => e.kind === 'note')).toBe(false);
  });
});

// ───────────────────────────── the ✏️ live sheet ─────────────────────────────

describe('✏️ live quick-note', () => {
  async function openSheet() {
    await openScreen();
    await act(async () => { fireEvent.click(screen.getByTestId('presenter-edit')); });
    await screen.findByTestId('presenter-live');
  }

  it('offers the classification chips in the order the ruling lists them', async () => {
    await openSheet();
    ['ems', 'note', 'decision', 'idea'].forEach(id => {
      expect(screen.getByTestId('live-chip-' + id)).toBeTruthy();
    });
  });

  it('offers 🔒 פנימי now that internal tasks have a write path (Task 26)', async () => {
    await openSheet();
    expect(screen.getByTestId('live-chip-internal')).toBeTruthy();
  });

  it('📋 creates the EMS task through the existing chain, ONCE, with a taskFromBullet payload', async () => {
    await openSheet();
    fireEvent.change(screen.getByTestId('live-text'), { target: { value: 'להזמין מונה חלופי מהמחסן' } });
    fireEvent.change(screen.getByTestId('live-owner'), { target: { value: 'ניתאי' } });
    await act(async () => { fireEvent.click(screen.getByTestId('live-chip-ems')); });
    await act(async () => { fireEvent.click(screen.getByTestId('live-submit')); });

    await waitFor(() => expect(created).toHaveLength(1));
    expect(created[0]).toMatchObject({
      kibbutz: 'דפנה',
      title: 'להזמין מונה חלופי מהמחסן',
      assigneeName: 'ניתאי',
      priority: 'medium',
    });
    expect(created[0].description).toContain('מקור: ישיבת חברה');
    // …and nothing was written to the bullets table for a 📋
    expect(inserted.some(i => i.table === 'kibbutz_meeting_notes')).toBe(false);
  });

  it('📝 writes the bullet on the card, stamped as written during the meeting', async () => {
    await openSheet();
    fireEvent.change(screen.getByTestId('live-text'), { target: { value: 'הקיבוץ ביקש דוח חודשי' } });
    await act(async () => { fireEvent.click(screen.getByTestId('live-chip-note')); });
    await act(async () => { fireEvent.click(screen.getByTestId('live-submit')); });

    await waitFor(() => expect(inserted.some(i => i.table === 'kibbutz_meeting_notes')).toBe(true));
    const row = inserted.find(i => i.table === 'kibbutz_meeting_notes')!.row;
    expect(row).toMatchObject({ kibbutz: 'דפנה', text: 'הקיבוץ ביקש דוח חודשי', source: 'live' });
    expect(row.seq).toBeGreaterThan(0);
    expect(created).toHaveLength(0);                             // no EMS task for a 📝
  });

  it('🔒 opens an internal task, not a note (D2)', async () => {
    await openSheet();
    fireEvent.change(screen.getByTestId('live-text'), { target: { value: 'להזמין כבל' } });
    fireEvent.change(screen.getByTestId('live-owner'), { target: { value: 'ניתאי' } });
    await act(async () => { fireEvent.click(screen.getByTestId('live-chip-internal')); });
    await act(async () => { fireEvent.click(screen.getByTestId('live-submit')); });

    await waitFor(() => expect(inserted.some(i => i.table === 'internal_tasks')).toBe(true));
    const row = inserted.find(i => i.table === 'internal_tasks')!.row;
    expect(row).toMatchObject({ title: 'להזמין כבל', kibbutz: 'דפנה', owner: 'ניתאי', created_by: 'עידן' });
    // …and nothing was written to the bullets table for a 🔒
    expect(inserted.some(i => i.table === 'kibbutz_meeting_notes')).toBe(false);
    expect(created).toHaveLength(0);                             // no EMS task for a 🔒
  });

  it('an empty line cannot be submitted', async () => {
    await openSheet();
    expect((screen.getByTestId('live-submit') as HTMLButtonElement).disabled).toBe(true);
  });

  it('Esc closes the sheet and leaves the meeting running', async () => {
    await openSheet();
    await key('Escape', screen.getByTestId('live-text'));
    await waitFor(() => expect(screen.queryByTestId('presenter-live')).toBeNull());
    expect(screen.queryByTestId('presenter-exit-sheet')).toBeNull();
    expect(screen.getByTestId('presenter')).toBeTruthy();
  });
});

// ───────────────────────────── roles + copy ─────────────────────────────

describe('who may present, and what the screen says', () => {
  it('a viewer never gets the screen, however the role was asked', async () => {
    state.viewer = true; state.user = 'צפייה'; state.admin = false;
    render(<Presenter />);
    await act(async () => { openPresenter(); });
    expect(screen.queryByTestId('presenter')).toBeNull();
  });

  it('a field worker never gets it either', async () => {
    state.viewer = false; state.user = 'אביאם'; state.admin = false;
    render(<Presenter />);
    await act(async () => { openPresenter(); });
    expect(screen.queryByTestId('presenter')).toBeNull();
  });

  it('never explains its own mechanics on screen (master spec §6)', async () => {
    await openScreen();
    const text = screen.getByTestId('presenter').textContent || '';
    [/נשמר/, /\bDB\b/, /אירוע/, /טבלה/, /סנכרון/, /שרת/, /מי רואה/].forEach(re => {
      expect(text).not.toMatch(re);
    });
  });

  it('is Hebrew and right-to-left', async () => {
    await openScreen();
    expect(screen.getByTestId('presenter').getAttribute('dir')).toBe('rtl');
  });
});
