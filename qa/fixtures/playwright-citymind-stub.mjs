// A stand-in for `playwright` (PLAYWRIGHT_MODULE) for test-citymind-arad.mjs: no browser, no network.
// Login succeeds only for the password 'good-pass'; the export returns the FAKE fixture (base64) or STUB_EXPORT_FILE.
import { readFileSync } from 'node:fs';

const file = process.env.STUB_EXPORT_FILE || new URL('./citymind-ein-hamifratz-fake.csv', import.meta.url);
export const firefox = {
  async launch() {
    let pass = '';
    const page = {
      goto: async () => ({ status: () => 200 }),
      waitForSelector: async () => ({}),
      title: async () => 'CityMind',
      fill: async (sel, v) => { if (/Password/.test(sel)) pass = v; },
      click: async () => {},
      waitForURL: async () => { if (pass !== 'good-pass') throw new Error('timeout https://example/secret?x=1'); },
      waitForFunction: async () => true,
      evaluate: async () => [true, readFileSync(file).toString('base64')],
    };
    return { newPage: async () => page, close: async () => {} };
  },
};
