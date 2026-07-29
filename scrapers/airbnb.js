import {
  buildAmenityFlags,
  detectParking,
  extractFirstNumber,
  parsePrice,
} from './utils.js';

const OVERVIEW_PATTERNS = {
  bedrooms: [
    /(\d+)\s*(?:quartos?|bedrooms?|bedroom|dormitorios?|dormitorio|comodos?)\b/i,
    /(\d+)\s*(?:br)\b/i,
  ],
  beds: [
    /(\d+)\s*(?:camas?|beds?|bed)\b/i,
  ],
  bathrooms: [
    /(\d+(?:[.,]\d+)?)\s*(?:banheiros?|bathrooms?|bathroom|casas de banho|wc)\b/i,
  ],
};

function parseOverviewCounts(overviewText) {
  const text = overviewText || '';
  const bathroomsRaw = extractFirstNumber(text, OVERVIEW_PATTERNS.bathrooms);
  return {
    bedrooms: extractFirstNumber(text, OVERVIEW_PATTERNS.bedrooms),
    beds: extractFirstNumber(text, OVERVIEW_PATTERNS.beds),
    bathrooms: bathroomsRaw != null ? Math.ceil(bathroomsRaw) : null,
  };
}

async function extractJsonPayloads(page) {
  return page.evaluate(() => {
    const payloads = [];

    for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
      try {
        payloads.push(JSON.parse(script.textContent || ''));
      } catch {
        // ignore malformed JSON-LD
      }
    }

    for (const script of document.querySelectorAll('script[type="application/json"]')) {
      const content = script.textContent || '';
      if (
        content.includes('amenities') ||
        content.includes('listingAmenities') ||
        content.includes('bedroom') ||
        content.includes('bathroom')
      ) {
        try {
          payloads.push(JSON.parse(content));
        } catch {
          // ignore malformed embedded JSON
        }
      }
    }

    return payloads;
  });
}

function collectStringsDeep(value, bucket = []) {
  if (typeof value === 'string' && value.trim().length > 1) {
    bucket.push(value.trim());
    return bucket;
  }

  if (Array.isArray(value)) {
    for (const item of value) collectStringsDeep(item, bucket);
    return bucket;
  }

  if (value && typeof value === 'object') {
    for (const item of Object.values(value)) collectStringsDeep(item, bucket);
  }

  return bucket;
}

function extractAmenitiesFromPayloads(payloads) {
  const amenityTexts = new Set();

  const walk = (node) => {
    if (!node || typeof node !== 'object') return;

    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }

    for (const [key, value] of Object.entries(node)) {
      const normalizedKey = key.toLowerCase();

      if (
        normalizedKey.includes('amenity') ||
        normalizedKey.includes('amenities') ||
        normalizedKey === 'title' && typeof value === 'string' && value.length < 80
      ) {
        if (typeof value === 'string') amenityTexts.add(value);
        if (Array.isArray(value)) {
          for (const item of value) {
            if (typeof item === 'string') amenityTexts.add(item);
            if (item?.title) amenityTexts.add(String(item.title));
            if (item?.name) amenityTexts.add(String(item.name));
          }
        }
      }

      walk(value);
    }
  };

  for (const payload of payloads) walk(payload);
  return [...amenityTexts];
}

function extractTitleFromPayloads(payloads) {
  for (const payload of payloads) {
    if (payload?.name && typeof payload.name === 'string') return payload.name.trim();
    if (payload?.['@type'] === 'LodgingBusiness' && payload?.name) return payload.name.trim();
  }
  return null;
}

function extractPriceFromPayloads(payloads) {
  for (const payload of payloads) {
    const offer = payload?.offers || payload?.priceSpecification;
    if (offer?.price) return parsePrice(String(offer.price));
    if (payload?.priceRange) return parsePrice(String(payload.priceRange));
  }
  return null;
}

