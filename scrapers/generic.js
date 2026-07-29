import {
  buildAmenityFlags,
  detectParking,
  extractFirstNumber,
  parsePrice,
} from './utils.js';

async function extractLikelyAmenitySections(page) {
  const selectors = [
    '[class*="amenit" i]',
    '[id*="amenit" i]',
    '[class*="facilit" i]',
    '[data-testid*="amenit" i]',
    '[data-testid*="facilit" i]',
    'section:has-text("Comodidades")',
    'section:has-text("Amenities")',
    'section:has-text("Facilities")',
  ];

  const texts = new Set();

  for (const selector of selectors) {
    const section = page.locator(selector).first();
    if (!(await section.count())) continue;

    const sectionText = await section.innerText({ timeout: 1500 }).catch(() => '');
    if (sectionText && sectionText.length < 5000) texts.add(sectionText);
  }

  return [...texts];
}

export async function scrapeGeneric(page) {
  await page.waitForSelector('h1', { timeout: 15000 }).catch(() => {});

  const overviewText = (await page.locator('h1').first().innerText({ timeout: 3000 }).catch(() => '')).trim();
  const amenityTexts = await extractLikelyAmenitySections(page);
  const pageText = await page.locator('main, body').first().innerText({ timeout: 5000 }).catch(() => '');
  const amenityFlags = buildAmenityFlags(amenityTexts.length ? amenityTexts : [pageText.slice(0, 8000)]);

  const priceMatch = pageText.match(/(?:R\$|\$)\s*[\d.,\s]+/);
  const countsText = `${overviewText}\n${pageText.slice(0, 3000)}`;

  return {
    title: overviewText || 'Título não encontrado',
    price: priceMatch ? parsePrice(priceMatch[0]) : null,
    bedrooms: extractFirstNumber(countsText, [/(\d+)\s*(?:quartos?|bedrooms?|bedroom)\b/i]),
    beds: extractFirstNumber(countsText, [/(\d+)\s*(?:camas?|beds?|bed)\b/i]),
    bathrooms: extractFirstNumber(countsText, [/(\d+(?:[.,]\d+)?)\s*(?:banheiros?|bathrooms?|bathroom)\b/i]),
    wifi: amenityFlags.wifi,
    tv: amenityFlags.tv,
    air_conditioning: amenityFlags.air_conditioning,
    kitchen: amenityFlags.kitchen,
    petfriendly: amenityFlags.petfriendly,
    parking: amenityFlags.parking ?? detectParking(amenityTexts, countsText),
  };
}
