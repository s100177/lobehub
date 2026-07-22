import { randomUUID } from 'node:crypto';

const NAVIGATION_ACTIONS = new Set(['back', 'click', 'forward', 'submit']);
const RECONNECTABLE_ACTIONS = new Set([...NAVIGATION_ACTIONS, 'inspect']);

export class BridgeError extends Error {
  constructor(code, message, status = 409) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export class BridgeSessionManager {
  constructor({
    commandTimeoutMs = 15_000,
    connectionWaitMs = 15_000,
    idleMs = 300_000,
    maxSessions = 20,
  } = {}) {
    this.commandTimeoutMs = commandTimeoutMs;
    this.connectionWaitMs = connectionWaitMs;
    this.idleMs = idleMs;
    this.maxSessions = maxSessions;
    this.sessions = new Map();
  }

  register(sessionId, { ownerId, url }) {
    const existing = this.sessions.get(sessionId);
    if (existing) this.assertOwner(existing, ownerId);

    const session = existing || {
      client: undefined,
      commands: [],
      connectionWaiters: new Set(),
      epoch: 0,
      lastUsed: Date.now(),
      ownerId,
      pending: new Map(),
      pollWaiters: new Set(),
      interrupted: false,
      url,
    };
    session.lastUsed = Date.now();
    session.url = url;
    this.sessions.set(sessionId, session);
    this.evictOverflow();
    return this.getStatus(sessionId, ownerId);
  }

  get size() {
    return this.sessions.size;
  }

  has(sessionId, ownerId) {
    const session = this.sessions.get(sessionId);
    if (!session) return false;
    this.assertOwner(session, ownerId);
    return true;
  }

  connect(sessionId, { clientId, ownerId, url }) {
    const session = this.requireSession(sessionId, ownerId);
    if (new URL(url).origin !== new URL(session.url).origin) {
      throw new BridgeError(
        'BRIDGE_ORIGIN_MISMATCH',
        'Bridge page origin does not match the iframe session',
        403,
      );
    }

    if (!session.client || session.client.id !== clientId) {
      this.rejectCommandsExceptReconnectable(
        session,
        new BridgeError('BRIDGE_CLIENT_REPLACED', 'The visible iframe Bridge client was replaced'),
      );
      session.epoch += 1;
    }
    session.client = { id: clientId, lastSeen: Date.now(), url };
    for (const waiter of session.connectionWaiters) waiter.resolve();
    const reconnectablePending = [...session.pending.entries()].find(([, pending]) =>
      RECONNECTABLE_ACTIONS.has(pending.action),
    );
    if (reconnectablePending) {
      const [id, pending] = reconnectablePending;
      pending.epoch = session.epoch;
      session.commands = [
        {
          action: NAVIGATION_ACTIONS.has(pending.action) ? 'inspect' : pending.action,
          epoch: session.epoch,
          id,
          params: {},
        },
      ];
    }
    session.lastUsed = Date.now();
    this.flushPollWaiters(session);
    return this.getStatus(sessionId, ownerId);
  }

  disconnect(sessionId, { clientId, ownerId }) {
    const session = this.requireSession(sessionId, ownerId);
    if (session.client?.id === clientId) {
      session.client = undefined;
      this.rejectCommandsExceptReconnectable(
        session,
        new BridgeError('BRIDGE_DISCONNECTED', 'The visible iframe Bridge disconnected'),
      );
    }
    session.lastUsed = Date.now();
    return this.getStatus(sessionId, ownerId);
  }

  updateClientUrl(sessionId, { clientId, ownerId, url }) {
    const session = this.requireClient(sessionId, clientId, ownerId);
    if (new URL(url).origin !== new URL(session.url).origin) {
      throw new BridgeError(
        'BRIDGE_ORIGIN_MISMATCH',
        'Bridge page origin does not match the iframe session',
        403,
      );
    }
    session.client.url = url;
    session.url = url;
    session.client.lastSeen = Date.now();
    session.lastUsed = Date.now();
    return this.getStatus(sessionId, ownerId);
  }

  async enqueue(sessionId, { action, ownerId, params, timeoutMs = this.commandTimeoutMs }) {
    const session = this.requireSession(sessionId, ownerId);
    if (!session.client) await this.waitForConnection(session, this.connectionWaitMs);
    if (!session.client)
      throw new BridgeError(
        'BRIDGE_NOT_CONNECTED',
        'The visible iframe has not connected its Lobe Browser Bridge. Open the browser panel or use Remote mode.',
      );
    if (session.interrupted && action !== 'inspect') {
      throw new BridgeError(
        'BRIDGE_INSPECT_REQUIRED',
        'The user changed the visible page. Inspect it again before continuing AI control.',
      );
    }
    if (session.pending.size > 0) {
      throw new BridgeError(
        'BRIDGE_COMMAND_IN_PROGRESS',
        'Wait for the visible iframe to finish its current browser action',
      );
    }

    const id = randomUUID();
    const command = { action, epoch: session.epoch, id, params: params || {} };
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        session.pending.delete(id);
        session.commands = session.commands.filter((item) => item.id !== id);
        reject(
          new BridgeError(
            'BRIDGE_COMMAND_TIMEOUT',
            `The visible iframe did not finish browser action "${action}" within ${timeoutMs}ms`,
            504,
          ),
        );
      }, timeoutMs);

