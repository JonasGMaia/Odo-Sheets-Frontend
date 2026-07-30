/** Shared parsing helpers for all platforms */

export function parsePrice(raw) {
  if (!raw) return null;
  const text = String(raw).trim();
  if (!text) return null;

  // Brazilian: R$ 1.234,56  |  US: $1,234.56
  const brMatch = text.match(/(?:R\$|\$)\s*([\d.\s]+,\d{2}|\d+(?:\.\d{3})*(?:,\d{2})?)/);
  if (brMatch) {
    const normalized = brMatch[1].replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
    const value = parseFloat(normalized);
    return Number.isFinite(value) ? value : null;
  }

  const usMatch = text.match(/\$\s*([\d,]+(?:\.\d{2})?)/);
  if (usMatch) {
    const normalized = usMatch[1].replace(/,/g, '');
    const value = parseFloat(normalized);
    return Number.isFinite(value) ? value : null;
  }

  const digits = text.replace(/[^\d,]/g, '').replace(',', '.');
  const fallback = parseFloat(digits);
  return Number.isFinite(fallback) ? fallback : null;
}

/**
 * Detects strikethrough prices in the DOM and returns the actual (non-struck) price.
 * Prefers prices that are near struck-through prices (indicating a discount pattern).
 * @param {Page} page - Playwright page object
 * @returns {Promise<number|null>} The actual price, or null if not found
 */
export async function findActualPriceWithStrikethrough(page) {
  try {
    const result = await page.evaluate(() => {
      const pricePattern = /(?:R\$|\$|€|£)\s*[\d.,\s]+/;
      const allPrices = [];

      // Helper to check if an element has strikethrough styling
      const hasStrikethrough = (el) => {
        const computed = window.getComputedStyle(el);
        const textDecoration = computed.textDecoration || '';
        const textDecorationLine = computed.textDecorationLine || '';
        const hasStrike =
          textDecoration.includes('line-through') ||
          textDecorationLine.includes('line-through');

        // Also check for s, del, strike tags
        return (
          hasStrike ||
          el.tagName === 'S' ||
          el.tagName === 'DEL' ||
          el.tagName === 'STRIKE'
        );
      };

      // Helper to find if price is inside a strikethrough parent
      const isInStrikethroughParent = (el) => {
        let parent = el.parentElement;
        let depth = 0;
        while (parent && depth < 5) {
          if (hasStrikethrough(parent)) return true;
          parent = parent.parentElement;
          depth++;
        }
        return false;
      };

      // 1. Find text nodes containing prices
      const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT,
        null,
        false
      );

      let node;
      while (node = walker.nextNode()) {
        if (pricePattern.test(node.textContent)) {
          const parent = node.parentElement;
          const priceText = node.textContent.trim();
          const isStrike = hasStrikethrough(parent) || isInStrikethroughParent(parent);

          allPrices.push({
            text: priceText,
            isStrikethrough: isStrike,
            element: parent,
            distance: 0, // Will be calculated below
          });
        }
      }

      if (allPrices.length === 0) return null;

      // 2. Calculate proximity bonus: prices near struck prices are more likely actual prices
      const strikeIndices = allPrices
        .map((p, i) => p.isStrikethrough ? i : -1)
        .filter(i => i !== -1);

      allPrices.forEach((price, idx) => {
        // Find closest strikethrough price
        if (strikeIndices.length > 0) {
          const minDistance = Math.min(
            ...strikeIndices.map(strikeIdx => Math.abs(strikeIdx - idx))
          );
          price.distance = minDistance;
        }
      });

      // 3. Filter and score:
      // Priority 1: Non-struck prices near struck prices (score: high)
      // Priority 2: Non-struck prices anywhere (score: medium)
      // Priority 3: First struck price if no others (fallback)

      let candidates = allPrices.filter(p => !p.isStrikethrough);

      if (candidates.length === 0) {
        // Fallback: return first struck price (better than nothing)
        candidates = allPrices;
      }

      // Sort by: distance to strikethrough (ascending), then by position in DOM
      candidates.sort((a, b) => {
        if (a.distance !== b.distance) {
          return a.distance - b.distance; // Closer to strikethrough first
        }
        return 0; // Keep DOM order for same distance
      });

      return candidates[0]?.text || null;
    });

    if (!result) return null;
    return parsePrice(result);
  } catch (error) {
    console.error('Error finding actual price with strikethrough:', error);
    return null;
  }
}

