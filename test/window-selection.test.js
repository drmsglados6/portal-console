const test = require('node:test');
const assert = require('node:assert/strict');
const { selectWindowNumbers } = require('../src/window-selection');

test('ranges and exclusions select current window numbers', () => {
  assert.deepEqual(selectWindowNumbers('2,5', 6), [2, 5]);
  assert.deepEqual(selectWindowNumbers('2-4', 6), [2, 3, 4]);
  assert.deepEqual(selectWindowNumbers('!3', 5), [1, 2, 4, 5]);
  assert.deepEqual(selectWindowNumbers('!(2-4)', 6), [1, 5, 6]);
  assert.deepEqual(selectWindowNumbers('2-3,3,5', 6), [2, 3, 5]);
  assert.throws(() => selectWindowNumbers('!(1-7)', 6), /between/);
});

test('regex selects only complete decimal window numbers', () => {
  assert.deepEqual(selectWindowNumbers('1|3|5', 6, 'regex'), [1, 3, 5]);
  assert.deepEqual(selectWindowNumbers('1', 12, 'regex'), [1]);
  assert.throws(() => selectWindowNumbers('[', 6, 'regex'), /Invalid/);
});
