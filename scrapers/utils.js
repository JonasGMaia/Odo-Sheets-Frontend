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
