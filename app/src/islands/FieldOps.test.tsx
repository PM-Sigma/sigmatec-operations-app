// @vitest-environment jsdom
// פעולות שטח — render goldens for each state: list read (G1), [null] (G14), error array (G13),
// timeout, manual 0 / 1 / several matches, the viewer gate.
import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { EmsModbusMeter, ModbusOpResult } from '@/lib/ems/types';

afterEach(cleanup);

const { st, gw } = vi.hoisted(() => ({
  st: { allowed: true },
  gw: {
    listSites: vi.fn(async () => [{ id: 'site-1', name: 'קיבוץ דוגמה' }]),
    modbusMeters: vi.fn(async (_s: string): Promise<any[]> => []),
    modbusLookup: vi.fn(async (_ip: string): Promise<any[]> => []),
    modbusRead: vi.fn(async (_t: any): Promise<any> => ({})),
    modbusPing: vi.fn(async (_t: any): Promise<any> => ({})),
    meterOpsHistory: vi.fn(async (_id: string) => []),
  },
}));

vi.mock('@/bridge', () => ({ sigma: { canShowPage: () => st.allowed, getCurrentUser: () => 'עידן' } }));
vi.mock('@/islands', () => ({ mount: vi.fn(() => true) }));
vi.mock('@/components/EmsGate', () => ({ EmsGate: ({ children }: any) => <>{children}</> }));
vi.mock('@/lib/canShowPage', () => ({ canShowPage: () => st.allowed }));
vi.mock('@/lib/ems/gateway', () => ({ emsGateway: () => gw }));

import { FieldOps } from '@/islands/FieldOps';

const meter = (id: string, ip: string, unit: number, o: Partial<EmsModbusMeter> = {}): EmsModbusMeter => ({
  id, serial: '1672005', address: 'רפת', siteId: 'site-1', siteName: 'קיבוץ דוגמה', ip, unit, typeCode: 12,
  typeName: 'Satec PM135', cm: 1, vm: 1, pm: 1, typePm: 1, lastCallDate: null, ...o,
});
const log = (responseData: unknown, o: any = {}) => ({
  id: 'L1', operationCode: 'modbus_read', status: 'completed', responseData, errorMessage: '',
  createdAt: '2026-09-27T10:00:00Z', completedAt: '2026-09-27T10:00:04Z', executedBy: 'עידן', ...o,
});
const G1 = [{ CounterNumber: '1672005', FT: 169404, V1: 235, V2: 234, V3: 234, I1: 166, I2: 139, I3: 113, PF: 1000, CT_Ratio: 0 }];

beforeEach(() => {
  st.allowed = true;
  for (const f of Object.values(gw)) (f as any).mockClear();
  gw.modbusMeters.mockResolvedValue([meter('m1', '192.0.2.10', 1)]);
  gw.modbusLookup.mockResolvedValue([]);
});

async function pickListMeter() {
  render(<FieldOps />);
  const site = await screen.findByLabelText('בחר קיבוץ *');
  await waitFor(() => expect(within(site).getByText('קיבוץ דוגמה')).toBeTruthy());
  fireEvent.change(site, { target: { value: 'site-1' } });
  const sel = await screen.findByLabelText('בחר מונה');
  await waitFor(() => expect(within(sel).getByText(/192\.0\.2\.10/)).toBeTruthy());
  fireEvent.change(sel, { target: { value: 'm1' } });
}
const read = () => fireEvent.click(screen.getByRole('button', { name: /בדוק חיבור וקרא נתונים/ }));