async function extractOverviewText(page) {
  const selectors = [
    '[data-section-id="OVERVIEW_DEFAULT_V2"]',
    '[data-section-id="OVERVIEW_DEFAULT"]',
    '[data-testid="listing-subtitle"]',
    'h1 + div',
    'h1 ~ div',
  ];

  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    if (await locator.count()) {
      const text = (await locator.innerText({ timeout: 1500 }).catch(() => '')).trim();
      if (text) return text;
    }
  }

  return '';
}

async function extractAmenitySectionTexts(page) {
  const selectors = [
    '[data-section-id="AMENITIES_DEFAULT"]',
    '[data-section-id="AMENITIES"]',
    '[data-testid="amenities-section"]',
    '[aria-label*="Comodidades"]',
    '[aria-label*="Amenities"]',
  ];

  const texts = new Set();

  for (const selector of selectors) {
    const section = page.locator(selector).first();
    if (!(await section.count())) continue;

    const sectionText = await section.innerText({ timeout: 2000 }).catch(() => '');
    if (sectionText) texts.add(sectionText);

    const items = section.locator('li, div[aria-label], span');
    const count = Math.min(await items.count(), 120);
    for (let i = 0; i < count; i += 1) {
      const itemText = (await items.nth(i).innerText({ timeout: 500 }).catch(() => '')).trim();
      if (itemText && itemText.length < 120) texts.add(itemText);
    }
  }

  return [...texts];
}

async function openAmenitiesModal(page) {
  const buttons = [
    page.getByRole('button', { name: /mostrar todas as comodidades|show all amenities|todas as comodidades/i }).first(),
    page.locator('[data-testid="amenities-expand"]'),
    page.locator('button:has-text("comodidades")').first(),
    page.locator('button:has-text("amenities")').first(),
  ];

  for (const button of buttons) {
    if (!(await button.count())) continue;
    if (!(await button.isVisible().catch(() => false))) continue;

    await button.click({ timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(1500);
    break;
  }
}

async function extractPriceFromDom(page) {
  const selectors = [
    '[data-testid="book-it-default"] span[aria-hidden="true"]',
    '[data-testid="book-it-default"]',
    '[data-testid="price-summary"]',
    'button:has-text("Reservar")',
    'button:has-text("Reserve")',
    '[data-section-id="BOOK_IT_SIDEBAR"]',
  ];

  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    if (!(await locator.count())) continue;

    const text = await locator.innerText({ timeout: 2000 }).catch(() => '');
    const price = parsePrice(text);
    if (price != null) return price;
  }

  return null;
}

export async function scrapeAirbnb(page) {
  await page.waitForSelector('h1', { timeout: 20000 }).catch(() => {});

  const payloads = await extractJsonPayloads(page);
  const overviewText = await extractOverviewText(page);

  await openAmenitiesModal(page);

  const amenitySectionTexts = await extractAmenitySectionTexts(page);
  const amenityPayloadTexts = extractAmenitiesFromPayloads(payloads);
  const amenityTexts = [...new Set([...amenitySectionTexts, ...amenityPayloadTexts])];

  const overviewCounts = parseOverviewCounts(overviewText);
  const amenityFlags = buildAmenityFlags(amenityTexts);

  return {
    title:
      (await page.locator('h1').first().innerText({ timeout: 3000 }).catch(() => null)) ||
      extractTitleFromPayloads(payloads) ||
      'Título não encontrado',
    price: extractPriceFromPayloads(payloads) ?? (await extractPriceFromDom(page)),
    bedrooms: overviewCounts.bedrooms,
    beds: overviewCounts.beds,
    bathrooms: overviewCounts.bathrooms,
    wifi: amenityFlags.wifi,
    tv: amenityFlags.tv,
    air_conditioning: amenityFlags.air_conditioning,
    kitchen: amenityFlags.kitchen,
    petfriendly: amenityFlags.petfriendly,
    parking: amenityFlags.parking ?? detectParking(amenityTexts, overviewText),
  };
}
