/**
 * Тесты проверки initData. Запуск: npm test -w server
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { InitDataError, signInitData, validateInitData } from './initData';

const TOKEN = '123456789:AAFakeTokenForTestsOnly_abcdefghijklmn';
const now = new Date('2026-10-04T12:00:00Z');
const authDate = String(Math.floor(now.getTime() / 1000) - 60);
const user = JSON.stringify({ id: 42, first_name: 'Иван', username: 'ivan' });

test('принимает корректно подписанные данные', () => {
  const raw = signInitData({ auth_date: authDate, query_id: 'AAA', user }, TOKEN);
  const result = validateInitData(raw, TOKEN, 3600, now);
  assert.equal(result.user.id, 42);
  assert.equal(result.user.first_name, 'Иван');
  assert.equal(result.queryId, 'AAA');
});

test('отклоняет данные, подписанные другим токеном', () => {
  const raw = signInitData({ auth_date: authDate, user }, '987654321:OtherTokenOtherTokenOtherToken123');
  assert.throws(() => validateInitData(raw, TOKEN, 3600, now), InitDataError);
});

test('отклоняет подменённого пользователя', () => {
  const raw = signInitData({ auth_date: authDate, user }, TOKEN);
  const tampered = raw.replace(encodeURIComponent('"id":42'), encodeURIComponent('"id":1'));
  assert.notEqual(raw, tampered);
  assert.throws(() => validateInitData(tampered, TOKEN, 3600, now), InitDataError);
});

test('отклоняет устаревшие данные', () => {
  const old = String(Math.floor(now.getTime() / 1000) - 7200);
  const raw = signInitData({ auth_date: old, user }, TOKEN);
  assert.throws(() => validateInitData(raw, TOKEN, 3600, now), /устарела/);
});

test('отклоняет данные без hash', () => {
  assert.throws(() => validateInitData(`auth_date=${authDate}&user=${encodeURIComponent(user)}`, TOKEN, 3600, now), InitDataError);
});

test('учитывает поле signature при расчёте hash', () => {
  const raw = signInitData({ auth_date: authDate, user, signature: 'abc' }, TOKEN);
  assert.equal(validateInitData(raw, TOKEN, 3600, now).user.id, 42);
});