/**
 * Extracts all prices from the page and returns the most likely actual price.
 * Combines strikethrough detection with fallback strategies.
 * @param {Page} page - Playwright page object
 * @param {string[]} selectors - Optional specific selectors to check
 * @returns {Promise<number|null>} The actual price
 */
export async function extractPriceFromDomAdvanced(page, selectors = []) {
  // First try strikethrough detection
  const strikethroughPrice = await findActualPriceWithStrikethrough(page);
  if (strikethroughPrice !== null) {
    return strikethroughPrice;
  }

  // Fallback to simple selector search if provided
  if (selectors.length > 0) {
    for (const selector of selectors) {
      try {
        const locator = page.locator(selector).first();
        if (await locator.count()) {
          const text = await locator.innerText({ timeout: 2000 }).catch(() => '');
          const price = parsePrice(text);
          if (price !== null) return price;
        }
      } catch (error) {
        // Continue to next selector
      }
    }
  }

  return null;
}

export function extractFirstNumber(text, patterns) {
  if (!text) return null;
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      const value = parseInt(match[1], 10);
      if (Number.isFinite(value)) return value;
    }
  }
  return null;
}

export function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function hasAmenityMatch(amenityTexts, positivePatterns, negativePatterns = []) {
  const haystack = normalizeText(amenityTexts.join(' '));

  for (const pattern of negativePatterns) {
    if (pattern.test(haystack)) return false;
  }

  return positivePatterns.some((pattern) => pattern.test(haystack));
}

export function detectParking(amenityTexts, overviewText = '') {
  const haystack = normalizeText([overviewText, ...amenityTexts].join(' '));

  const parkingPatterns = [
    /\bestacionamento\b/,
    /\bfree parking\b/,
    /\bparking (on|at|space|included|available)\b/,
    /\bgaragem\b/,
    /\bgarage\b/,
    /\bvaga(?:s)? de estacionamento\b/,
    /\bestacionamento (gratuito|incluso|privado|no local)\b/,
    /\bprivate parking\b/,
    /\bcovered parking\b/,
    /\bon-site parking\b/,
  ];

  const negativePatterns = [
    /\bsem estacionamento\b/,
    /\bno parking\b/,
    /\bestacionamento nao disponivel\b/,
    /\bparking not available\b/,
  ];

  for (const pattern of negativePatterns) {
    if (pattern.test(haystack)) return null;
  }

  if (!parkingPatterns.some((pattern) => pattern.test(haystack))) {
    return null;
  }

  const countMatch = haystack.match(/(\d+)\s*(vagas? de estacionamento|parking spaces?|garage spaces?)/);
  if (countMatch) return parseInt(countMatch[1], 10);

  return 1;
}

export function buildAmenityFlags(amenityTexts) {
  return {
    wifi: hasAmenityMatch(amenityTexts, [
      /\bwi-?fi\b/,
      /\bwireless internet\b/,
      /\binternet (wireless|wifi)\b/,
      /\binternet de alta velocidade\b/,
    ], [
      /\bsem wi-?fi\b/,
      /\bno wi-?fi\b/,
    ]),
    tv: hasAmenityMatch(amenityTexts, [
      /\b(?:smart )?tv\b/,
      /\btelevis(?:ao|ao)\b/,
      /\bcable tv\b/,
      /\bstreaming services?\b/,
      /\bnetflix\b/,
    ], [
      /\b(?:ativa|motivacao|privativa|relativa|negativa)\b/,
    ]),
    air_conditioning: hasAmenityMatch(amenityTexts, [
      /\bar[- ]condicionado\b/,
      /\bair conditioning\b/,
      /\bcentral air\b/,
      /\bac unit\b/,
      /\bar condicionado\b/,
    ]),
    kitchen: hasAmenityMatch(amenityTexts, [
      /\bcozinha(?: completa| equipada)?\b/,
      /\bkitchen(?:ette)?\b/,
      /\bcozinha compartilhada\b/,
      /\bshared kitchen\b/,
    ], [
      /\bsem cozinha\b/,
      /\bno kitchen\b/,
    ]),
    petfriendly: hasAmenityMatch(amenityTexts, [
      /\bpermite(?:m)? animais\b/,
      /\baceita(?:m)? pets\b/,
      /\banimais de estimacao permitidos\b/,
      /\bpet(?:s)? allowed\b/,
      /\bpet[- ]friendly\b/,
      /\bdog(?:s)? allowed\b/,
    ], [
      /\bnao permite(?:m)? animais\b/,
      /\bno pets\b/,
      /\bpets not allowed\b/,
    ]),
    parking: detectParking(amenityTexts),
  };
}