describe('FieldOps — list mode', () => {
  it('G1: reads by meterId only and renders the scaled rows, PF 1.000, kW', async () => {
    gw.modbusRead.mockResolvedValue({ meter: meter('m1', '192.0.2.10', 1), override: [], log: log(G1) } as ModbusOpResult);
    await pickListMeter();
    expect(screen.getByTestId('fieldops-picked').textContent).toContain('מ-EMS');
    read();
    const card = await screen.findByTestId('fieldops-read');
    expect(gw.modbusRead).toHaveBeenCalledWith({ meterId: 'm1' });
    const row = (k: string) => card.querySelector(`[data-row="${k}"]`)!.textContent;
    expect(row('FT')).toContain('169,404 kWh');
    expect(row('PF')).toContain('1.000');
    expect(row('kW')).toContain('97.98 kW');
    expect(card.textContent).toContain('הצלחה');
    expect(card.textContent).toContain('4000ms');
    expect(card.textContent).toContain('13:00:04');
    await waitFor(() => expect(gw.meterOpsHistory).toHaveBeenCalledWith('m1'));
  });
  it('G14 [null]: the wrong-type sentence, no rows', async () => {
    gw.modbusRead.mockResolvedValue({ meter: meter('m1', '192.0.2.10', 1), override: [], log: log([null]) });
    await pickListMeter();
    read();
    const err = await screen.findByTestId('fieldops-error');
    expect(err.textContent).toContain('המונה לא החזיר נתונים — ייתכן שסוג המונה ב-EMS שגוי');
    expect(screen.queryByTestId('fieldops-rows')).toBeNull();
    expect(screen.getByTestId('fieldops-read').textContent).toContain('נכשל');
  });
  it('G13 error array: Detail + the auto-poll hint', async () => {
    gw.modbusRead.mockResolvedValue({ meter: null, override: [], log: log([{ Error: true, Detail: 'Connection timeout: No response from device' }]) });
    await pickListMeter();
    read();
    const err = await screen.findByTestId('fieldops-error');
    expect(err.textContent).toContain('Connection timeout');
    expect(err.textContent).toContain('נסה שוב בעוד דקה');
  });
  it('timeout (thrown): a clear sentence', async () => {
    gw.modbusRead.mockRejectedValue(Object.assign(new Error('timeout'), { code: 'timeout' }));
    await pickListMeter();
    read();
    expect((await screen.findByTestId('fieldops-message')).textContent).toContain('לא ענה בזמן');
  });
  it('no meter picked → validation, no call', async () => {
    render(<FieldOps />);
    read();
    expect((await screen.findByTestId('fieldops-message')).textContent).toContain('נא לבחור קיבוץ ומונה');
    expect(gw.modbusRead).not.toHaveBeenCalled();
  });
});

describe('FieldOps — manual mode status (0 / 1 / several)', () => {
  async function typeIp(ip: string, unit = '') {
    render(<FieldOps />);
    fireEvent.click(screen.getByRole('radio', { name: 'הזנה ידנית' }));
    fireEvent.change(screen.getByLabelText('כתובת IP *'), { target: { value: ip } });
    if (unit) fireEvent.change(screen.getByLabelText('מספר ID'), { target: { value: unit } });
    return screen.findByTestId('fieldops-ip-status', {}, { timeout: 2000 });
  }
  it('0 matches: "not registered", no table; read needs a type; with a type it reads through the override', async () => {
    const s = await typeIp('192.0.2.99', '4');
    expect(s.textContent).toContain('ה-IP הזה לא מוקם ב-EMS — המונה לא רשום');
    expect(s.textContent).toContain('אין ב-EMS מונה על ה-IP הזה עם ID 4');
    expect(screen.queryByTestId('fieldops-ip-table')).toBeNull();
    read();
    expect((await screen.findByTestId('fieldops-message')).textContent).toContain('נא לבחור סוג מונה');
    fireEvent.change(screen.getByLabelText('סוג מונה'), { target: { value: '25' } });
    gw.modbusRead.mockResolvedValue({ meter: null, override: ['meterIpAddress'], log: log([{ FT: 100, I1: 0.5 }]) });
    read();
    const card = await screen.findByTestId('fieldops-read');
    expect(gw.modbusRead).toHaveBeenCalledWith({ ip: '192.0.2.99', unit: 4, typeCode: 25 });
    expect(card.textContent).toContain('לא רשום ב-EMS');
  });
  it('1 match: status + a one-row table (kibbutz · meter · address)', async () => {
    gw.modbusLookup.mockResolvedValue([meter('m1', '192.0.2.10', 1)]);
    const s = await typeIp('192.0.2.10', '1');
    expect(s.textContent).toContain('ה-IP הזה מוביל למונה אחד ב-EMS');
    expect(s.textContent).toContain('המונה עם ID 1 רשום ב-EMS: 1672005 · רפת');
    const t = screen.getByTestId('fieldops-ip-table');
    expect(t.querySelectorAll('tbody tr').length).toBe(1);
    expect(t.textContent).toContain('קיבוץ דוגמה');
  });
  it('several matches: count + table rows', async () => {
    // A fresh IP: the island's query cache is per page, not per test.
    gw.modbusLookup.mockResolvedValue([meter('m1', '192.0.2.20', 1), meter('m2', '192.0.2.20', 2, { serial: '1672006' })]);
    const s = await typeIp('192.0.2.20');
    expect(s.textContent).toContain('ה-IP הזה מוביל ל-2 מונים ב-EMS');
    expect(screen.getByTestId('fieldops-ip-table').querySelectorAll('tbody tr').length).toBe(2);
  });
});

describe('FieldOps — gate', () => {
  it('renders nothing when canShowPage says no (viewer)', () => {
    st.allowed = false;
    const { container } = render(<FieldOps />);
    expect(container.querySelector('[data-testid="fieldops-page"]')).toBeNull();
  });
});
