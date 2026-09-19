// Goldens for the `ems-rest` adapter (spec §7o, Task 18b). Two jobs:
//   1. the REQUEST — every URL is pinned character for character against the URL the
//      pre-gateway call site sent, so "behaviour byte-identical" is a test, not a claim;
//   2. the RESPONSE — raw EMS JSON in, app-owned types out, with both casings the legacy
//      readers tolerated. When `ems-mcp` lands it runs this same file.
import { describe, expect, it, vi } from 'vitest';
import {
  OPEN_STATUSES, REST_CAPABILITIES, URLS, mapComment, mapMeter, mapSite, mapTask, mapUser,
  restAdapter, unwrapList, unwrapOne, type RestTransport,
} from './adapters/rest';

function fake(overrides: Partial<RestTransport> = {}) {
  const writes: Array<Record<string, unknown>> = [];
  const t: RestTransport = {
    emsApi: vi.fn(async () => []),
    emsWrite: vi.fn(async (item: Record<string, unknown>) => { writes.push(item); return { sent: true, id: 'T1' }; }),
    isConnected: () => true,
    getSites: async () => [{ id: 's1', name: 'דפנה' }],
    ...overrides,
  };
  return { t, writes, gw: restAdapter(t), paths: () => (t.emsApi as any).mock.calls.map((c: any[]) => c[0]) };
}

describe('URLS — the exact strings the pre-gateway call sites sent', () => {
  it('/sites', () => expect(URLS.sites()).toBe('/sites'));

  // was app/src/lib/emsChain.ts step 2
  it('/meters — siteId encoded, take=500', () =>
    expect(URLS.meters('a b/c')).toBe('/meters?siteId=a%20b%2Fc&take=500'));

  it('/meters/:id', () => expect(URLS.meter('m9')).toBe('/meters/m9'));

  // was emsChain step 3 AND healthSources.emsApiSource.alerts — both built this string
  it('/employee-tasks — open statuses, take=100', () =>
    expect(URLS.tasks({ siteId: 'site-1', take: 100 }))
      .toBe('/employee-tasks?siteId=site-1&statuses=open,in_progress,pending&take=100'));

  it('open statuses are the legacy three, in order', () =>
    expect(OPEN_STATUSES.join(',')).toBe('open,in_progress,pending'));

  it('no siteId → no siteId param (and take defaults to 100)', () =>
    expect(URLS.tasks()).toBe('/employee-tasks?statuses=open,in_progress,pending&take=100'));

  it('explicit statuses override the open set', () =>
    expect(URLS.tasks({ statuses: ['done'], take: 5 })).toBe('/employee-tasks?statuses=done&take=5'));

  it('/employee-tasks/:id and its comments', () => {
    expect(URLS.task('t7')).toBe('/employee-tasks/t7');
    expect(URLS.comments('t7')).toBe('/employee-tasks/t7/comments');
  });

  // was js/src/14-calendar.js getEmsUsers()
  it('/users — the legacy admin filter, unchanged', () =>
    expect(URLS.users()).toBe('/users?roles=admin&statuses=active&take=200&sortBy=firstName&sortOrder=ASC'));
});

describe('unwrapping', () => {
  it('a bare array, and each of the four wrappers', () => {
    expect(unwrapList([1])).toEqual([1]);
    for (const k of ['items', 'data', 'results', 'rows']) expect(unwrapList({ [k]: [2] })).toEqual([2]);
  });
  it('an unusable body is an empty list, never a throw', () => {
    expect(unwrapList(null)).toEqual([]);
    expect(unwrapList({ message: 'nope' })).toEqual([]);
  });
  it('one resource: top level or under data', () => {
    expect(unwrapOne({ id: 'a' })).toEqual({ id: 'a' });
    expect(unwrapOne({ data: { id: 'b' } })).toEqual({ id: 'b' });
  });
});

