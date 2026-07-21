import type {
  BrowserPageAction,
  BrowserPageField,
  BrowserPagePrice,
  BrowserPageState,
  BrowserRiskType,
  BrowserState,
} from '../types';

export const BROWSER_BRIDGE_SOURCE = 'lobe-browser-bridge';
export const BROWSER_HOST_SOURCE = 'lobe-browser-host';
export const BROWSER_BRIDGE_VERSION = 1;
export const BROWSER_BRIDGE_DOCUMENT_ATTRIBUTE = 'data-lobe-browser-bridge';

export type BrowserBridgeAction =
  'back' | 'click' | 'fill' | 'forward' | 'hover' | 'inspect' | 'scroll' | 'submit';

export interface BrowserBridgeCommand {
  action: BrowserBridgeAction;
  epoch: number;
  id: string;
  params: Record<string, unknown>;
}

export interface BrowserBridgeError {
  code: string;
  message: string;
}

export type BrowserBridgeMessage =
  | {
      capabilities: BrowserBridgeAction[];
      source: typeof BROWSER_BRIDGE_SOURCE;
      title: string;
      type: 'ready';
      url: string;
      version: typeof BROWSER_BRIDGE_VERSION;
    }
  | {
      action: BrowserBridgeAction;
      clientId: string;
      commandId: string;
      phase: 'error' | 'start' | 'success';
      source: typeof BROWSER_BRIDGE_SOURCE;
      target?: BrowserBridgeTarget;
      type: 'action-state';
      version: typeof BROWSER_BRIDGE_VERSION;
    }
  | {
      clientId: string;
      commandId?: string;
      source: typeof BROWSER_BRIDGE_SOURCE;
      title?: string;
      type: 'open-tab';
      url: string;
      version: typeof BROWSER_BRIDGE_VERSION;
    }
  | {
      clientId: string;
      phase: 'complete' | 'start';
      source: typeof BROWSER_BRIDGE_SOURCE;
      title?: string;
      type: 'navigation-state';
      url: string;
      version: typeof BROWSER_BRIDGE_VERSION;
    }
  | {
      clientId: string;
      commandId: string;
      epoch: number;
      error?: BrowserBridgeError;
      result?: BrowserState;
      sessionId: string;
      source: typeof BROWSER_BRIDGE_SOURCE;
      type: 'result';
      version: typeof BROWSER_BRIDGE_VERSION;
    }
  | {
      clientId: string;
      inputType: 'click' | 'input' | 'keydown' | 'pointer' | 'wheel';
      source: typeof BROWSER_BRIDGE_SOURCE;
      type: 'user-intervention';
      version: typeof BROWSER_BRIDGE_VERSION;
    };

interface BrowserBridgeOptions {
  allowedParentOrigin?: string;
}

export interface BrowserBridgeTarget {
  height: number;
  label: string;
  selector: string;
  width: number;
  x: number;
  y: number;
}

const riskPatterns: { pattern: RegExp; risk: BrowserRiskType }[] = [
  { pattern: /购买|下单|订单|支付|付款|续费|充值/, risk: 'purchase' },
  { pattern: /删除|释放|销毁|退订|注销|移除/, risk: 'delete' },
  { pattern: /授权|同意授权|允许访问|绑定/, risk: 'authorization' },
  { pattern: /创建|开通|新建|部署|申请|提交/, risk: 'submit' },
];

const escapeSelector = (value: string) =>
  typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
    ? CSS.escape(value)
    : value.replaceAll(/[^\w-]/g, (character) => `\\${character}`);

let bridgeElementSequence = 0;

const selectorFor = (element: Element): string => {
  if (element.id) {
    const selector = `#${escapeSelector(element.id)}`;
    if (document.querySelectorAll(selector).length === 1) return selector;
  }
  const name = element.getAttribute('name');
  if (name) {
    const selector = `${element.tagName.toLowerCase()}[name="${escapeSelector(name)}"]`;
    if (document.querySelectorAll(selector).length === 1) return selector;
  }

  let bridgeId = element.getAttribute('data-lobe-browser-id');
  if (!bridgeId) {
    bridgeElementSequence += 1;
    bridgeId = `element-${bridgeElementSequence}`;
    element.setAttribute('data-lobe-browser-id', bridgeId);
  }

  return `[data-lobe-browser-id="${escapeSelector(bridgeId)}"]`;
};

const isVisible = (element: Element) => {
  const style = getComputedStyle(element);
  const rect = element.getBoundingClientRect();
  return (
    style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0
  );
};

