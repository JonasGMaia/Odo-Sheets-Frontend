import {
  buildAmenityFlags,
  detectParking,
  extractFirstNumber,
  parsePrice,
  extractPriceFromDomAdvanced,
} from './utils.js';

async function dismissCookieBanner(page) {
  const buttons = [
    page.getByRole('button', { name: /aceitar|accept|concordo|agree/i }).first(),
    page.locator('#onetrust-accept-btn-handler'),
  ];

  for (const button of buttons) {
    if (!(await button.count())) continue;
    if (!(await button.isVisible().catch(() => false))) continue;
    await button.click({ timeout: 2000 }).catch(() => {});
    await page.waitForTimeout(500);
    break;
  }
}

async function extractOverviewText(page) {
  const selectors = [
    '[data-testid="property-page-room-summary"]',
    '[data-testid="property-header"]',
    '.hp__hotel-title',
    '#hp_hotel_name',
    'h2.pp-header__title',
  ];

  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    if (!(await locator.count())) continue;
    const text = (await locator.innerText({ timeout: 2000 }).catch(() => '')).trim();
    if (text) return text;
  }

  return '';
}

async function extractAmenitySectionTexts(page) {
  const selectors = [
    '[data-testid="property-facilities"]',
    '[data-testid="property-most-popular-facilities"]',
    '#hp_facilities_box',
    '.property_highlights',
    '[data-capla-component="PropertyFacilities"]',
  ];

  const texts = new Set();

  for (const selector of selectors) {
    const section = page.locator(selector).first();
    if (!(await section.count())) continue;

    const sectionText = await section.innerText({ timeout: 2000 }).catch(() => '');
    if (sectionText) texts.add(sectionText);

    const items = section.locator('li, span, div[aria-label]');
    const count = Math.min(await items.count(), 120);
    for (let i = 0; i < count; i += 1) {
      const itemText = (await items.nth(i).innerText({ timeout: 500 }).catch(() => '')).trim();
      if (itemText && itemText.length < 120) texts.add(itemText);
    }
  }

  return [...texts];
}

async function extractPriceFromDom(page) {
  const selectors = [
    '[data-testid="price-and-discounted-price"]',
    '.prco-valign-middle-helper',
    '#hprt-table [data-testid="price-for-x-nights"]',
    '.bui-price-display__value',
    '[data-component="hotel/new-rooms-table/price"]',
  ];

  // First try advanced strikethrough detection
  const advancedPrice = await extractPriceFromDomAdvanced(page, selectors);
  if (advancedPrice !== null) {
    return advancedPrice;
  }

  // Fallback to original selector-based approach
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    if (!(await locator.count())) continue;
    const text = await locator.innerText({ timeout: 2000 }).catch(() => '');
    const price = parsePrice(text);
    if (price != null) return price;
  }

  return null;
}

function parseBookingCounts(overviewText, pageText) {
  const combined = `${overviewText}\n${pageText}`;
  return {
    bedrooms: extractFirstNumber(combined, [
      /(\d+)\s*(?:quartos?|bedrooms?|bedroom|dormitorios?)\b/i,
    ]),
    beds: extractFirstNumber(combined, [
      /(\d+)\s*(?:camas?|beds?|bed)\b/i,
    ]),
    bathrooms: extractFirstNumber(combined, [
      /(\d+(?:[.,]\d+)?)\s*(?:banheiros?|bathrooms?|bathroom)\b/i,
    ]),
  };
}

export async function scrapeBooking(page) {
  await dismissCookieBanner(page);
  await page.waitForSelector('h1, h2, #hp_hotel_name', { timeout: 20000 }).catch(() => {});

  const overviewText = await extractOverviewText(page);
  const amenityTexts = await extractAmenitySectionTexts(page);
  const pageText = await page.locator('main, #basiclayout, body').first().innerText({ timeout: 5000 }).catch(() => '');
  const counts = parseBookingCounts(overviewText, pageText);
  const amenityFlags = buildAmenityFlags(amenityTexts);

  const title =
    (await page.locator('h2.pp-header__title, #hp_hotel_name, h1').first().innerText({ timeout: 3000 }).catch(() => null)) ||
    overviewText ||
    'Título não encontrado';

  return {
    title,
    price: await extractPriceFromDom(page),
    bedrooms: counts.bedrooms,
    beds: counts.beds,
    bathrooms: counts.bathrooms,
    wifi: amenityFlags.wifi,
    tv: amenityFlags.tv,
    air_conditioning: amenityFlags.air_conditioning,
    kitchen: amenityFlags.kitchen,
    petfriendly: amenityFlags.petfriendly,
    parking: amenityFlags.parking ?? detectParking(amenityTexts, overviewText),
  };
}