describe('mapping — raw EMS JSON to app-owned types', () => {
  it('a full task', () => {
    expect(mapTask({
      id: 1, title: 't', description: 'd', status: 'open', priority: 'normal', type: 'fault',
      site: { id: 's1', name: 'דפנה', extra: 'dropped' },
      assignee: { id: 'u1', firstName: 'עידן', lastName: 'מ', email: 'dropped' },
      expectedCompletionDate: '2026-09-30', createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-10T00:00:00Z',
      raw: 'dropped',
    })).toEqual({
      id: '1', title: 't', description: 'd', status: 'open', priority: 'normal', type: 'fault',
      site: { id: 's1', name: 'דפנה' },
      assignee: { id: 'u1', firstName: 'עידן', lastName: 'מ' },
      expectedCompletionDate: '2026-09-30', createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-10T00:00:00Z',
    });
  });

  it('snake_case timestamps — the fallback the legacy readers had', () => {
    const t = mapTask({ id: 'x', created_at: 'C', updated_at: 'U' });
    expect([t.createdAt, t.updatedAt]).toEqual(['C', 'U']);
  });

  it('a task with no site / no assignee keeps them null (not an empty object)', () => {
    const t = mapTask({ id: 'x' });
    expect(t.site).toBeNull();
    expect(t.assignee).toBeNull();
    expect(t.title).toBe('');
  });

  it('a meter — all three spellings of the energy code', () => {
    expect(mapMeter({ id: 1, energy_type_code: 3 }).energyCode).toBe('3');
    expect(mapMeter({ id: 1, energyTypeCode: 2 }).energyCode).toBe('2');
    expect(mapMeter({ id: 1, energyType: { code: 1 } }).energyCode).toBe('1');
  });

  it('a site, a user, a comment', () => {
    expect(mapSite({ id: 9, name: 'גבים' })).toEqual({ id: '9', name: 'גבים' });
    expect(mapUser({ id: 'u', firstName: 'א', lastName: 'ב' })).toEqual({ id: 'u', firstName: 'א', lastName: 'ב', name: 'א ב' });
    expect(mapComment({ id: 'c', message: 'm', createdAt: 'T', author: { firstName: 'א', lastName: 'ב' } }))
      .toEqual({ id: 'c', message: 'm', createdAt: 'T', author: 'א ב' });
  });
});

describe('operations', () => {
  it('listMeters hits the golden URL and returns mapped meters', async () => {
    const { gw, paths } = fake({ emsApi: vi.fn(async () => ({ data: [{ id: 'm1', energy_type_code: 3 }] })) });
    const out = await gw.listMeters('s1');
    expect(paths()[0]).toBe(URLS.meters('s1'));
    expect(out[0].energyCode).toBe('3');
  });

  it('listOpenTasks passes the query through the golden builder', async () => {
    const { gw, paths } = fake();
    await gw.listOpenTasks({ siteId: 's1', take: 100 });
    expect(paths()[0]).toBe('/employee-tasks?siteId=s1&statuses=open,in_progress,pending&take=100');
  });

  it('getTask / getMeter return null for an empty body instead of an empty object', async () => {
    const { gw } = fake({ emsApi: vi.fn(async () => null) });
    expect(await gw.getTask('t1')).toBeNull();
    expect(await gw.getMeter('m1')).toBeNull();
  });

  it('listSites reuses the legacy cached site list — no second /sites request', async () => {
    const { gw, paths } = fake();
    expect(await gw.listSites()).toEqual([{ id: 's1', name: 'דפנה' }]);
    expect(paths().length).toBe(0);
  });

  it('every WRITE goes through the offline queue, never a direct request', async () => {
    const { gw, writes, paths } = fake();
    await gw.createTask({ title: 'כותרת', kibbutz: 'דפנה' });
    await gw.updateTask('t1', { status: 'done' });
    await gw.addComment('t1', 'שלום');
    expect(paths().length).toBe(0);
    expect(writes).toEqual([
      { kind: 'createTask', title: 'כותרת', kibbutz: 'דפנה' },
      { kind: 'patch', taskId: 't1', patch: { status: 'done' } },
      { kind: 'comment', taskId: 't1', message: 'שלום' },
    ]);
  });

  it('a write result is passed back untouched (the queue contract is unchanged)', async () => {
    const { gw } = fake({ emsWrite: vi.fn(async () => ({ sent: false, queued: true, queueId: 'q7' })) });
    expect(await gw.createTask({ title: 'x' })).toEqual({ sent: false, queued: true, queueId: 'q7' });
  });
});

describe('capabilities — no purposeless buttons (spec 7o)', () => {
  it('REST answers true for what the API has and false for the three it does not', () => {
    expect(REST_CAPABILITIES).toEqual({
      listSites: true, listMeters: true, getMeter: true,
      listOpenTasks: true, getTask: true, createTask: true, updateTask: true,
      listComments: true, addComment: true, listUsers: true,
      listAlerts: false, energyBalance: false, billingSummary: false,
    });
  });

  it('capabilities() hands back a COPY — a caller cannot switch an operation on', () => {
    const { gw } = fake();
    const caps = gw.capabilities();
    caps.listAlerts = true;
    expect(gw.capabilities().listAlerts).toBe(false);
  });

  it('the unsupported three resolve null rather than throwing on an overview screen', async () => {
    const { gw } = fake();
    expect(await gw.listAlerts('s1')).toBeNull();
    expect(await gw.energyBalance('s1', '2026-09')).toBeNull();
    expect(await gw.billingSummary('s1', '2026-09')).toBeNull();
  });

  it('transport is named, so a report can say which adapter answered', () => {
    expect(fake().gw.transport).toBe('rest');
  });
});