      session.pending.set(id, {
        action,
        epoch: session.epoch,
        reject,
        resolve,
        timer,
      });
      session.commands.push(command);
      session.lastUsed = Date.now();
      this.flushPollWaiters(session);
    });
  }

  async poll(sessionId, { clientId, ownerId, signal, timeoutMs = 20_000 }) {
    const session = this.requireClient(sessionId, clientId, ownerId);
    session.client.lastSeen = Date.now();
    session.lastUsed = Date.now();

    const command = session.commands.shift();
    if (command) return command;

    return new Promise((resolve, reject) => {
      const waiter = { resolve, timer: undefined };
      const cleanup = () => {
        clearTimeout(waiter.timer);
        session.pollWaiters.delete(waiter);
        signal?.removeEventListener('abort', onAbort);
      };
      const finish = (value) => {
        cleanup();
        resolve(value);
      };
      const onAbort = () => {
        cleanup();
        reject(new BridgeError('BRIDGE_POLL_ABORTED', 'Bridge command poll was aborted', 499));
      };

      waiter.resolve = finish;
      waiter.timer = setTimeout(() => finish(undefined), timeoutMs);
      session.pollWaiters.add(waiter);
      signal?.addEventListener('abort', onAbort, { once: true });
    });
  }

  complete(sessionId, { clientId, commandId, epoch, error, ownerId, result }) {
    const session = this.requireClient(sessionId, clientId, ownerId);
    const pending = session.pending.get(commandId);
    if (!pending) {
      throw new BridgeError('BRIDGE_COMMAND_NOT_FOUND', 'Bridge command is no longer pending', 404);
    }
    if (epoch !== pending.epoch || epoch !== session.epoch) {
      throw new BridgeError('BRIDGE_STALE_RESULT', 'Stale iframe Bridge result rejected', 409);
    }

    clearTimeout(pending.timer);
    session.pending.delete(commandId);
    session.lastUsed = Date.now();

    if (error) {
      pending.reject(
        new BridgeError(
          error.code || 'BRIDGE_ACTION_FAILED',
          error.message || 'Bridge action failed',
        ),
      );
    } else {
      if (pending.action === 'inspect') session.interrupted = false;
      pending.resolve(result);
    }

    return this.getStatus(sessionId, ownerId);
  }

  getStatus(sessionId, ownerId) {
    const session = this.requireSession(sessionId, ownerId);
    return {
      connected: Boolean(session.client),
      epoch: session.epoch,
      interrupted: session.interrupted,
      mode: 'iframe',
      pendingCommands: session.pending.size,
      queuedCommands: session.commands.length,
      url: session.url,
    };
  }

  interrupt(sessionId, { clientId, ownerId }) {
    const session = this.requireClient(sessionId, clientId, ownerId);
    session.interrupted = true;
    session.lastUsed = Date.now();
    return this.getStatus(sessionId, ownerId);
  }

  destroy(sessionId, ownerId) {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    this.assertOwner(session, ownerId);
    const error = new BridgeError('BRIDGE_SESSION_CLOSED', 'Bridge session was closed', 410);
    this.rejectCommands(session, error);
    for (const waiter of session.connectionWaiters) waiter.reject(error);
    for (const waiter of session.pollWaiters) waiter.resolve(undefined);
    this.sessions.delete(sessionId);
  }

  cleanup(now = Date.now()) {
    for (const [sessionId, session] of this.sessions) {
      if (now - session.lastUsed > this.idleMs) this.destroy(sessionId, session.ownerId);
    }
  }

  requireSession(sessionId, ownerId) {
    const session = this.sessions.get(sessionId);
    if (!session)
      throw new BridgeError('BRIDGE_SESSION_NOT_FOUND', 'Iframe bridge session not found', 404);
    this.assertOwner(session, ownerId);
    return session;
  }

  requireClient(sessionId, clientId, ownerId) {
    const session = this.requireSession(sessionId, ownerId);
    if (!session.client || session.client.id !== clientId) {
      throw new BridgeError('BRIDGE_CLIENT_MISMATCH', 'Iframe bridge client is not active', 409);
    }
    return session;
  }

  assertOwner(session, ownerId) {
    if (!ownerId || session.ownerId !== ownerId) {
      throw new BridgeError('BRIDGE_FORBIDDEN', 'Browser session belongs to another user', 403);
    }
  }

  flushPollWaiters(session) {
    while (session.commands.length && session.pollWaiters.size) {
      const waiter = session.pollWaiters.values().next().value;
      session.pollWaiters.delete(waiter);
      waiter.resolve(session.commands.shift());
    }
  }

  rejectCommands(session, error) {
    session.commands = [];
    for (const pending of session.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    session.pending.clear();
  }

  rejectCommandsExceptReconnectable(session, error) {
    session.commands = [];
    for (const [id, pending] of session.pending) {
      if (RECONNECTABLE_ACTIONS.has(pending.action)) continue;
      clearTimeout(pending.timer);
      pending.reject(error);
      session.pending.delete(id);
    }
  }

  waitForConnection(session, timeoutMs) {
    return new Promise((resolve, reject) => {
      const waiter = { reject, resolve, timer: undefined };
      const cleanup = () => {
        clearTimeout(waiter.timer);
        session.connectionWaiters.delete(waiter);
      };
      waiter.resolve = () => {
        cleanup();
        resolve();
      };
      waiter.reject = (error) => {
        cleanup();
        reject(error);
      };
      waiter.timer = setTimeout(() => {
        cleanup();
        reject(
          new BridgeError(
            'BRIDGE_NOT_CONNECTED',
            'The visible iframe has not connected its Lobe Browser Bridge. Open the browser panel or use Remote mode.',
          ),
        );
      }, timeoutMs);
      session.connectionWaiters.add(waiter);
    });
  }

  evictOverflow() {
    while (this.sessions.size > this.maxSessions) {
      let oldest;
      for (const entry of this.sessions) {
        if (!oldest || entry[1].lastUsed < oldest[1].lastUsed) oldest = entry;
      }
      if (!oldest) return;
      this.destroy(oldest[0], oldest[1].ownerId);
    }
  }
}