const detectRisk = (element: Element): BrowserRiskType | undefined => {
  const text = [
    element.textContent,
    element.getAttribute('aria-label'),
    element.getAttribute('title'),
    element.getAttribute('value'),
  ]
    .filter(Boolean)
    .join(' ');
  return riskPatterns.find(({ pattern }) => pattern.test(text))?.risk;
};

const requireElement = (selector: unknown): Element => {
  if (typeof selector !== 'string' || !selector) throw new Error('A CSS selector is required');
  const elements = Array.from(document.querySelectorAll(selector));
  if (elements.length === 0)
    throw new Error(`Element "${selector}" was not found in the visible iframe`);
  const visibleElements = elements.filter(isVisible);
  if (visibleElements.length === 0)
    throw new Error(`Element "${selector}" is not visible in the iframe`);
  if (visibleElements.length > 1)
    throw new Error(
      `Element selector "${selector}" is ambiguous: ${visibleElements.length} visible matches`,
    );
  return visibleElements[0];
};

const describeElement = (element: Element): BrowserBridgeTarget => {
  const rect = element.getBoundingClientRect();
  const label =
    element.textContent?.trim() ||
    element.getAttribute('aria-label') ||
    element.getAttribute('title') ||
    element.getAttribute('placeholder') ||
    element.getAttribute('name') ||
    selectorFor(element);

  return {
    height: rect.height,
    label,
    selector: selectorFor(element),
    width: rect.width,
    x: rect.x,
    y: rect.y,
  };
};

const showActionHighlight = (element: Element, action: BrowserBridgeAction) => {
  const overlay = document.createElement('div');
  const label = document.createElement('span');
  const updatePosition = () => {
    const rect = element.getBoundingClientRect();
    Object.assign(overlay.style, {
      height: `${rect.height}px`,
      left: `${rect.left}px`,
      top: `${rect.top}px`,
      width: `${rect.width}px`,
    });
  };

  overlay.dataset.lobeBrowserHighlight = action;
  Object.assign(overlay.style, {
    background: 'rgb(37 99 235 / 8%)',
    border: '2px solid #2563eb',
    borderRadius: '6px',
    boxShadow: '0 0 0 3px rgb(37 99 235 / 14%)',
    boxSizing: 'border-box',
    pointerEvents: 'none',
    position: 'fixed',
    transition: 'opacity 120ms ease',
    zIndex: '2147483647',
  });
  label.textContent =
    action === 'fill'
      ? 'AI 正在输入'
      : action === 'hover'
        ? 'AI 正在悬停'
        : action === 'submit'
          ? 'AI 准备提交'
          : 'AI 正在点击';
  Object.assign(label.style, {
    background: '#1d4ed8',
    borderRadius: '4px',
    bottom: 'calc(100% + 6px)',
    color: '#fff',
    font: '600 12px/1.4 sans-serif',
    left: '0',
    maxWidth: '240px',
    overflow: 'hidden',
    padding: '4px 7px',
    position: 'absolute',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  });
  overlay.append(label);
  document.documentElement.append(overlay);
  updatePosition();
  window.addEventListener('resize', updatePosition);
  window.addEventListener('scroll', updatePosition, true);

  return () => {
    window.removeEventListener('resize', updatePosition);
    window.removeEventListener('scroll', updatePosition, true);
    overlay.remove();
  };
};

const waitForActionPreview = () => new Promise<void>((resolve) => window.setTimeout(resolve, 120));

const inspect = (): BrowserState => {
  const fields: BrowserPageField[] = Array.from(document.querySelectorAll('input,textarea,select'))
    .filter(isVisible)
    .slice(0, 80)
    .map((element) => {
      const input = element as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
      const label =
        (input.id &&
          document.querySelector(`label[for="${escapeSelector(input.id)}"]`)?.textContent) ||
        input.getAttribute('aria-label') ||
        input.getAttribute('title') ||
        input.getAttribute('placeholder') ||
        input.name ||
        input.id ||
        input.tagName.toLowerCase();
      return {
        checked: 'checked' in input ? Boolean(input.checked) : undefined,
        label: label.trim(),
        options:
          input instanceof HTMLSelectElement
            ? Array.from(input.options).map((option) => option.text)
            : undefined,
        selector: selectorFor(input),
        value: input.value,
      };
    });
  const actions: BrowserPageAction[] = Array.from(
    document.querySelectorAll('button,a[href],[role="button"],input[type="submit"]'),
  )
    .filter(isVisible)
    .slice(0, 80)
    .map((element) => ({
      risk: detectRisk(element),
      selector: selectorFor(element),
      text:
        element.textContent?.trim() ||
        element.getAttribute('aria-label') ||
        element.getAttribute('value') ||
        element.tagName.toLowerCase(),
    }));
  const prices: BrowserPagePrice[] = Array.from(document.querySelectorAll('body *'))
    .filter(
      (element) => element.children.length === 0 && /[¥￥$]\s?\d/.test(element.textContent || ''),
    )
    .slice(0, 20)
    .map((element) => ({
      label: element.getAttribute('aria-label') || 'price',
      value: element.textContent!.trim(),
    }));
  const pageState: BrowserPageState = {
    actions,
    fields,
    prices,
    primaryActions: actions.slice(0, 12),
    textSample: document.body.innerText.slice(0, 4000),
    title: document.title,
    url: window.location.href,
  };

  return {
    bridgeStatus: 'connected',
    embeddable: true,
    iframeUrl: window.location.href,
    mode: 'iframe',
    pageState,
    title: document.title,
    url: window.location.href,
    viewport: { height: window.innerHeight, width: window.innerWidth },
  };
};

