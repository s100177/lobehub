import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { getFillControlAction } from './form-control.js';

describe('form control fill action', () => {
  it('routes select controls through selectOption', () => {
    assert.equal(getFillControlAction('SELECT'), 'select');
    assert.equal(getFillControlAction('select'), 'select');
  });

  it('keeps text-like controls on the regular fill path', () => {
    assert.equal(getFillControlAction('INPUT'), 'fill');
    assert.equal(getFillControlAction('textarea'), 'fill');
  });
});
