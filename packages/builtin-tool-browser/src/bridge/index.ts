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

export type BrowserBridgeAction =
  'back' | 'click' | 'fill' | 'forward' | 'inspect' | 'scroll' | 'submit';

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
      type: 'ready';
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
      inputType: 'click' | 'input';
      source: typeof BROWSER_BRIDGE_SOURCE;
      type: 'user-intervention';
      version: typeof BROWSER_BRIDGE_VERSION;
    };

interface BrowserBridgeOptions {
  allowedParentOrigin?: string;
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

const selectorFor = (element: Element): string => {
  if (element.id) return `#${escapeSelector(element.id)}`;
  const name = element.getAttribute('name');
  if (name) return `${element.tagName.toLowerCase()}[name="${escapeSelector(name)}"]`;
  return element.tagName.toLowerCase();
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
  const element = document.querySelector(selector);
  if (!element) throw new Error(`Element "${selector}" was not found in the visible iframe`);
  if (!isVisible(element)) throw new Error(`Element "${selector}" is not visible in the iframe`);
  return element;
};

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
    const link = element.closest('a[href]');
    if (link instanceof HTMLAnchorElement) {
      window.location.assign(link.href);
      return inspectAfterPotentialNavigation();
    }
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
  let hostClientId: string | undefined;
  let readyTimer: number | undefined;
  const originalWindowOpen = window.open;
  const sendReady = () =>
    send({
      capabilities: ['click', 'fill', 'submit', 'scroll', 'inspect', 'back', 'forward'],
      type: 'ready',
      url: window.location.href,
    });
  const onMessage = async (event: MessageEvent) => {
    if (event.source !== window.parent || event.origin !== parentOrigin) return;
    if (event.data?.source === BROWSER_HOST_SOURCE && event.data?.type === 'connected') {
      if (typeof event.data.clientId !== 'string' || !event.data.clientId) return;
      hostClientId = event.data.clientId;
      if (readyTimer) window.clearInterval(readyTimer);
      readyTimer = undefined;
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
    try {
      commandInProgress = true;
      const result = await runCommand(command);
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
      commandInProgress = false;
    }
  };

  const onUserClick = () => {
    if (!commandInProgress && hostClientId)
      send({ clientId: hostClientId, inputType: 'click', type: 'user-intervention' });
  };
  const keepLinkInsideFrame = (event: MouseEvent) => {
    if (event.defaultPrevented || event.button !== 0) return;
    const target = event.target;
    const link = target instanceof Element ? target.closest('a[href]') : null;
    if (!(link instanceof HTMLAnchorElement)) return;

    const opensNewContext =
      link.target.toLowerCase() === '_blank' ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey ||
      event.altKey;
    if (!opensNewContext) return;

    event.preventDefault();
    window.location.assign(link.href);
  };
  const onUserInput = () => {
    if (!commandInProgress && hostClientId)
      send({ clientId: hostClientId, inputType: 'input', type: 'user-intervention' });
  };

  window.addEventListener('message', onMessage);
  window.open = ((url?: string | URL) => {
    if (url) window.location.assign(String(url));
    return window;
  }) as typeof window.open;
  document.addEventListener('click', keepLinkInsideFrame, true);
  document.addEventListener('click', onUserClick, true);
  document.addEventListener('input', onUserInput, true);
  sendReady();
  readyTimer = window.setInterval(sendReady, 500);

  return () => {
    window.removeEventListener('message', onMessage);
    window.open = originalWindowOpen;
    if (readyTimer) window.clearInterval(readyTimer);
    document.removeEventListener('click', keepLinkInsideFrame, true);
    document.removeEventListener('click', onUserClick, true);
    document.removeEventListener('input', onUserInput, true);
  };
};
