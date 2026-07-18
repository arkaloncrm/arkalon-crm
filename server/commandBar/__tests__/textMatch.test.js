// Plain node:assert test script — no test runner dependency. Run with:
//   node server/commandBar/__tests__/textMatch.test.js
const assert = require('assert');
const { isPlausibleAuPhone, isCloseMatch, diceCoefficient, sharesLeadingWord } = require('../textMatch');

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

console.log('isPlausibleAuPhone');
test('10-digit mobile starting 04 is plausible', () => {
  assert.strictEqual(isPlausibleAuPhone('0414111222'), true);
});
test('formatted 10-digit mobile (spaces) is plausible', () => {
  assert.strictEqual(isPlausibleAuPhone('0414 111 222'), true);
});
test('formatted 10-digit mobile (dashes/brackets) is plausible', () => {
  assert.strictEqual(isPlausibleAuPhone('(04) 14-111-222'), true);
});
test('+61 mobile (11 digits after stripping +) is plausible', () => {
  assert.strictEqual(isPlausibleAuPhone('+61414111222'), true);
});
test('+61 mobile with spaces is plausible', () => {
  assert.strictEqual(isPlausibleAuPhone('+61 414 111 222'), true);
});
test('9-digit number (missing a digit) is NOT plausible', () => {
  assert.strictEqual(isPlausibleAuPhone('041411122'), false);
});
test('11-digit number not starting 61 (padded/garbled) is NOT plausible', () => {
  assert.strictEqual(isPlausibleAuPhone('04141112223'), false);
});
test('10-digit number not starting 0 is NOT plausible', () => {
  assert.strictEqual(isPlausibleAuPhone('1414111222'), false);
});
test('empty/null is NOT plausible', () => {
  assert.strictEqual(isPlausibleAuPhone(''), false);
  assert.strictEqual(isPlausibleAuPhone(null), false);
});
test('non-numeric junk is NOT plausible', () => {
  assert.strictEqual(isPlausibleAuPhone('oh four one four'), false);
});

console.log('name similarity (isCloseMatch / diceCoefficient)');
test('"Informa Group" vs "Informa Australia" is a close match (shared leading word)', () => {
  assert.strictEqual(sharesLeadingWord('Informa Group', 'Informa Australia'), true);
  assert.strictEqual(isCloseMatch('Informa Group', 'Informa Australia'), true);
});
test('"Novotel Olympic Park" vs "Novotel Sydney" is a close match (shared leading word)', () => {
  assert.strictEqual(isCloseMatch('Novotel Olympic Park', 'Novotel Sydney'), true);
});
test('near-identical spelling scores >= 0.6 even without a shared leading word split', () => {
  assert.ok(diceCoefficient('Simply Seated Pty Ltd', 'Simply Seated Pty Ltd.') >= 0.6);
});
test('unrelated names are NOT a close match', () => {
  assert.strictEqual(isCloseMatch('Informa Group', 'Totally Different Co'), false);
});
test('unrelated single-word names are NOT a close match', () => {
  assert.strictEqual(isCloseMatch('Qantas', 'Woolworths'), false);
});
test('identical names score 1.0', () => {
  assert.strictEqual(diceCoefficient('Informa Group', 'Informa Group'), 1);
});
test('empty strings never falsely match', () => {
  assert.strictEqual(isCloseMatch('', 'Informa Group'), false);
  assert.strictEqual(isCloseMatch('Informa Group', ''), false);
});

console.log(`\n${passed} test(s) passed${process.exitCode ? ', with failures above' : ''}.`);
