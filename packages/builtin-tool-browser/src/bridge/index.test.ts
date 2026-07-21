/**
 * @vitest-environment happy-dom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BROWSER_HOST_SOURCE, installBrowserBridge } from './index';

describe('installBrowserBridge', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('fills and clicks the exact visible iframe DOM before reporting success', async () => {
    document.body.innerHTML = '<input id="name" /><button id="go">Continue</button>';
    Object.defineProperty(window, 'parent', {
      configurable: true,
      value: { postMessage: vi.fn() },
    });
    vi.spyOn(document.getElementById('name')!, 'getBoundingClientRect').mockReturnValue({
      bottom: 20,
      height: 20,
      left: 0,
      right: 100,
      top: 0,
      width: 100,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    vi.spyOn(document.getElementById('go')!, 'getBoundingClientRect').mockReturnValue({
      bottom: 50,
      height: 20,
      left: 0,
      right: 100,
      top: 30,
      width: 100,
      x: 0,
      y: 30,
      toJSON: () => ({}),
    });
    const clicked = vi.fn();
    document.getElementById('go')!.addEventListener('click', clicked);
    const cleanup = installBrowserBridge({ allowedParentOrigin: 'https://chat.example' });
    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          clientId: 'client-1',
          controlling: true,
          source: BROWSER_HOST_SOURCE,
          type: 'connected',
        },
        origin: 'https://chat.example',
        source: window.parent,
      }),
    );

    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          clientId: 'client-1',
          command: {
            action: 'fill',
            epoch: 1,
            id: 'fill-1',
            params: { selector: '#name', text: 'Ada' },
          },
          sessionId: 'topic-1',
          source: BROWSER_HOST_SOURCE,
          type: 'command',
        },
        origin: 'https://chat.example',
        source: window.parent,
      }),
    );
    await vi.waitFor(() =>
      expect((document.getElementById('name') as HTMLInputElement).value).toBe('Ada'),
    );

    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          clientId: 'client-1',
          command: { action: 'click', epoch: 1, id: 'click-1', params: { selector: '#go' } },
          sessionId: 'topic-1',
          source: BROWSER_HOST_SOURCE,
          type: 'command',
        },
        origin: 'https://chat.example',
        source: window.parent,
      }),
    );
    await vi.waitFor(() => expect(clicked).toHaveBeenCalledOnce());
    expect(window.parent.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'click',
        clientId: 'client-1',
        commandId: 'click-1',
        phase: 'start',
        target: expect.objectContaining({ label: 'Continue', selector: '#go' }),
        type: 'action-state',
      }),
      'https://chat.example',
    );
    await vi.waitFor(() =>
      expect(window.parent.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          clientId: 'client-1',
          commandId: 'click-1',
          phase: 'success',
          type: 'action-state',
        }),
        'https://chat.example',
      ),
    );
    cleanup();
  });

  it('blocks risky submit actions in the visible iframe', async () => {
    document.body.innerHTML = '<form><button id="submit">提交审批</button></form>';
    const postMessage = vi.fn();
    Object.defineProperty(window, 'parent', { configurable: true, value: { postMessage } });
    vi.spyOn(document.getElementById('submit')!, 'getBoundingClientRect').mockReturnValue({
      bottom: 20,
      height: 20,
      left: 0,
      right: 100,
      top: 0,
      width: 100,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    const cleanup = installBrowserBridge({ allowedParentOrigin: 'https://chat.example' });
    window.dispatchEvent(
      new MessageEvent('message', {
        data: { clientId: 'client-1', source: BROWSER_HOST_SOURCE, type: 'connected' },
        origin: 'https://chat.example',
        source: window.parent,
      }),
    );

    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          clientId: 'client-1',
          command: { action: 'submit', epoch: 1, id: 'submit-1', params: { selector: '#submit' } },
          sessionId: 'topic-1',
          source: BROWSER_HOST_SOURCE,
          type: 'command',
        },
        origin: 'https://chat.example',
        source: window.parent,
      }),
    );

    await vi.waitFor(() =>
      expect(postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          clientId: 'client-1',
          commandId: 'submit-1',
          result: expect.objectContaining({ blocked: true }),
          type: 'result',
        }),
        'https://chat.example',
      ),
    );
    cleanup();
  });

  it('ignores commands from an unexpected origin or window', async () => {
    document.body.innerHTML = '<input id="name" />';
    const postMessage = vi.fn();
    const parent = { postMessage };
    Object.defineProperty(window, 'parent', { configurable: true, value: parent });
    vi.spyOn(document.getElementById('name')!, 'getBoundingClientRect').mockReturnValue({
      bottom: 20,
      height: 20,
      left: 0,
      right: 100,
      top: 0,
      width: 100,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    const cleanup = installBrowserBridge({ allowedParentOrigin: 'https://chat.example' });
    window.dispatchEvent(
      new MessageEvent('message', {
        data: { clientId: 'client-1', source: BROWSER_HOST_SOURCE, type: 'connected' },
        origin: 'https://chat.example',
        source: window.parent,
      }),
    );
    postMessage.mockClear();
    const command = {
      clientId: 'client-1',
      command: {
        action: 'fill',
        epoch: 1,
        id: 'fill-1',
        params: { selector: '#name', text: 'Mallory' },
      },
      sessionId: 'topic-1',
      source: BROWSER_HOST_SOURCE,
      type: 'command',
    };

    window.dispatchEvent(
      new MessageEvent('message', {
        data: command,
        origin: 'https://evil.example',
        source: parent as unknown as MessageEventSource,
      }),
    );
    window.dispatchEvent(
      new MessageEvent('message', {
        data: command,
        origin: 'https://chat.example',
        source: window,
      }),
    );
    window.dispatchEvent(
      new MessageEvent('message', {
        data: { ...command, clientId: 'stale-client' },
        origin: 'https://chat.example',
        source: parent as unknown as MessageEventSource,
      }),
    );
    await Promise.resolve();

    expect((document.getElementById('name') as HTMLInputElement).value).toBe('');
    expect(postMessage).not.toHaveBeenCalled();
    cleanup();
  });

  it('reports native user intervention and removes listeners on cleanup', () => {
    document.body.innerHTML = '<input id="name" /><button id="go">Continue</button>';
    const postMessage = vi.fn();
    Object.defineProperty(window, 'parent', { configurable: true, value: { postMessage } });
    const cleanup = installBrowserBridge({ allowedParentOrigin: 'https://chat.example' });
    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          clientId: 'client-1',
          controlling: true,
          source: BROWSER_HOST_SOURCE,
          type: 'connected',
        },
        origin: 'https://chat.example',
        source: window.parent,
      }),
    );
    postMessage.mockClear();

    document.getElementById('go')!.click();
    document.getElementById('name')!.dispatchEvent(new Event('input', { bubbles: true }));
    expect(postMessage).toHaveBeenCalledTimes(2);
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId: 'client-1',
        inputType: 'click',
        type: 'user-intervention',
      }),
      'https://chat.example',
    );

    cleanup();
    postMessage.mockClear();
    document.getElementById('go')!.click();
    expect(postMessage).not.toHaveBeenCalled();
  });

  it('requests a right-panel tab for native new-window links without swallowing click handlers', () => {
    document.body.innerHTML = '<a id="details" href="#details" target="_blank">Details</a>';
    const postMessage = vi.fn();
    Object.defineProperty(window, 'parent', { configurable: true, value: { postMessage } });
    const cleanup = installBrowserBridge({ allowedParentOrigin: 'https://chat.example' });
    window.dispatchEvent(
      new MessageEvent('message', {
        data: { clientId: 'client-1', source: BROWSER_HOST_SOURCE, type: 'connected' },
        origin: 'https://chat.example',
        source: window.parent,
      }),
    );
    postMessage.mockClear();
    const clicked = vi.fn();
    document.getElementById('details')!.addEventListener('click', clicked);

    document
      .getElementById('details')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0, cancelable: true }));

    expect(clicked).toHaveBeenCalledOnce();
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId: 'client-1',
        title: 'Details',
        type: 'open-tab',
        url: expect.stringMatching(/#details$/),
      }),
      'https://chat.example',
    );
    expect(window.location.hash).not.toBe('#details');
    cleanup();
  });

  it('routes window.open into a right-panel tab', () => {
    const postMessage = vi.fn();
    Object.defineProperty(window, 'parent', { configurable: true, value: { postMessage } });
    const cleanup = installBrowserBridge({ allowedParentOrigin: 'https://chat.example' });
    window.dispatchEvent(
      new MessageEvent('message', {
        data: { clientId: 'client-1', source: BROWSER_HOST_SOURCE, type: 'connected' },
        origin: 'https://chat.example',
        source: window.parent,
      }),
    );
    postMessage.mockClear();

    const opened = window.open('/policy', '_blank');

    expect(opened).toBe(window);
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId: 'client-1',
        type: 'open-tab',
        url: expect.stringMatching(/\/policy$/),
      }),
      'https://chat.example',
    );
    cleanup();
  });

  it('queues new-window navigation until the host bridge connects', () => {
    document.body.innerHTML = '<a id="details" href="#details" target="_blank">Details</a>';
    const postMessage = vi.fn();
    Object.defineProperty(window, 'parent', { configurable: true, value: { postMessage } });
    const cleanup = installBrowserBridge({ allowedParentOrigin: 'https://chat.example' });
    postMessage.mockClear();

    document
      .getElementById('details')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0, cancelable: true }));
    expect(window.location.hash).not.toBe('#details');
    expect(postMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'open-tab' }),
      expect.anything(),
    );

    window.dispatchEvent(
      new MessageEvent('message', {
        data: { clientId: 'client-1', source: BROWSER_HOST_SOURCE, type: 'connected' },
        origin: 'https://chat.example',
        source: window.parent,
      }),
    );
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId: 'client-1',
        title: 'Details',
        type: 'open-tab',
        url: expect.stringMatching(/#details$/),
      }),
      'https://chat.example',
    );
    cleanup();
  });

  it('falls back to same-frame navigation when the host bridge does not connect', async () => {
    vi.useFakeTimers();
    document.body.innerHTML = '<a id="details" href="#details" target="_blank">Details</a>';
    const postMessage = vi.fn();
    Object.defineProperty(window, 'parent', { configurable: true, value: { postMessage } });
    const cleanup = installBrowserBridge({ allowedParentOrigin: 'https://chat.example' });

    document
      .getElementById('details')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0, cancelable: true }));
    expect(window.location.hash).not.toBe('#details');

    await vi.advanceTimersByTimeAsync(1000);

    expect(window.location.hash).toBe('#details');
    expect(postMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'open-tab' }),
      expect.anything(),
    );
    cleanup();
    vi.useRealTimers();
  });

  it('does not replay a click from a disconnected bridge into a later client lifetime', () => {
    document.body.innerHTML =
      '<a id="details" href="#after-disconnect" target="_blank">Details</a>';
    const postMessage = vi.fn();
    Object.defineProperty(window, 'parent', { configurable: true, value: { postMessage } });
    const cleanup = installBrowserBridge({ allowedParentOrigin: 'https://chat.example' });
    window.dispatchEvent(
      new MessageEvent('message', {
        data: { clientId: 'client-1', source: BROWSER_HOST_SOURCE, type: 'connected' },
        origin: 'https://chat.example',
        source: window.parent,
      }),
    );
    window.dispatchEvent(
      new MessageEvent('message', {
        data: { clientId: 'client-1', source: BROWSER_HOST_SOURCE, type: 'disconnected' },
        origin: 'https://chat.example',
        source: window.parent,
      }),
    );
    postMessage.mockClear();

    document
      .getElementById('details')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0, cancelable: true }));
    expect(window.location.hash).toBe('#after-disconnect');

    window.dispatchEvent(
      new MessageEvent('message', {
        data: { clientId: 'client-2', source: BROWSER_HOST_SOURCE, type: 'connected' },
        origin: 'https://chat.example',
        source: window.parent,
      }),
    );
    expect(postMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ clientId: 'client-2', type: 'open-tab' }),
      expect.anything(),
    );
    cleanup();
  });

  it('does not report normal browsing as intervention outside AI control', () => {
    document.body.innerHTML = '<input id="name" /><button id="go">Continue</button>';
    const postMessage = vi.fn();
    Object.defineProperty(window, 'parent', { configurable: true, value: { postMessage } });
    const cleanup = installBrowserBridge({ allowedParentOrigin: 'https://chat.example' });
    window.dispatchEvent(
      new MessageEvent('message', {
        data: { clientId: 'client-1', source: BROWSER_HOST_SOURCE, type: 'connected' },
        origin: 'https://chat.example',
        source: window.parent,
      }),
    );
    postMessage.mockClear();

    document.getElementById('go')!.click();
    document.getElementById('name')!.dispatchEvent(new Event('input', { bubbles: true }));
    expect(postMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'user-intervention' }),
      expect.anything(),
    );
    cleanup();
  });

  it('reports same-document navigation without a synthetic loading delay', () => {
    const postMessage = vi.fn();
    Object.defineProperty(window, 'parent', { configurable: true, value: { postMessage } });
    const cleanup = installBrowserBridge({ allowedParentOrigin: 'https://chat.example' });
    window.dispatchEvent(
      new MessageEvent('message', {
        data: { clientId: 'client-1', source: BROWSER_HOST_SOURCE, type: 'connected' },
        origin: 'https://chat.example',
        source: window.parent,
      }),
    );
    postMessage.mockClear();

    document.title = 'Policy';
    history.pushState({}, '', '?view=policy');

    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId: 'client-1',
        phase: 'complete',
        title: 'Policy',
        type: 'navigation-state',
        url: expect.stringContaining('?view=policy'),
      }),
      'https://chat.example',
    );
    expect(postMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ phase: 'start', type: 'navigation-state' }),
      expect.anything(),
    );
    cleanup();
  });

  it('uses the visible element when a selector also matches a hidden duplicate', async () => {
    document.body.innerHTML =
      '<input class="search" style="display:none" /><input class="search" />';
    const inputs = document.querySelectorAll('.search');
    vi.spyOn(inputs[1], 'getBoundingClientRect').mockReturnValue({
      bottom: 20,
      height: 20,
      left: 0,
      right: 100,
      top: 0,
      width: 100,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    const postMessage = vi.fn();
    Object.defineProperty(window, 'parent', { configurable: true, value: { postMessage } });
    const cleanup = installBrowserBridge({ allowedParentOrigin: 'https://chat.example' });
    window.dispatchEvent(
      new MessageEvent('message', {
        data: { clientId: 'client-1', source: BROWSER_HOST_SOURCE, type: 'connected' },
        origin: 'https://chat.example',
        source: window.parent,
      }),
    );
    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          clientId: 'client-1',
          command: {
            action: 'fill',
            epoch: 1,
            id: 'fill-visible',
            params: { selector: '.search', text: '复星医药' },
          },
          sessionId: 'topic-1',
          source: BROWSER_HOST_SOURCE,
          type: 'command',
        },
        origin: 'https://chat.example',
        source: window.parent,
      }),
    );

    await vi.waitFor(() => expect((inputs[1] as HTMLInputElement).value).toBe('复星医药'));
    expect((inputs[0] as HTMLInputElement).value).toBe('');
    cleanup();
  });

  it('rejects an ambiguous selector instead of acting on the first visible match', async () => {
    document.body.innerHTML =
      '<button class="save">Save A</button><button class="save">Save B</button>';
    const buttons = document.querySelectorAll('.save');
    for (const button of buttons) {
      vi.spyOn(button, 'getBoundingClientRect').mockReturnValue({
        bottom: 20,
        height: 20,
        left: 0,
        right: 100,
        top: 0,
        width: 100,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      });
    }
    const clicked = vi.fn();
    for (const button of buttons) button.addEventListener('click', clicked);
    const postMessage = vi.fn();
    Object.defineProperty(window, 'parent', { configurable: true, value: { postMessage } });
    const cleanup = installBrowserBridge({ allowedParentOrigin: 'https://chat.example' });
    window.dispatchEvent(
      new MessageEvent('message', {
        data: { clientId: 'client-1', source: BROWSER_HOST_SOURCE, type: 'connected' },
        origin: 'https://chat.example',
        source: window.parent,
      }),
    );
    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          clientId: 'client-1',
          command: {
            action: 'click',
            epoch: 1,
            id: 'click-ambiguous',
            params: { selector: '.save' },
          },
          sessionId: 'topic-1',
          source: BROWSER_HOST_SOURCE,
          type: 'command',
        },
        origin: 'https://chat.example',
        source: window.parent,
      }),
    );

    await vi.waitFor(() =>
      expect(postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          commandId: 'click-ambiguous',
          error: expect.objectContaining({
            code: 'BRIDGE_ACTION_FAILED',
            message: expect.stringContaining('ambiguous'),
          }),
          type: 'result',
        }),
        'https://chat.example',
      ),
    );
    expect(clicked).not.toHaveBeenCalled();
    cleanup();
  });

  it('stops accepting commands while hidden and announces readiness after reactivation', async () => {
    vi.useFakeTimers();
    document.body.innerHTML = '<input id="name" />';
    const postMessage = vi.fn();
    Object.defineProperty(window, 'parent', { configurable: true, value: { postMessage } });
    vi.spyOn(document.getElementById('name')!, 'getBoundingClientRect').mockReturnValue({
      bottom: 20,
      height: 20,
      left: 0,
      right: 100,
      top: 0,
      width: 100,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    const cleanup = installBrowserBridge({ allowedParentOrigin: 'https://chat.example' });
    window.dispatchEvent(
      new MessageEvent('message', {
        data: { clientId: 'client-1', source: BROWSER_HOST_SOURCE, type: 'connected' },
        origin: 'https://chat.example',
        source: window.parent,
      }),
    );
    postMessage.mockClear();
    window.dispatchEvent(
      new MessageEvent('message', {
        data: { clientId: 'client-1', source: BROWSER_HOST_SOURCE, type: 'disconnected' },
        origin: 'https://chat.example',
        source: window.parent,
      }),
    );
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'ready' }),
      'https://chat.example',
    );
    postMessage.mockClear();

    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          clientId: 'client-1',
          command: {
            action: 'fill',
            epoch: 1,
            id: 'fill-hidden',
            params: { selector: '#name', text: 'Hidden' },
          },
          sessionId: 'topic-1',
          source: BROWSER_HOST_SOURCE,
          type: 'command',
        },
        origin: 'https://chat.example',
        source: window.parent,
      }),
    );
    await vi.runOnlyPendingTimersAsync();
    expect((document.getElementById('name') as HTMLInputElement).value).toBe('');
    cleanup();
    vi.useRealTimers();
  });
});
