import assert from 'node:assert/strict';
import test from 'node:test';

import { classifyHealth } from './health.mjs';

test('classifies successful responses at the latency boundary', () => {
  assert.equal(classifyHealth({ httpStatus: 200, latencyMs: 0 }), 'healthy');
  assert.equal(classifyHealth({ httpStatus: 299, latencyMs: 1000 }), 'healthy');
  assert.equal(classifyHealth({ httpStatus: 200, latencyMs: 1001 }), 'degraded');
});

test('classifies other valid statuses as unavailable', () => {
  for (const httpStatus of [100, 199, 300, 404, 500, 599]) {
    assert.equal(classifyHealth({ httpStatus, latencyMs: 0 }), 'unavailable');
  }
});

test('rejects invalid statuses', () => {
  for (const httpStatus of [undefined, null, '200', 99, 600, 200.5, NaN, Infinity]) {
    assert.throws(() => classifyHealth({ httpStatus, latencyMs: 0 }), TypeError);
  }
});

test('rejects invalid latencies', () => {
  for (const latencyMs of [undefined, null, '0', -1, NaN, Infinity, -Infinity]) {
    assert.throws(() => classifyHealth({ httpStatus: 200, latencyMs }), TypeError);
  }
});