const setNativeValue = (element: Element, value: string) => {
  if (element instanceof HTMLSelectElement) {
    element.value = value;
  } else if (element instanceof HTMLInputElement) {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setter?.call(element, value);
  } else if (element instanceof HTMLTextAreaElement) {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
    setter?.call(element, value);
  } else {
    throw new Error('The selected element is not a fillable field');
  }
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
};

const inspectAfterPotentialNavigation = (): Promise<BrowserState> =>
  new Promise((resolve) => {
    const onPageHide = () => window.clearTimeout(timer);
    const timer = window.setTimeout(() => {
      window.removeEventListener('pagehide', onPageHide);
      resolve(inspect());
    }, 50);
    window.addEventListener('pagehide', onPageHide, { once: true });
  });

const runCommand = async (command: BrowserBridgeCommand): Promise<BrowserState> => {
  const { action, params } = command;
  if (action === 'inspect') return inspect();
  if (action === 'back') {
    history.back();
    return inspectAfterPotentialNavigation();
  }
  if (action === 'forward') {
    history.forward();
    return inspectAfterPotentialNavigation();
  }
  if (action === 'scroll') {
    window.scrollBy(Number(params.x) || 0, Number(params.y) || 0);
    return inspect();
  }

  const element = requireElement(params.selector);
  if (action === 'fill') {
    setNativeValue(element, String(params.text ?? ''));
    return inspect();
  }
  if (action === 'hover') {
    element.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }));
    element.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    element.dispatchEvent(new PointerEvent('pointerenter'));
    element.dispatchEvent(new MouseEvent('mouseenter'));
    return inspect();
  }

  const risk = detectRisk(element);
  if (risk) {
    return {
      ...inspect(),
      blocked: true,
      riskBlock: {
        action: action === 'submit' ? 'submit' : 'click',
        reason: `Blocked risky ${action} on "${element.textContent?.trim() || params.selector}"`,
        requiresUserConfirmation: true,
        risk,
        targetText: element.textContent?.trim(),
      },
    };
  }

  if (action === 'click') {
    (element as HTMLElement).click();
    return inspectAfterPotentialNavigation();
  }
  if (action === 'submit') {
    const form = element instanceof HTMLFormElement ? element : element.closest('form');
    if (!form)
      throw new Error(`Element "${String(params.selector)}" is not associated with a form`);
    form.requestSubmit();
    return inspectAfterPotentialNavigation();
  }

  throw new Error(`Unsupported iframe bridge action: ${action}`);
};

