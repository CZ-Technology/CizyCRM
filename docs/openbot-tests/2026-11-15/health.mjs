export function classifyHealth({ httpStatus, latencyMs }) {
  if (!Number.isInteger(httpStatus) || httpStatus < 100 || httpStatus > 599) {
    throw new TypeError('httpStatus must be an integer from 100 to 599');
  }

  if (typeof latencyMs !== 'number' || !Number.isFinite(latencyMs) || latencyMs < 0) {
    throw new TypeError('latencyMs must be a finite, non-negative number');
  }

  if (httpStatus < 200 || httpStatus > 299) {
    return 'unavailable';
  }

  return latencyMs <= 1000 ? 'healthy' : 'degraded';
}
