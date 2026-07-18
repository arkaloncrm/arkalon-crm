// Pure, dependency-free text-matching helpers for the Command Bar tool layer.
// No DB, no network — safe to unit test directly.

// --- AU phone plausibility ---------------------------------------------

// AU mobiles are 10 digits starting '04' (e.g. 0414111222), or the same
// number written with a +61 country code (61 + 9 digits = 11 digits once the
// '+' and leading national 0 are stripped, e.g. +61414111222). This only
// checks length/shape plausibility — it does NOT verify the number is real.
function isPlausibleAuPhone(raw) {
  if (!raw) return false;
  const digits = String(raw).replace(/[^\d+]/g, '');
  const plusStripped = digits.startsWith('+') ? digits.slice(1) : digits;
  if (!/^\d+$/.test(plusStripped)) return false;

  if (plusStripped.length === 10 && plusStripped.startsWith('0')) return true;
  if (plusStripped.length === 11 && plusStripped.startsWith('61')) return true;
  return false;
}

// --- Name similarity ----------------------------------------------------

function bigrams(str) {
  const normalised = String(str).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const grams = [];
  for (let i = 0; i < normalised.length - 1; i++) grams.push(normalised.slice(i, i + 2));
  return grams;
}

// Sørensen–Dice coefficient over character bigrams — a simple, dependency-free
// stand-in for trigram/edit-distance similarity. Returns 0..1.
function diceCoefficient(a, b) {
  const gramsA = bigrams(a);
  const gramsB = bigrams(b);
  if (gramsA.length === 0 || gramsB.length === 0) {
    return gramsA.join('') === gramsB.join('') ? 1 : 0;
  }
  const remaining = new Map();
  for (const g of gramsB) remaining.set(g, (remaining.get(g) || 0) + 1);
  let matches = 0;
  for (const g of gramsA) {
    const count = remaining.get(g) || 0;
    if (count > 0) {
      matches += 1;
      remaining.set(g, count - 1);
    }
  }
  return (2 * matches) / (gramsA.length + gramsB.length);
}

function leadingWord(str) {
  return String(str).trim().toLowerCase().split(/\s+/)[0] || '';
}

function sharesLeadingWord(a, b) {
  const wordA = leadingWord(a);
  const wordB = leadingWord(b);
  return !!wordA && wordA === wordB;
}

// "Close enough that we should ask before creating a new record" — shares its
// first word (e.g. "Informa Group" / "Informa Australia") or scores >= threshold.
function isCloseMatch(a, b, threshold = 0.6) {
  if (!a || !b) return false;
  return sharesLeadingWord(a, b) || diceCoefficient(a, b) >= threshold;
}

module.exports = { isPlausibleAuPhone, diceCoefficient, sharesLeadingWord, isCloseMatch, leadingWord };