export const installBrowserBridge = (options: BrowserBridgeOptions = {}) => {
  if (window.parent === window) return () => {};
  const referrerOrigin = document.referrer ? new URL(document.referrer).origin : undefined;
  const parentOrigin = options.allowedParentOrigin || referrerOrigin;
  if (!parentOrigin) throw new Error('Browser Bridge requires an explicit parent origin');

  const send = (payload: Record<string, unknown>) =>
    window.parent.postMessage(
      { ...payload, source: BROWSER_BRIDGE_SOURCE, version: BROWSER_BRIDGE_VERSION },
      parentOrigin,
    );

  let commandInProgress = false;
  let automationActive = false;
  let interventionReported = false;
  let activeCommandId: string | undefined;
  let hasConnected = false;
  let hostClientId: string | undefined;
  let readyTimer: number | undefined;
  const pendingOpenTabs: Array<{ timeoutId: number; title?: string; url: string }> = [];
  const originalWindowOpen = window.open;
  const originalPushState = history.pushState.bind(history);
  const originalReplaceState = history.replaceState.bind(history);
  document.documentElement.setAttribute(
    BROWSER_BRIDGE_DOCUMENT_ATTRIBUTE,
    String(BROWSER_BRIDGE_VERSION),
  );
  const sendReady = () =>
    send({
      capabilities: ['click', 'fill', 'hover', 'submit', 'scroll', 'inspect', 'back', 'forward'],
      title: document.title,
      type: 'ready',
      url: window.location.href,
    });
  const startReadyAnnouncements = () => {
    if (readyTimer) window.clearInterval(readyTimer);
    sendReady();
    readyTimer = window.setInterval(sendReady, 500);
  };
  const sendNavigationState = () => {
    if (!hostClientId) return;
    send({
      clientId: hostClientId,
      phase: 'complete',
      title: document.title,
      type: 'navigation-state',
      url: window.location.href,
    });
  };
  const sendOrQueueOpenTab = (url: string, title?: string) => {
    if (!hostClientId) {
      if (hasConnected) {
        window.location.assign(url);
        return;
      }
      const pending = {
        timeoutId: window.setTimeout(() => {
          const index = pendingOpenTabs.indexOf(pending);
          if (index >= 0) pendingOpenTabs.splice(index, 1);
          window.location.assign(url);
        }, 1000),
        title,
        url,
      };
      pendingOpenTabs.push(pending);
      return;
    }
    send({ clientId: hostClientId, commandId: activeCommandId, title, type: 'open-tab', url });
  };
  const flushPendingOpenTabs = () => {
    while (hostClientId && pendingOpenTabs.length > 0) {
      const pending = pendingOpenTabs.shift();
      if (pending) {
        window.clearTimeout(pending.timeoutId);
        sendOrQueueOpenTab(pending.url, pending.title);
      }
    }
  };
  const onMessage = async (event: MessageEvent) => {
    if (event.source !== window.parent || event.origin !== parentOrigin) return;
    if (
      event.data?.source === BROWSER_HOST_SOURCE &&
      event.data?.type === 'disconnected' &&
      event.data.clientId === hostClientId
    ) {
      hostClientId = undefined;
      automationActive = false;
      interventionReported = false;
      startReadyAnnouncements();
      return;
    }
    if (event.data?.source === BROWSER_HOST_SOURCE && event.data?.type === 'control-state') {
      if (event.data.clientId !== hostClientId) return;
      automationActive = event.data.active === true;
      if (automationActive) interventionReported = false;
      return;
    }
    if (event.data?.source === BROWSER_HOST_SOURCE && event.data?.type === 'connected') {
      if (typeof event.data.clientId !== 'string' || !event.data.clientId) return;
      hasConnected = true;
      hostClientId = event.data.clientId;
      automationActive = event.data.controlling === true;
      interventionReported = false;
      if (readyTimer) window.clearInterval(readyTimer);
      readyTimer = undefined;
      flushPendingOpenTabs();
      return;
    }
    if (
      event.data?.source !== BROWSER_HOST_SOURCE ||
      event.data?.type !== 'command' ||
      !hostClientId ||
      event.data.clientId !== hostClientId
    )
      return;

    const command = event.data.command as BrowserBridgeCommand;
    const commandClientId = hostClientId;
    let removeHighlight: (() => void) | undefined;
    try {
      commandInProgress = true;
      activeCommandId = command.id;
      const selector = command.params?.selector;
      const targetElement =
        typeof selector === 'string' && selector ? requireElement(selector) : undefined;
      const target = targetElement ? describeElement(targetElement) : undefined;
      send({
        action: command.action,
        clientId: commandClientId,
        commandId: command.id,
        phase: 'start',
        target,
        type: 'action-state',
      });
      if (targetElement) {
        targetElement.scrollIntoView({ behavior: 'instant', block: 'center', inline: 'center' });
        removeHighlight = showActionHighlight(targetElement, command.action);
        await waitForActionPreview();
      }
      const result = await runCommand(command);
      send({
        action: command.action,
        clientId: commandClientId,
        commandId: command.id,
        phase: 'success',
        target,
        type: 'action-state',
      });
      send({
        clientId: commandClientId,
        commandId: command.id,
        epoch: command.epoch,
        result,
        sessionId: event.data.sessionId,
        type: 'result',
      });
    } catch (error) {
      send({
        action: command.action,
        clientId: commandClientId,
        commandId: command.id,
        phase: 'error',
        type: 'action-state',
      });
      send({
        clientId: commandClientId,
        commandId: command.id,
        epoch: command.epoch,
        error: {
          code: 'BRIDGE_ACTION_FAILED',
          message: error instanceof Error ? error.message : String(error),
        },
        sessionId: event.data.sessionId,
        type: 'result',
      });
    } finally {
      removeHighlight?.();
      activeCommandId = undefined;
      commandInProgress = false;
    }
  };

  const reportUserIntervention = (
    inputType: 'click' | 'input' | 'keydown' | 'pointer' | 'wheel',
  ) => {
    if (!automationActive || interventionReported || commandInProgress || !hostClientId) return;
    interventionReported = true;
    automationActive = false;
    send({ clientId: hostClientId, inputType, type: 'user-intervention' });
  };
  const onUserClick = () => reportUserIntervention('click');
  const onUserInput = () => reportUserIntervention('input');
  const onUserKeyDown = () => reportUserIntervention('keydown');
  const onUserPointerDown = () => reportUserIntervention('pointer');
  const onUserWheel = () => reportUserIntervention('wheel');
  const keepLinkInsideFrame = (event: MouseEvent) => {
    const isPrimaryClick = event.type === 'click' && event.button === 0;
    const isMiddleClick = event.type === 'auxclick' && event.button === 1;
    if (event.defaultPrevented || (!isPrimaryClick && !isMiddleClick)) return;
    const target = event.target;
    const link = target instanceof Element ? target.closest('a[href]') : null;
    if (!(link instanceof HTMLAnchorElement)) return;

    const crossesOrigin =
      new URL(link.href, window.location.href).origin !== window.location.origin;
    const opensNewContext =
      link.target.toLowerCase() === '_blank' ||
      crossesOrigin ||
      isMiddleClick ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey;
    if (!opensNewContext) return;

    event.preventDefault();
    sendOrQueueOpenTab(link.href, link.textContent?.trim() || undefined);
  };
  const reportNavigationStart = (event: MouseEvent) => {
    if (!hostClientId || event.defaultPrevented || event.button !== 0) return;
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    const target = event.target;
    const link = target instanceof Element ? target.closest('a[href]') : null;
    if (!(link instanceof HTMLAnchorElement) || link.target.toLowerCase() === '_blank') return;
    if (new URL(link.href, window.location.href).origin !== window.location.origin) return;
    if (link.href === window.location.href) return;
    send({
      clientId: hostClientId,
      phase: 'start',
      title: document.title,
      type: 'navigation-state',
      url: link.href,
    });
  };

  window.addEventListener('message', onMessage);
  window.open = ((url?: string | URL, target?: string) => {
    if (!url) return window;
    const resolvedUrl = new URL(String(url), window.location.href).toString();
    if (target?.toLowerCase() === '_self') {
      window.location.assign(resolvedUrl);
    } else {
      sendOrQueueOpenTab(resolvedUrl);
    }
    return window;
  }) as typeof window.open;
  history.pushState = ((...args: Parameters<History['pushState']>) => {
    originalPushState(...args);
    sendNavigationState();
  }) as History['pushState'];
  history.replaceState = ((...args: Parameters<History['replaceState']>) => {
    originalReplaceState(...args);
    sendNavigationState();
  }) as History['replaceState'];
  document.addEventListener('click', keepLinkInsideFrame, true);
  document.addEventListener('auxclick', keepLinkInsideFrame, true);
  document.addEventListener('click', onUserClick, true);
  document.addEventListener('input', onUserInput, true);
  document.addEventListener('keydown', onUserKeyDown, true);
  document.addEventListener('pointerdown', onUserPointerDown, true);
  document.addEventListener('wheel', onUserWheel, true);
  document.addEventListener('click', reportNavigationStart);
  window.addEventListener('hashchange', sendNavigationState);
  window.addEventListener('popstate', sendNavigationState);
  startReadyAnnouncements();

  return () => {
    window.removeEventListener('message', onMessage);
    window.open = originalWindowOpen;
    history.pushState = originalPushState;
    history.replaceState = originalReplaceState;
    if (readyTimer) window.clearInterval(readyTimer);
    for (const pending of pendingOpenTabs) window.clearTimeout(pending.timeoutId);
    pendingOpenTabs.length = 0;
    document.removeEventListener('click', keepLinkInsideFrame, true);
    document.removeEventListener('auxclick', keepLinkInsideFrame, true);
    document.removeEventListener('click', onUserClick, true);
    document.removeEventListener('input', onUserInput, true);
    document.removeEventListener('keydown', onUserKeyDown, true);
    document.removeEventListener('pointerdown', onUserPointerDown, true);
    document.removeEventListener('wheel', onUserWheel, true);
    document.removeEventListener('click', reportNavigationStart);
    window.removeEventListener('hashchange', sendNavigationState);
    window.removeEventListener('popstate', sendNavigationState);
    document.documentElement.removeAttribute(BROWSER_BRIDGE_DOCUMENT_ATTRIBUTE);
  };
};
