// Q7-C item 10: the design-system gallery (`/?gallery=1`) is an internal screen — עידן only.
// Mock mode (`?sb=0`, what the Playwright sign-off runs use) is a test environment with no real
// user, so it stays open there; on a real session anyone else falls through to the normal home.
export function canOpenGallery(user: string, mock: boolean): boolean {
  return mock || String(user ?? '').trim() === 'עידן';
}
