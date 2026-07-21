import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createServiceAuthMiddleware } from './service-auth.js';

const invoke = (serviceToken, { path = '/navigate', token } = {}) => {
  let nextCalled = false;
  let response;
  const middleware = createServiceAuthMiddleware(serviceToken);
  const req = { headers: { 'x-browser-service-token': token }, path };
  const res = {
    json(body) {
      response = { body, status: response?.status };
      return response;
    },
    status(status) {
      response = { status };
      return this;
    },
  };

  middleware(req, res, () => {
    nextCalled = true;
  });

  return { nextCalled, response };
};

describe('browser service authentication', () => {
  it('keeps the health endpoint public', () => {
    assert.deepEqual(invoke(undefined, { path: '/status' }), {
      nextCalled: true,
      response: undefined,
    });
  });

  it('fails closed when the service token is not configured', () => {
    assert.deepEqual(invoke(undefined), {
      nextCalled: false,
      response: {
        body: {
          code: 'BROWSER_SERVICE_TOKEN_REQUIRED',
          error: 'BROWSER_SERVICE_TOKEN must be configured',
        },
        status: 503,
      },
    });
  });

  it('rejects a missing or incorrect token and accepts the configured token', () => {
    assert.equal(invoke('secret').response.status, 401);
    assert.equal(invoke('secret', { token: 'incorrect' }).response.status, 401);
    assert.deepEqual(invoke('secret', { token: 'secret' }), {
      nextCalled: true,
      response: undefined,
    });
  });
});
