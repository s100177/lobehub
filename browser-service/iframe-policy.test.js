import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createIframePolicy } from './iframe-policy.js';

describe('iframe origin policy', () => {
  it('accepts only explicitly configured origins', () => {
    const policy = createIframePolicy('http://127.0.0.1:3211, https://business.example');

    assert.doesNotThrow(() => policy.assertAllowed('https://business.example/form?id=1'));
    assert.throws(() => policy.assertAllowed('https://other.example/form'), {
      code: 'BROWSER_IFRAME_ORIGIN_BLOCKED',
      status: 403,
    });
  });

  it('uses iframe automatically only for trusted local or private business origins', () => {
    const policy = createIframePolicy(
      'http://127.0.0.1:3211,http://192.168.1.50:8080,https://business.example',
    );

    assert.equal(policy.shouldAutoUse('http://127.0.0.1:3211/form'), true);
    assert.equal(policy.shouldAutoUse('http://192.168.1.50:8080/form'), true);
    assert.equal(policy.shouldAutoUse('https://business.example/form'), false);
    assert.equal(policy.shouldAutoUse('http://127.0.0.1:9999/form'), false);
  });
});
