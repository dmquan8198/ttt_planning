const test = require('node:test');
const assert = require('node:assert/strict');
const { roleAtLeast } = require('../../src/lib/roles');

test('roleAtLeast allows equal or higher roles', () => {
  assert.equal(roleAtLeast('admin', 'admin'), true);
  assert.equal(roleAtLeast('admin', 'editor'), true);
  assert.equal(roleAtLeast('admin', 'viewer'), true);
  assert.equal(roleAtLeast('editor', 'editor'), true);
  assert.equal(roleAtLeast('editor', 'viewer'), true);
  assert.equal(roleAtLeast('viewer', 'viewer'), true);
});

test('roleAtLeast rejects lower roles', () => {
  assert.equal(roleAtLeast('viewer', 'editor'), false);
  assert.equal(roleAtLeast('viewer', 'admin'), false);
  assert.equal(roleAtLeast('editor', 'admin'), false);
});

test('roleAtLeast treats an unknown role as having no access', () => {
  assert.equal(roleAtLeast('not-a-role', 'viewer'), false);
  assert.equal(roleAtLeast(undefined, 'viewer'), false);
});
