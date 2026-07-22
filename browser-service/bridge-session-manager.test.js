import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { BridgeSessionManager } from './bridge-session-manager.js';

describe('BridgeSessionManager', () => {
  it('waits for the visible iframe result before resolving an AI action', async () => {
    const manager = new BridgeSessionManager({ commandTimeoutMs: 500 });
    manager.register('topic-1', { ownerId: 'user-1', url: 'https://app.example/form' });
    manager.connect('topic-1', {
      clientId: 'client-1',
      ownerId: 'user-1',
      url: 'https://app.example/form',
    });

    let settled = false;
    const resultPromise = manager
      .enqueue('topic-1', {
        action: 'fill',
        ownerId: 'user-1',
        params: { selector: '#name', text: 'Ada' },
      })
      .then((value) => {
        settled = true;
        return value;
      });
    const command = await manager.poll('topic-1', { clientId: 'client-1', ownerId: 'user-1' });
    assert.equal(command.action, 'fill');
    assert.equal(settled, false);

    manager.complete('topic-1', {
      clientId: 'client-1',
      commandId: command.id,
      epoch: command.epoch,
      ownerId: 'user-1',
      result: { title: 'Form', url: 'https://app.example/form' },
    });

    assert.deepEqual(await resultPromise, { title: 'Form', url: 'https://app.example/form' });
  });

  it('registers a pending command before waking a long-poll client', async () => {
    const manager = new BridgeSessionManager({ commandTimeoutMs: 500 });
    manager.register('topic-1', { ownerId: 'user-1', url: 'https://app.example/form' });
    manager.connect('topic-1', {
      clientId: 'client-1',
      ownerId: 'user-1',
      url: 'https://app.example/form',
    });

    const pollPromise = manager.poll('topic-1', {
      clientId: 'client-1',
      ownerId: 'user-1',
    });
    const resultPromise = manager.enqueue('topic-1', {
      action: 'inspect',
      ownerId: 'user-1',
      params: {},
    });
    const command = await pollPromise;
    assert.doesNotThrow(() =>
      manager.complete('topic-1', {
        clientId: 'client-1',
        commandId: command.id,
        epoch: command.epoch,
        ownerId: 'user-1',
        result: { title: 'Form' },
      }),
    );
    assert.deepEqual(await resultPromise, { title: 'Form' });
  });

  it('waits briefly for the visible iframe before refusing an action', async () => {
    const manager = new BridgeSessionManager({ connectionWaitMs: 10 });
    manager.register('topic-1', { ownerId: 'user-1', url: 'https://app.example/form' });

    await assert.rejects(
      manager.enqueue('topic-1', {
        action: 'click',
        ownerId: 'user-1',
        params: { selector: '#go' },
      }),
      { code: 'BRIDGE_NOT_CONNECTED' },
    );
  });

  it('delivers the first action when a newly visible iframe connects during the grace period', async () => {
    const manager = new BridgeSessionManager({ commandTimeoutMs: 500, connectionWaitMs: 100 });
    manager.register('topic-1', { ownerId: 'user-1', url: 'https://app.example/form' });

    const resultPromise = manager.enqueue('topic-1', {
      action: 'click',
      ownerId: 'user-1',
      params: { selector: '#go' },
    });
    manager.connect('topic-1', {
      clientId: 'client-1',
      ownerId: 'user-1',
      url: 'https://app.example/form',
    });
    const command = await manager.poll('topic-1', {
      clientId: 'client-1',
      ownerId: 'user-1',
    });
    assert.equal(command.action, 'click');
    manager.complete('topic-1', {
      clientId: 'client-1',
      commandId: command.id,
      epoch: command.epoch,
      ownerId: 'user-1',
      result: { clicked: true },
    });

    assert.deepEqual(await resultPromise, { clicked: true });
  });

  it('allows enough time for a streamed tool result to mount the visible iframe', async () => {
    const manager = new BridgeSessionManager({ commandTimeoutMs: 500, connectionWaitMs: 100 });
    manager.register('topic-1', { ownerId: 'user-1', url: 'https://app.example/form' });

    const resultPromise = manager.enqueue('topic-1', {
      action: 'inspect',
      ownerId: 'user-1',
      params: {},
    });
    await new Promise((resolve) => setTimeout(resolve, 30));
    manager.connect('topic-1', {
      clientId: 'client-1',
      ownerId: 'user-1',
      url: 'https://app.example/form',
    });
    const command = await manager.poll('topic-1', {
      clientId: 'client-1',
      ownerId: 'user-1',
    });
    manager.complete('topic-1', {
      clientId: 'client-1',
      commandId: command.id,
      epoch: command.epoch,
      ownerId: 'user-1',
      result: { title: 'Form' },
    });

    assert.equal(command.action, 'inspect');
    assert.deepEqual(await resultPromise, { title: 'Form' });
  });

  it('does not reuse an old iframe client after navigation starts a new session', async () => {
    const manager = new BridgeSessionManager({ connectionWaitMs: 10 });
    manager.register('topic-1', { ownerId: 'user-1', url: 'https://app.example/old' });
    manager.connect('topic-1', {
      clientId: 'old-client',
      ownerId: 'user-1',
      url: 'https://app.example/old',
    });

    manager.destroy('topic-1', 'user-1');
    manager.register('topic-1', { ownerId: 'user-1', url: 'https://app.example/new' });

    await assert.rejects(
      manager.enqueue('topic-1', {
        action: 'click',
        ownerId: 'user-1',
        params: { selector: '#continue' },
      }),
      { code: 'BRIDGE_NOT_CONNECTED' },
    );
  });

  it('enforces session ownership and iframe origin', () => {
    const manager = new BridgeSessionManager();
    manager.register('topic-1', { ownerId: 'user-1', url: 'https://app.example/form' });

    assert.throws(() => manager.getStatus('topic-1', 'user-2'), { code: 'BRIDGE_FORBIDDEN' });
    assert.throws(
      () =>
        manager.connect('topic-1', {
          clientId: 'client-1',
          ownerId: 'user-1',
          url: 'https://evil.example/form',
        }),
      { code: 'BRIDGE_ORIGIN_MISMATCH' },
    );
  });

  it('rejects an AI action when the iframe reports a real DOM failure', async () => {
    const manager = new BridgeSessionManager();
    manager.register('topic-1', { ownerId: 'user-1', url: 'https://app.example/form' });
    manager.connect('topic-1', {
      clientId: 'client-1',
      ownerId: 'user-1',
      url: 'https://app.example/form',
    });

    const resultPromise = manager.enqueue('topic-1', {
      action: 'click',
      ownerId: 'user-1',
      params: { selector: '#missing' },
    });
    const command = await manager.poll('topic-1', { clientId: 'client-1', ownerId: 'user-1' });
    manager.complete('topic-1', {
      clientId: 'client-1',
      commandId: command.id,
      epoch: command.epoch,
      error: { code: 'ELEMENT_NOT_FOUND', message: 'Element "#missing" was not found' },
      ownerId: 'user-1',
    });

    await assert.rejects(resultPromise, { code: 'ELEMENT_NOT_FOUND' });
  });

  it('times out instead of reporting success when the visible iframe never responds', async () => {
    const manager = new BridgeSessionManager({ commandTimeoutMs: 10 });
    manager.register('topic-1', { ownerId: 'user-1', url: 'https://app.example/form' });
    manager.connect('topic-1', {
      clientId: 'client-1',
      ownerId: 'user-1',
      url: 'https://app.example/form',
    });

    await assert.rejects(
      manager.enqueue('topic-1', { action: 'inspect', ownerId: 'user-1', params: {} }),
      { code: 'BRIDGE_COMMAND_TIMEOUT' },
    );
  });

  it('requires the active client when reporting a command result', async () => {
    const manager = new BridgeSessionManager({ commandTimeoutMs: 500 });
    manager.register('topic-1', { ownerId: 'user-1', url: 'https://app.example/form' });
    manager.connect('topic-1', {
      clientId: 'client-1',
      ownerId: 'user-1',
      url: 'https://app.example/form',
    });
    const resultPromise = manager.enqueue('topic-1', {
      action: 'inspect',
      ownerId: 'user-1',
      params: {},
    });
    const command = await manager.poll('topic-1', { clientId: 'client-1', ownerId: 'user-1' });

    assert.throws(
      () =>
        manager.complete('topic-1', {
          clientId: 'stale-client',
          commandId: command.id,
          epoch: command.epoch,
          ownerId: 'user-1',
          result: {},
        }),
      { code: 'BRIDGE_CLIENT_MISMATCH' },
    );
    manager.complete('topic-1', {
      clientId: 'client-1',
      commandId: command.id,
      epoch: command.epoch,
      ownerId: 'user-1',
      result: { ok: true },
    });
    await resultPromise;
  });

  it('requires a fresh inspect after the user changes the visible iframe', async () => {
    const manager = new BridgeSessionManager({ commandTimeoutMs: 500 });
    manager.register('topic-1', { ownerId: 'user-1', url: 'https://app.example/form' });
    manager.connect('topic-1', {
      clientId: 'client-1',
      ownerId: 'user-1',
      url: 'https://app.example/form',
    });
    manager.interrupt('topic-1', { clientId: 'client-1', ownerId: 'user-1' });

    await assert.rejects(
      manager.enqueue('topic-1', {
        action: 'fill',
        ownerId: 'user-1',
        params: { selector: '#name', text: 'Ada' },
      }),
      { code: 'BRIDGE_INSPECT_REQUIRED' },
    );

    const inspectPromise = manager.enqueue('topic-1', {
      action: 'inspect',
      ownerId: 'user-1',
      params: {},
    });
    const command = await manager.poll('topic-1', { clientId: 'client-1', ownerId: 'user-1' });
    manager.complete('topic-1', {
      clientId: 'client-1',
      commandId: command.id,
      epoch: command.epoch,
      ownerId: 'user-1',
      result: { title: 'Form' },
    });
    await inspectPromise;

    const fillPromise = manager.enqueue('topic-1', {
      action: 'fill',
      ownerId: 'user-1',
      params: { selector: '#name', text: 'Ada' },
    });
    const fillCommand = await manager.poll('topic-1', {
      clientId: 'client-1',
      ownerId: 'user-1',
    });
    manager.complete('topic-1', {
      clientId: 'client-1',
      commandId: fillCommand.id,
      epoch: fillCommand.epoch,
      ownerId: 'user-1',
      result: { title: 'Form' },
    });
    await fillPromise;
  });

  it('rejects non-reconnectable AI work immediately when the visible iframe disconnects', async () => {
    const manager = new BridgeSessionManager({ commandTimeoutMs: 500 });
    manager.register('topic-1', { ownerId: 'user-1', url: 'https://app.example/form' });
    manager.connect('topic-1', {
      clientId: 'client-1',
      ownerId: 'user-1',
      url: 'https://app.example/form',
    });
    const resultPromise = manager.enqueue('topic-1', {
      action: 'fill',
      ownerId: 'user-1',
      params: { selector: '#name', text: 'Ada' },
    });

    manager.disconnect('topic-1', { clientId: 'client-1', ownerId: 'user-1' });
    await assert.rejects(resultPromise, { code: 'BRIDGE_DISCONNECTED' });
  });

  it('rejects non-reconnectable work when a recovering iframe replaces the failed client', async () => {
    const manager = new BridgeSessionManager({ commandTimeoutMs: 500 });
    manager.register('topic-1', { ownerId: 'user-1', url: 'https://app.example/form' });
    manager.connect('topic-1', {
      clientId: 'failed-client',
      ownerId: 'user-1',
      url: 'https://app.example/form',
    });
    const resultPromise = manager.enqueue('topic-1', {
      action: 'hover',
      ownerId: 'user-1',
      params: { selector: '#menu' },
    });
    await manager.poll('topic-1', { clientId: 'failed-client', ownerId: 'user-1' });

    manager.connect('topic-1', {
      clientId: 'recovered-client',
      ownerId: 'user-1',
      url: 'https://app.example/form',
    });

    await assert.rejects(resultPromise, { code: 'BRIDGE_CLIENT_REPLACED' });
  });

  it('completes a navigation command from the freshly connected document only', async () => {
    const manager = new BridgeSessionManager({ commandTimeoutMs: 500 });
    manager.register('topic-1', { ownerId: 'user-1', url: 'https://app.example/form' });
    manager.connect('topic-1', {
      clientId: 'client-1',
      ownerId: 'user-1',
      url: 'https://app.example/form',
    });
    const resultPromise = manager.enqueue('topic-1', {
      action: 'click',
      ownerId: 'user-1',
      params: { selector: '#next' },
    });
    const oldCommand = await manager.poll('topic-1', {
      clientId: 'client-1',
      ownerId: 'user-1',
    });
    manager.disconnect('topic-1', { clientId: 'client-1', ownerId: 'user-1' });
    manager.connect('topic-1', {
      clientId: 'client-2',
      ownerId: 'user-1',
      url: 'https://app.example/next',
    });
    const inspectCommand = await manager.poll('topic-1', {
      clientId: 'client-2',
      ownerId: 'user-1',
    });

    assert.equal(inspectCommand.id, oldCommand.id);
    assert.equal(inspectCommand.action, 'inspect');
    assert.notEqual(inspectCommand.epoch, oldCommand.epoch);
    assert.throws(
      () =>
        manager.complete('topic-1', {
          clientId: 'client-2',
          commandId: oldCommand.id,
          epoch: oldCommand.epoch,
          ownerId: 'user-1',
          result: { url: 'https://app.example/form' },
        }),
      { code: 'BRIDGE_STALE_RESULT' },
    );
    manager.complete('topic-1', {
      clientId: 'client-2',
      commandId: inspectCommand.id,
      epoch: inspectCommand.epoch,
      ownerId: 'user-1',
      result: { url: 'https://app.example/next' },
    });
    assert.deepEqual(await resultPromise, { url: 'https://app.example/next' });
  });

  it('moves an inspect requested during tab activation to the freshly connected iframe', async () => {
    const manager = new BridgeSessionManager({ commandTimeoutMs: 500 });
    manager.register('topic-1', { ownerId: 'user-1', url: 'https://app.example/form' });
    manager.connect('topic-1', {
      clientId: 'client-1',
      ownerId: 'user-1',
      url: 'https://app.example/form',
    });
    const resultPromise = manager.enqueue('topic-1', {
      action: 'inspect',
      ownerId: 'user-1',
      params: {},
    });
    const oldCommand = await manager.poll('topic-1', {
      clientId: 'client-1',
      ownerId: 'user-1',
    });

    manager.disconnect('topic-1', { clientId: 'client-1', ownerId: 'user-1' });
    manager.connect('topic-1', {
      clientId: 'client-2',
      ownerId: 'user-1',
      url: 'https://app.example/policy',
    });
    const freshCommand = await manager.poll('topic-1', {
      clientId: 'client-2',
      ownerId: 'user-1',
    });
    assert.equal(freshCommand.id, oldCommand.id);
    assert.equal(freshCommand.action, 'inspect');
    assert.notEqual(freshCommand.epoch, oldCommand.epoch);
    manager.complete('topic-1', {
      clientId: 'client-2',
      commandId: freshCommand.id,
      epoch: freshCommand.epoch,
      ownerId: 'user-1',
      result: { url: 'https://app.example/policy' },
    });

    assert.deepEqual(await resultPromise, { url: 'https://app.example/policy' });
  });
});
