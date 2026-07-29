import { scrapeAirbnb } from './airbnb.js';
import { scrapeBooking } from './booking.js';
import { scrapeGeneric } from './generic.js';

export function detectPlatform(url) {
  const normalized = String(url || '').toLowerCase();

  if (normalized.includes('airbnb.')) return 'airbnb';
  if (normalized.includes('booking.com')) return 'booking';
  return 'generic';
}

export async function scrapeListing(page, url) {
  const platform = detectPlatform(url);

  switch (platform) {
    case 'airbnb':
      return scrapeAirbnb(page);
    case 'booking':
      return scrapeBooking(page);
    default:
      return scrapeGeneric(page);
  }
}
