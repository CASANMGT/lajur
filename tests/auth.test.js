import test from 'node:test';
import assert from 'node:assert/strict';

import { hashPin, validPinFormat, weakPin, DEFAULT_PINS } from '../src/data/auth.js';

test('PIN is salted, derived, and never stored as plain text', async () => {
  const salt = '00112233445566778899aabbccddeeff';
  const otherSalt = 'ffeeddccbbaa99887766554433221100';
  const hash = await hashPin('2468', salt);
  assert.equal(hash.length, 64);
  assert.notEqual(hash, '2468');
  assert.notEqual(hash, DEFAULT_PINS['u-mgr']);
  assert.equal(await hashPin('2468', salt), hash);
  assert.notEqual(await hashPin('2468', otherSalt), hash);
  assert.notEqual(await hashPin('8642', salt), hash);
});

test('PIN format and weak-PIN policy', () => {
  assert.equal(validPinFormat('2468'), true);
  assert.equal(validPinFormat('123456'), true);
  assert.equal(validPinFormat('123'), false);
  assert.equal(validPinFormat('12a4'), false);
  assert.equal(validPinFormat('1234567'), false);

  assert.equal(weakPin('1111'), true);
  assert.equal(weakPin('1234'), true);
  assert.equal(weakPin('0000'), true);
  assert.equal(weakPin('2468'), true);
  assert.equal(weakPin('4826'), false);
});
