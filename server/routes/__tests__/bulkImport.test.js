// Plain node:assert test script — no test runner dependency, matching the
// pattern in server/commandBar/__tests__/textMatch.test.js. Run with:
//   node server/routes/__tests__/bulkImport.test.js
const assert = require('assert');
const bulkImportRouter = require('../bulkImport');
const { classifyFields, parseRawText, splitName, extractPhone, normalisePhone, TITLE_RE } = bulkImportRouter;

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ok  - ${name}`);
  } catch (err) {
    console.error(`FAIL - ${name}`);
    console.error(`       ${err.message}`);
    process.exitCode = 1;
  }
}

// ---------------------------------------------------------------------------
// New: title routing (today's failure + the full required keyword list)
// ---------------------------------------------------------------------------
console.log('title routing');

test('exact failing row: Deel / T1 / Shannon Karaka / combined title / email', () => {
  const r = classifyFields(['Deel', 'T1', 'Shannon Karaka', 'Head of Expansion ANZ / Country Leader', 'shannon.karaka@deel.com']);
  assert.strictEqual(r.company, 'Deel');
  assert.strictEqual(r.first_name, 'Shannon');
  assert.strictEqual(r.last_name, 'Karaka');
  assert.strictEqual(r.title, 'Head of Expansion ANZ / Country Leader');
  assert.strictEqual(r.email, 'shannon.karaka@deel.com');
});

test('title never appended to last name — company/name/title/email/phone all separate', () => {
  const r = classifyFields(['Acme Pty Ltd', 'Jane Doe', 'General Manager', 'jane@acme.com', '0412345678']);
  assert.strictEqual(r.first_name, 'Jane');
  assert.strictEqual(r.last_name, 'Doe');
  assert.strictEqual(r.title, 'General Manager');
  assert.ok(!String(r.last_name).includes('Manager'), 'title leaked into last_name');
});

const TITLE_KEYWORDS = [
  ['Manager', 'Operations Manager'],
  ['Director', 'Marketing Director'],
  ['Head', 'Head of Sales'],
  ['Officer', 'Chief Financial Officer'],
  ['CEO', 'CEO'],
  ['Founder', 'Founder'],
  ['Co-founder', 'Co-founder'],
  ['VP', 'VP Growth'],
  ['President', 'President'],
  ['Lead', 'Team Lead'],
  ['Leader', 'Country Leader'],
  ['Coordinator', 'Event Coordinator'],
  ['Specialist', 'Marketing Specialist'],
  ['Executive', 'Account Executive'],
  ['GM', 'GM ANZ'],
  ['Chief', 'Chief of Staff'],
];
for (const [label, phrase] of TITLE_KEYWORDS) {
  test(`keyword "${label}" is recognised as a title ("${phrase}")`, () => {
    assert.ok(TITLE_RE.test(phrase), `expected TITLE_RE to match "${phrase}"`);
    const r = classifyFields(['Acme Co', 'Sam Lee', phrase, 'sam@acme.com']);
    assert.strictEqual(r.title, phrase);
    assert.strictEqual(r.first_name, 'Sam');
    assert.strictEqual(r.last_name, 'Lee');
  });
}

test('"Leader" alone (no "Head") is caught — \\blead\\b would miss it', () => {
  const r = classifyFields(['Acme Co', 'Pat Ng', 'Country Leader', 'pat@acme.com']);
  assert.strictEqual(r.title, 'Country Leader');
  assert.strictEqual(r.last_name, 'Ng');
});

test('leftover non-title fields beyond company+name still go to title, joined', () => {
  const r = classifyFields(['Acme Co', 'Sam Lee', 'Chief Growth Officer', 'APAC Region', 'sam@acme.com']);
  assert.strictEqual(r.title, 'Chief Growth Officer, APAC Region');
  assert.strictEqual(r.first_name, 'Sam');
  assert.strictEqual(r.last_name, 'Lee');
});

test('no title field present — title is null, not an empty string', () => {
  const r = classifyFields(['Acme Co', 'Jane Doe', 'jane@acme.com']);
  assert.strictEqual(r.title, null);
});

test('title-looking word inside an email/phone field is not misread as a title', () => {
  // "lead" appears nowhere here, but sanity-check emails/phones never enter `rest`.
  const r = classifyFields(['Acme Co', 'Jane Doe', 'jane.lead@acme.com', '0412345678']);
  assert.strictEqual(r.email, 'jane.lead@acme.com');
  assert.strictEqual(r.title, null);
});

// ---------------------------------------------------------------------------
// Reconstructed regression coverage for the prior "harden" pass (placeholders,
// multi-number phones, tier tokens) — no committed test file existed before this.
// ---------------------------------------------------------------------------
console.log('placeholders, multi-number phones, tier tokens (pre-existing hardening)');

// sanitiseCell runs in parseRawText (not classifyFields itself), so these go
// through the full row parser rather than calling classifyFields directly.
test('research-sheet placeholder cells are treated as empty', () => {
  const { rows } = parseRawText('Acme Co\tJane Doe\tNeeds Enrichment\tjane@acme.com');
  assert.strictEqual(rows[0].title, null, 'placeholder text must not become a title');
});

test('a "→" call-route annotation cell is discarded', () => {
  const { rows } = parseRawText('Acme Co\tJane Doe\tFront desk → ask for Jane\tjane@acme.com');
  assert.strictEqual(rows[0].title, null);
});

test('priority tier token (T1/T2) between company and name is dropped, not a title/name field', () => {
  const r = classifyFields(['Acme Co', 'T2', 'Jane Doe', 'jane@acme.com']);
  assert.strictEqual(r.company, 'Acme Co');
  assert.strictEqual(r.first_name, 'Jane');
  assert.strictEqual(r.last_name, 'Doe');
});

test('multi-number phone cell keeps only the first valid number', () => {
  assert.strictEqual(extractPhone('+61 3 8677 3777 / +61 2 8088 0600'), '+61 3 8677 3777');
});

test('phone cell with a trailing annotation strips the non-numeric tail', () => {
  assert.strictEqual(extractPhone('1300 859 117 (switchboard)'), '1300 859 117');
});

test('normalisePhone folds +61/0061/61 prefixes to the local 0-form', () => {
  assert.strictEqual(normalisePhone('+61 412 345 678'), '0412345678');
  assert.strictEqual(normalisePhone('0061412345678'), '0412345678');
  assert.strictEqual(normalisePhone('61412345678'), '0412345678');
  assert.strictEqual(normalisePhone('0412345678'), '0412345678');
});

test('splitName: single token is a last name only (contacts.last_name is NOT NULL)', () => {
  assert.deepStrictEqual(splitName('Madonna'), { first_name: null, last_name: 'Madonna' });
});

test('splitName: two tokens split first/last', () => {
  assert.deepStrictEqual(splitName('Shannon Karaka'), { first_name: 'Shannon', last_name: 'Karaka' });
});

// ---------------------------------------------------------------------------
// parseRawText end-to-end (delimiter detection, header skipping, parse errors)
// ---------------------------------------------------------------------------
console.log('parseRawText (row-level)');

test('tab-separated row with a combined title parses end to end', () => {
  const { rows, parseErrors } = parseRawText('Deel\tT1\tShannon Karaka\tHead of Expansion ANZ / Country Leader\tshannon.karaka@deel.com');
  assert.strictEqual(parseErrors.length, 0);
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].company, 'Deel');
  assert.strictEqual(rows[0].first_name, 'Shannon');
  assert.strictEqual(rows[0].last_name, 'Karaka');
  assert.strictEqual(rows[0].title, 'Head of Expansion ANZ / Country Leader');
});

test('header row is skipped, not imported as data', () => {
  const { rows } = parseRawText('Name\tPhone\tEmail\nJane Doe\t0412345678\tjane@acme.com');
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].first_name, 'Jane');
});

test('a row with neither phone nor email is a parse error, not silently dropped', () => {
  const { rows, parseErrors } = parseRawText('Acme Co\tJane Doe\tGeneral Manager');
  assert.strictEqual(rows.length, 0);
  assert.strictEqual(parseErrors.length, 1);
  assert.strictEqual(parseErrors[0].line, 1);
});

test('blank lines are ignored', () => {
  const { rows } = parseRawText('\nJane Doe\t0412345678\tjane@acme.com\n\n');
  assert.strictEqual(rows.length, 1);
});

console.log(`\n${passed} test(s) passed${process.exitCode ? ', with failures above' : ''}.`);
