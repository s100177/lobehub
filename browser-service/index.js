import express from 'express';
import { chromium } from 'playwright';

const PORT = Number.parseInt(process.env.PORT || '3100', 10);
const MAX_SESSIONS = Number.parseInt(process.env.MAX_SESSIONS || '20', 10);
const SESSION_IDLE_MS = Number.parseInt(process.env.SESSION_IDLE_MS || '300000', 10);
const STREAM_ACTIVE_INTERVAL_MS = Number.parseInt(
  process.env.STREAM_ACTIVE_INTERVAL_MS || '300',
  10,
);
const STREAM_IDLE_INTERVAL_MS = Number.parseInt(process.env.STREAM_IDLE_INTERVAL_MS || '1200', 10);
const STREAM_ACTIVE_WINDOW_MS = Number.parseInt(process.env.STREAM_ACTIVE_WINDOW_MS || '5000', 10);
const VIEWPORT = { width: 1280, height: 800 };
const EMBED_CHECK_TIMEOUT_MS = Number.parseInt(process.env.EMBED_CHECK_TIMEOUT_MS || '5000', 10);
const USER_AGENT =
  process.env.BROWSER_USER_AGENT ||
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36';

const sessions = new Map();
const sessionCreations = new Map();

async function destroySession(sessionId) {
  const session = sessions.get(sessionId);
  if (!session) return;

  try {
    await session.browser.close();
  } catch {
    // Closing an already-dead browser should not block session cleanup.
  }

  sessions.delete(sessionId);
}

async function getOrCreateSession(sessionId) {
  const existing = sessions.get(sessionId);
  if (existing) {
    existing.lastUsed = Date.now();
    return existing;
  }

  const pending = sessionCreations.get(sessionId);
  if (pending) return pending;

  const creation = (async () => {
    const createdByRacer = sessions.get(sessionId);
    if (createdByRacer) {
      createdByRacer.lastUsed = Date.now();
      return createdByRacer;
    }

    if (sessions.size >= MAX_SESSIONS) {
      let oldest = null;
      for (const [id, session] of sessions) {
        if (!oldest || session.lastUsed < oldest.session.lastUsed) oldest = { id, session };
      }
      if (oldest) await destroySession(oldest.id);
    }

    const browser = await chromium.launch({
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled',
      ],
      headless: true,
    });
    const context = await browser.newContext({
      extraHTTPHeaders: {
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      },
      locale: 'zh-CN',
      timezoneId: 'Asia/Shanghai',
      userAgent: USER_AGENT,
      viewport: VIEWPORT,
    });
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      Object.defineProperty(navigator, 'languages', { get: () => ['zh-CN', 'zh', 'en'] });
      Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
    });
    const page = await context.newPage();
    const session = {
      actionEvents: [],
      browser,
      context,
      lastInputAt: Date.now(),
      lastUsed: Date.now(),
      page,
    };
    sessions.set(sessionId, session);
    return session;
  })();

  sessionCreations.set(sessionId, creation);
  try {
    return await creation;
  } finally {
    sessionCreations.delete(sessionId);
  }
}

setInterval(() => {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (now - session.lastUsed > SESSION_IDLE_MS) destroySession(id).catch(() => {});
  }
}, 60_000);

function recordAction(session, { action, status = 'success', summary, target }) {
  session.actionEvents = [
    ...(session.actionEvents || []),
    {
      action,
      id: `${Date.now()}:${action}:${Math.random().toString(36).slice(2, 8)}`,
      status,
      summary,
      target,
      timestamp: Date.now(),
    },
  ].slice(-20);
}

async function getPointerState(page, pointer) {
  if (!pointer) return undefined;

  return await page
    .evaluate(({ x, y }) => {
      const element = document.elementFromPoint(x, y);
      if (!element) return { cursor: 'default' };

      const cursor = window.getComputedStyle(element).cursor || 'default';
      const clickable = Boolean(
        element.closest?.(
          'a,button,input,select,textarea,[role="button"],[role="link"],[onclick],[tabindex]',
        ),
      );

      return { cursor: clickable && cursor === 'auto' ? 'pointer' : cursor };
    }, pointer)
    .catch(() => undefined);
}

async function getPageState(page, options = {}) {
  const session = options.sessionId ? sessions.get(options.sessionId) : undefined;
  const includeScreenshot = options.screenshot !== false;
  const includePageState = options.pageState !== false;
  const [title, screenshot, pointer, pageState] = await Promise.all([
    page.title().catch(() => ''),
    includeScreenshot ? page.screenshot({ fullPage: false, type: 'png' }).catch(() => null) : null,
    getPointerState(page, options.pointer),
    includePageState ? inspectPageState(page).catch(() => undefined) : undefined,
  ]);

  return {
    embeddable: false,
    mode: 'remote',
    title,
    url: page.url(),
    viewport: VIEWPORT,
    ...(session?.actionEvents?.length ? { actionEvents: session.actionEvents } : {}),
    ...(pageState ? { pageState } : {}),
    ...(pointer ? { pointer } : {}),
    ...(screenshot ? { screenshot: screenshot.toString('base64') } : {}),
  };
}

function normalizeHttpUrl(input) {
  const url = new URL(input);
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('Only http:// and https:// URLs are supported');
  }

  return url.toString();
}

function getFrameBlockReason(headers) {
  const xFrameOptions = headers.get('x-frame-options')?.toLowerCase();
  if (xFrameOptions) {
    if (xFrameOptions.includes('deny')) return 'Blocked by X-Frame-Options: DENY';
    if (xFrameOptions.includes('sameorigin')) return 'Blocked by X-Frame-Options: SAMEORIGIN';
    if (xFrameOptions.includes('allow-from'))
      return 'Blocked by legacy X-Frame-Options: ALLOW-FROM';
  }

  const csp = headers.get('content-security-policy')?.toLowerCase();
  const frameAncestors = csp
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith('frame-ancestors'));

  if (!frameAncestors) return undefined;
  if (frameAncestors.includes('*')) return undefined;
  if (frameAncestors.includes("'none'")) return "Blocked by CSP frame-ancestors 'none'";

  return `Blocked by CSP ${frameAncestors}`;
}

async function fetchForEmbedCheck(url, method, timeout) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
      },
      method,
      redirect: 'follow',
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

async function detectEmbeddable(url, timeout = EMBED_CHECK_TIMEOUT_MS) {
  try {
    let response = await fetchForEmbedCheck(url, 'HEAD', timeout);
    if (response.status === 405 || response.status === 403) {
      response = await fetchForEmbedCheck(url, 'GET', timeout);
    }

    const fallbackReason = getFrameBlockReason(response.headers);
    const finalUrl = response.url || url;

    return {
      embeddable: !fallbackReason,
      fallbackReason,
      finalUrl,
    };
  } catch (err) {
    return {
      embeddable: false,
      fallbackReason: `Embed check failed: ${err.message}`,
      finalUrl: url,
    };
  }
}

function getIframePageState({ fallbackReason, finalUrl, requestedMode }) {
  return {
    embeddable: true,
    fallbackReason,
    iframeUrl: finalUrl,
    mode: 'iframe',
    title: new URL(finalUrl).hostname,
    url: finalUrl,
    viewport: VIEWPORT,
    ...(requestedMode === 'iframe' ? { requestedMode } : {}),
  };
}

const RISK_PATTERNS = [
  { pattern: /购买|下单|订单|支付|付款|续费|充值/, risk: 'purchase' },
  { pattern: /删除|释放|销毁|退订|注销|移除/, risk: 'delete' },
  { pattern: /授权|同意授权|允许访问|绑定/, risk: 'authorization' },
  { pattern: /创建|开通|新建|部署|申请|提交/, risk: 'create' },
  { pattern: /确认|提交|保存更改|修改密码|实名认证/, risk: 'submit' },
];

function classifyRisk(text = '') {
  const normalized = text.replaceAll(/\s+/g, '');
  if (!normalized) return undefined;

  const match = RISK_PATTERNS.find(({ pattern }) => pattern.test(normalized));
  return match?.risk;
}

async function inspectElementRisk(page, selector, action) {
  return await page.evaluate(
    ({ action, selector }) => {
      const element = document.querySelector(selector);
      if (!element) return { ok: false, reason: 'not_found' };

      const nearbyText = [
        element.textContent,
        element.getAttribute('aria-label'),
        element.getAttribute('title'),
        element.getAttribute('value'),
        element.closest('button, a, [role="button"]')?.textContent,
        element.closest('label')?.innerText,
      ]
        .filter(Boolean)
        .join(' ')
        .replaceAll(/\s+/g, ' ')
        .trim();

      return {
        action,
        ok: true,
        tagName: element.tagName.toLowerCase(),
        text: nearbyText.slice(0, 500),
      };
    },
    { action, selector },
  );
}

function createRiskBlock({ action, risk, selector, text }) {
  const targetText = text?.slice(0, 120);

  return {
    action,
    reason: `Blocked risky ${action} on "${targetText || selector}"`,
    requiresUserConfirmation: true,
    risk,
    targetText,
  };
}

function withRiskBlock(state, riskBlock) {
  return {
    ...state,
    blocked: true,
    riskBlock,
  };
}

async function inspectPageState(page) {
  return await page.evaluate(() => {
    const visible = (element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        style.display !== 'none' &&
        style.visibility !== 'hidden'
      );
    };

    const clean = (value) => value?.replaceAll(/\s+/g, ' ').trim() || '';

    const classifyRisk = (text = '') => {
      const normalized = text.replaceAll(/\s+/g, '');
      if (!normalized) return undefined;
      if (/购买|下单|订单|支付|付款|续费|充值/.test(normalized)) return 'purchase';
      if (/删除|释放|销毁|退订|注销|移除/.test(normalized)) return 'delete';
      if (/授权|同意授权|允许访问|绑定/.test(normalized)) return 'authorization';
      if (/创建|开通|新建|部署|申请|提交/.test(normalized)) return 'create';
      if (/确认|提交|保存更改|修改密码|实名认证/.test(normalized)) return 'submit';
      return undefined;
    };

    const fieldLabel = (element) => {
      const id = element.id;
      const explicit = id ? document.querySelector(`label[for="${CSS.escape(id)}"]`) : null;
      const implicit = element.closest('label');
      const aria = element.getAttribute('aria-label');
      const placeholder = element.getAttribute('placeholder');
      const parentText = clean(element.closest('.tea-form__item, .form-item, .field')?.innerText);
      return clean(explicit?.innerText || implicit?.innerText || aria || placeholder || parentText);
    };

    const fields = [...document.querySelectorAll('input, textarea, select')]
      .filter(visible)
      .slice(0, 80)
      .map((element) => {
        const isCheckbox = element instanceof HTMLInputElement && element.type === 'checkbox';
        const isRadio = element instanceof HTMLInputElement && element.type === 'radio';
        const value =
          element instanceof HTMLSelectElement
            ? element.selectedOptions[0]?.textContent || element.value
            : element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement
              ? element.value
              : '';

        return {
          ...(isCheckbox || isRadio ? { checked: element.checked } : {}),
          label: fieldLabel(element).slice(0, 120),
          ...(element instanceof HTMLSelectElement
            ? {
                options: [...element.options]
                  .map((option) => clean(option.textContent))
                  .slice(0, 30),
              }
            : {}),
          value: clean(value).slice(0, 120),
        };
      })
      .filter((field) => field.label || field.value);

    const selectedOptions = [
      ...document.querySelectorAll(
        '.is-selected, .is-active, .is-checked, .selected, [aria-selected="true"], [aria-checked="true"], input:checked',
      ),
    ]
      .filter(visible)
      .map((element) =>
        clean(element.innerText || element.closest('label')?.innerText || element.value),
      )
      .filter(Boolean)
      .slice(0, 30);

    const actions = [
      ...document.querySelectorAll(
        'button, a, [role="button"], input[type="button"], input[type="submit"]',
      ),
    ]
      .filter(visible)
      .map((element) => {
        const text = clean(
          element.innerText ||
            element.getAttribute('aria-label') ||
            element.getAttribute('title') ||
            element.value,
        );
        if (!text) return null;
        return {
          ...(classifyRisk(text) ? { risk: classifyRisk(text) } : {}),
          text: text.slice(0, 120),
        };
      })
      .filter(Boolean)
      .slice(0, 60);

    const bodyText = clean(document.body?.innerText || '');
    const prices = [...bodyText.matchAll(/([^。\n]{0,12})[¥￥]\s?[\d,.]+(?:\/[^\s，。]+)?/g)]
      .map((match) => ({
        label: clean(match[1] || 'price').slice(0, 40),
        value: clean(match[0]).slice(0, 80),
      }))
      .slice(0, 20);

    const warnings = bodyText
      .split(/[。！？\n]/)
      .map(clean)
      .filter((line) => /不支持|风险|警告|注意|需要|禁止|失败|停服/.test(line))
      .slice(0, 20);

    return {
      actions,
      fields,
      prices,
      selectedOptions,
      textSample: bodyText.slice(0, 1000),
      title: document.title,
      url: location.href,
      warnings,
    };
  });
}

async function fillElementWithDomFallback(page, selector, text) {
  return await page.evaluate(
    ({ selector, text }) => {
      const element = document.querySelector(selector);
      if (!element) return { ok: false, reason: 'not_found' };

      const setNativeValue = (target, value) => {
        const prototype =
          target instanceof HTMLTextAreaElement
            ? HTMLTextAreaElement.prototype
            : target instanceof HTMLInputElement
              ? HTMLInputElement.prototype
              : undefined;
        const setter = prototype && Object.getOwnPropertyDescriptor(prototype, 'value')?.set;

        if (setter) setter.call(target, value);
        else target.value = value;
      };

      if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
        setNativeValue(element, text ?? '');
      } else if (element.isContentEditable) {
        element.textContent = text ?? '';
      } else {
        return { ok: false, reason: 'unsupported_element' };
      }

      element.dispatchEvent(
        new InputEvent('input', {
          bubbles: true,
          data: text ?? '',
          inputType: 'insertText',
        }),
      );
      element.dispatchEvent(new Event('change', { bubbles: true }));

      return {
        ok: true,
        value:
          element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement
            ? element.value
            : element.textContent,
      };
    },
    { selector, text },
  );
}

async function clickElementWithDomFallback(page, selector) {
  return await page.evaluate((selector) => {
    const element = document.querySelector(selector);
    if (!element) return { ok: false, reason: 'not_found' };

    element.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, cancelable: true }));
    element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
    element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

    if (typeof element.click === 'function') element.click();

    return { ok: true };
  }, selector);
}

async function submitElementForm(page, selector) {
  return await page.evaluate((selector) => {
    const element = document.querySelector(selector);
    if (!element) return { ok: false, reason: 'not_found' };

    const form =
      element instanceof HTMLFormElement ? element : element.closest('form') || element.form;
    if (!form) return { ok: false, reason: 'form_not_found' };

    if (typeof form.requestSubmit === 'function') form.requestSubmit();
    else form.submit();

    return { ok: true };
  }, selector);
}

async function waitForPageAfterSubmit(page, { beforeTitle, beforeUrl, expectedText, timeout }) {
  await Promise.race([
    page
      .waitForFunction(
        ({ beforeTitle, beforeUrl, expectedText }) => {
          const text = document.body?.innerText || '';
          return (
            location.href !== beforeUrl &&
            (document.title !== beforeTitle || !expectedText || text.includes(expectedText))
          );
        },
        { beforeTitle, beforeUrl, expectedText },
        { timeout },
      )
      .catch(() => null),
    page.waitForTimeout(timeout),
  ]);
  await page.waitForLoadState('domcontentloaded', { timeout: 3000 }).catch(() => null);
  await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => null);
}

function getSessionId(req) {
  return req.headers['x-session-id'] || req.query.session;
}

function sessionMiddleware(req, res, next) {
  const sessionId = getSessionId(req);
  if (!sessionId) {
    return res.status(400).json({ error: 'Missing X-Session-ID header or session query' });
  }

  req.sessionId = sessionId;
  next();
}

function renderViewerHtml({ basePath, sessionId }) {
  const encodedSession = JSON.stringify(sessionId);
  const encodedBasePath = JSON.stringify(basePath || '/api/browser/proxy');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Lobe Browser Viewer</title>
  <style>
    :root {
      color-scheme: light dark;
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: #101216;
      color: #eef1f6;
    }
    html, body {
      width: 100%;
      height: 100%;
      margin: 0;
      overflow: hidden;
      background:
        radial-gradient(circle at top left, rgba(60, 122, 255, 0.18), transparent 34%),
        linear-gradient(135deg, #11141a 0%, #090b0f 100%);
    }
    .shell {
      display: grid;
      grid-template-rows: auto 1fr auto;
      width: 100%;
      height: 100%;
    }
    .bar {
      display: flex;
      gap: 8px;
      align-items: center;
      min-height: 38px;
      padding: 8px 10px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
      background: rgba(12, 14, 20, 0.82);
      backdrop-filter: blur(10px);
    }
    .dot {
      width: 9px;
      height: 9px;
      border-radius: 999px;
      background: #f87171;
      box-shadow: 15px 0 #fbbf24, 30px 0 #34d399;
      flex: 0 0 auto;
      margin-right: 28px;
    }
    .url {
      overflow: hidden;
      flex: 1;
      padding: 7px 10px;
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 8px;
      color: rgba(238, 241, 246, 0.85);
      text-overflow: ellipsis;
      white-space: nowrap;
      background: rgba(255, 255, 255, 0.06);
      font-size: 12px;
    }
    .status {
      font-size: 11px;
      color: rgba(238, 241, 246, 0.6);
    }
    .stage {
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 0;
      overflow: hidden;
    }
    canvas {
      width: 100%;
      height: 100%;
      outline: none;
      background: #fff;
      cursor: default;
      image-rendering: auto;
      display: block;
    }
    .empty {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
      text-align: center;
      color: rgba(238, 241, 246, 0.65);
      pointer-events: none;
    }
    .footer {
      display: flex;
      justify-content: space-between;
      gap: 10px;
      padding: 6px 10px;
      border-top: 1px solid rgba(255, 255, 255, 0.1);
      color: rgba(238, 241, 246, 0.54);
      font-size: 11px;
      background: rgba(12, 14, 20, 0.72);
    }
    kbd {
      padding: 1px 5px;
      border: 1px solid rgba(255, 255, 255, 0.2);
      border-radius: 4px;
      background: rgba(255, 255, 255, 0.08);
      font-family: inherit;
      font-size: 10px;
    }
  </style>
</head>
<body>
  <div class="shell">
    <div class="bar">
      <div class="dot"></div>
      <div id="url" class="url">Waiting for navigation...</div>
      <div id="status" class="status">connecting</div>
    </div>
    <div class="stage">
      <canvas id="screen" tabindex="0" width="1280" height="800" aria-label="Interactive remote browser"></canvas>
      <div id="empty" class="empty">Ask the AI to open a webpage, then interact here with mouse, wheel, and keyboard.</div>
    </div>
    <div class="footer">
      <span>Live Playwright session shared with the AI</span>
      <span>Click the page first to focus keyboard input - Tab works</span>
    </div>
  </div>
  <script>
    const sessionId = ${encodedSession};
    const basePath = ${encodedBasePath};
    const canvas = document.getElementById('screen');
    const ctx = canvas.getContext('2d');
    const urlEl = document.getElementById('url');
    const statusEl = document.getElementById('status');
    const emptyEl = document.getElementById('empty');
    let viewport = { width: 1280, height: 800 };
    let eventSource;
    let lastFrameKey = '';
    let lastPointer = null;
    let lastPointerSentAt = 0;

    function endpoint(mode) {
      if (basePath === '/' || basePath === '') {
        const directPath = mode === 'events' ? '/events' : mode === 'input' ? '/input' : '/viewer';
        const directUrl = new URL(directPath, window.location.origin);
        directUrl.searchParams.set('session', sessionId);
        return directUrl.toString();
      }

      const url = new URL(basePath, window.location.origin);
      url.searchParams.set('session', sessionId);
      if (mode) url.searchParams.set('mode', mode);
      return url.toString();
    }

    function canvasPoint(event) {
      const rect = canvas.getBoundingClientRect();
      return {
        x: Math.max(0, Math.min(viewport.width, ((event.clientX - rect.left) / rect.width) * viewport.width)),
        y: Math.max(0, Math.min(viewport.height, ((event.clientY - rect.top) / rect.height) * viewport.height)),
      };
    }

    async function sendInput(payload, options = {}) {
      try {
        const response = await fetch(endpoint('input'), {
          body: JSON.stringify(payload),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
        });
        if (options.drawResponse !== false && response.ok) {
          const frame = await response.json().catch(() => null);
          if (frame) drawFrame(frame, { force: true });
        }
      } catch {
        statusEl.textContent = 'input failed';
      }
    }

    function drawFrame(frame, options = {}) {
      if (frame.pointer?.cursor) {
        canvas.style.cursor = frame.pointer.cursor;
      }
      if (frame.url && frame.url !== 'about:blank') {
        urlEl.textContent = frame.title ? frame.title + ' - ' + frame.url : frame.url;
        emptyEl.style.display = 'none';
      }
      if (!frame.screenshot) return;
      if (frame.viewport) {
        viewport = frame.viewport;
        if (canvas.width !== viewport.width || canvas.height !== viewport.height) {
          canvas.width = viewport.width;
          canvas.height = viewport.height;
        }
      }
      const frameKey = frame.url + ':' + frame.title + ':' + frame.screenshot.slice(0, 80);
      if (!options.force && frameKey === lastFrameKey) {
        statusEl.textContent = 'live';
        return;
      }
      lastFrameKey = frameKey;
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        statusEl.textContent = 'live';
      };
      img.onerror = () => {
        statusEl.textContent = 'frame error';
      };
      img.src = 'data:image/png;base64,' + frame.screenshot;
    }

    function connect() {
      statusEl.textContent = 'connecting';
      eventSource = new EventSource(endpoint('events'));
      eventSource.onmessage = (event) => {
        try {
          drawFrame(JSON.parse(event.data));
        } catch {
          statusEl.textContent = 'bad frame';
        }
      };
      eventSource.onerror = () => {
        statusEl.textContent = 'reconnecting';
      };
    }

    canvas.addEventListener('click', (event) => {
      canvas.focus();
      lastPointer = canvasPoint(event);
      sendInput({ type: 'click', ...lastPointer });
    });
    canvas.addEventListener('dblclick', (event) => {
      canvas.focus();
      lastPointer = canvasPoint(event);
      sendInput({ type: 'dblclick', ...lastPointer });
    });
    canvas.addEventListener('mousemove', (event) => {
      lastPointer = canvasPoint(event);
      const now = Date.now();
      if (now - lastPointerSentAt < 120) return;
      lastPointerSentAt = now;
      sendInput({ type: 'mousemove', ...lastPointer });
    });
    canvas.addEventListener('wheel', (event) => {
      event.preventDefault();
      sendInput({ deltaX: event.deltaX, deltaY: event.deltaY, type: 'wheel' });
    }, { passive: false });
    canvas.addEventListener('keydown', (event) => {
      event.preventDefault();
      sendInput({
        altKey: event.altKey,
        code: event.code,
        ctrlKey: event.ctrlKey,
        key: event.key,
        metaKey: event.metaKey,
        shiftKey: event.shiftKey,
        type: 'key',
      });
    });

    window.addEventListener('beforeunload', () => eventSource?.close());
    connect();
  </script>
</body>
</html>`;
}

async function applyInput(page, payload) {
  switch (payload.type) {
    case 'click': {
      await page.mouse.click(payload.x, payload.y);
      return;
    }
    case 'dblclick': {
      await page.mouse.dblclick(payload.x, payload.y);
      return;
    }
    case 'mousemove': {
      await page.mouse.move(payload.x, payload.y);
      return;
    }
    case 'wheel': {
      await page.mouse.wheel(payload.deltaX || 0, payload.deltaY || 0);
      return;
    }
    case 'key': {
      const modifiers = [];
      if (payload.ctrlKey) modifiers.push('Control');
      if (payload.altKey) modifiers.push('Alt');
      if (payload.shiftKey) modifiers.push('Shift');
      if (payload.metaKey) modifiers.push('Meta');

      for (const modifier of modifiers) await page.keyboard.down(modifier);
      try {
        if (
          payload.key &&
          payload.key.length === 1 &&
          !payload.ctrlKey &&
          !payload.altKey &&
          !payload.metaKey
        ) {
          await page.keyboard.type(payload.key);
        } else if (payload.key) {
          await page.keyboard.press(payload.key);
        }
      } finally {
        for (const modifier of modifiers.reverse()) await page.keyboard.up(modifier);
      }
      return;
    }
    default: {
      throw new Error(`Unsupported input type: ${payload.type}`);
    }
  }
}

const app = express();
app.use(express.json({ limit: '10mb' }));

app.get('/status', async (req, res) => {
  res.json({ maxSessions: MAX_SESSIONS, ok: true, sessions: sessions.size });
});

app.post('/navigate', sessionMiddleware, async (req, res) => {
  try {
    const { mode = 'auto', timeout = 30000, url } = req.body;
    if (!url) return res.status(400).json({ error: 'Missing url' });
    if (!['auto', 'iframe', 'remote'].includes(mode)) {
      return res.status(400).json({ error: 'Invalid mode' });
    }

    const normalizedUrl = normalizeHttpUrl(url);

    let fallbackReason;

    if (mode !== 'remote') {
      const embed =
        mode === 'iframe'
          ? { embeddable: true, finalUrl: normalizedUrl }
          : await detectEmbeddable(normalizedUrl);

      if (embed.embeddable) {
        return res.json(
          getIframePageState({
            fallbackReason: embed.fallbackReason,
            finalUrl: embed.finalUrl,
            requestedMode: mode,
          }),
        );
      }

      fallbackReason = embed.fallbackReason;
    }

    const session = await getOrCreateSession(req.sessionId);
    const { page } = session;
    await page.goto(normalizedUrl, { timeout, waitUntil: 'networkidle' });
    recordAction(session, {
      action: 'navigate',
      summary: `Opened ${normalizedUrl}`,
      target: normalizedUrl,
    });
    const state = await getPageState(page, { screenshot: false, sessionId: req.sessionId });
    res.json({
      ...state,
      embeddable: false,
      fallbackReason:
        mode === 'remote' ? 'Remote mode requested for browser control' : fallbackReason,
      mode: 'remote',
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/click', sessionMiddleware, async (req, res) => {
  try {
    const { selector, timeout = 5000 } = req.body;
    if (!selector) return res.status(400).json({ error: 'Missing selector' });

    const session = await getOrCreateSession(req.sessionId);
    const { page } = session;
    const riskProbe = await inspectElementRisk(page, selector, 'click');
    if (riskProbe.ok) {
      const risk = classifyRisk(riskProbe.text);
      if (risk) {
        const riskBlock = createRiskBlock({
          action: 'click',
          risk,
          selector,
          text: riskProbe.text,
        });
        recordAction(session, {
          action: 'click',
          status: 'blocked',
          summary: riskBlock.reason,
          target: selector,
        });
        return res.json(
          withRiskBlock(
            await getPageState(page, { screenshot: false, sessionId: req.sessionId }),
            riskBlock,
          ),
        );
      }
    }

    try {
      await page.waitForSelector(selector, { state: 'visible', timeout });
      await page.click(selector);
    } catch (err) {
      const fallback = await clickElementWithDomFallback(page, selector);
      if (!fallback.ok) throw err;
    }
    await page.waitForTimeout(500);
    recordAction(session, { action: 'click', summary: `Clicked ${selector}`, target: selector });
    res.json(await getPageState(page, { screenshot: false, sessionId: req.sessionId }));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/fill', sessionMiddleware, async (req, res) => {
  try {
    const { selector, text, timeout = 5000 } = req.body;
    if (!selector) return res.status(400).json({ error: 'Missing selector' });

    const session = await getOrCreateSession(req.sessionId);
    const { page } = session;
    try {
      await page.waitForSelector(selector, { state: 'visible', timeout });
      await page.fill(selector, text ?? '');
    } catch (err) {
      const fallback = await fillElementWithDomFallback(page, selector, text);
      if (!fallback.ok) throw err;
    }
    await page.waitForTimeout(300);
    recordAction(session, { action: 'fill', summary: `Filled ${selector}`, target: selector });
    res.json(await getPageState(page, { screenshot: false, sessionId: req.sessionId }));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/submit', sessionMiddleware, async (req, res) => {
  try {
    const { selector, timeout = 10000 } = req.body;
    if (!selector) return res.status(400).json({ error: 'Missing selector' });

    const session = await getOrCreateSession(req.sessionId);
    const { page } = session;
    await page.waitForSelector(selector, { state: 'attached', timeout });
    const riskProbe = await inspectElementRisk(page, selector, 'submit');
    if (riskProbe.ok) {
      const risk = classifyRisk(riskProbe.text);
      if (risk) {
        const riskBlock = createRiskBlock({
          action: 'submit',
          risk,
          selector,
          text: riskProbe.text,
        });
        recordAction(session, {
          action: 'submit',
          status: 'blocked',
          summary: riskBlock.reason,
          target: selector,
        });
        return res.json(
          withRiskBlock(
            await getPageState(page, { screenshot: false, sessionId: req.sessionId }),
            riskBlock,
          ),
        );
      }
    }

    const beforeTitle = await page.title().catch(() => '');
    const beforeUrl = page.url();
    const expectedText = await page
      .$eval(selector, (element) =>
        element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement
          ? element.value
          : element.textContent,
      )
      .catch(() => undefined);

    const navigation = page
      .waitForNavigation({ timeout, waitUntil: 'networkidle' })
      .catch(() => null);
    const submitted = await submitElementForm(page, selector);
    if (!submitted.ok)
      return res.status(400).json({ error: `Failed to submit form: ${submitted.reason}` });

    await navigation;
    await waitForPageAfterSubmit(page, { beforeTitle, beforeUrl, expectedText, timeout });
    recordAction(session, { action: 'submit', summary: `Submitted ${selector}`, target: selector });
    res.json(await getPageState(page, { screenshot: false, sessionId: req.sessionId }));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/scroll', sessionMiddleware, async (req, res) => {
  try {
    const { x = 0, y = 0 } = req.body;
    const session = await getOrCreateSession(req.sessionId);
    const { page } = session;
    await page.evaluate(({ x, y }) => window.scrollTo(x, y), { x, y });
    await page.waitForTimeout(300);
    recordAction(session, { action: 'scroll', summary: `Scrolled to x=${x}, y=${y}` });
    res.json(await getPageState(page, { screenshot: false, sessionId: req.sessionId }));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/screenshot', sessionMiddleware, async (req, res) => {
  try {
    const session = await getOrCreateSession(req.sessionId);
    const { page } = session;
    recordAction(session, {
      action: 'screenshot',
      summary: `Captured screenshot for ${page.url()}`,
    });
    res.json(await getPageState(page, { sessionId: req.sessionId }));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/evaluate', sessionMiddleware, async (req, res) => {
  try {
    const { code } = req.body;
    if (!code) return res.status(400).json({ error: 'Missing code' });

    const session = await getOrCreateSession(req.sessionId);
    const { page } = session;
    const result = await page.evaluate(code);
    recordAction(session, { action: 'evaluate', summary: 'Evaluated JavaScript in the page' });
    res.json({
      result,
      ...(await getPageState(page, { screenshot: false, sessionId: req.sessionId })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/inspect', sessionMiddleware, async (req, res) => {
  try {
    const session = await getOrCreateSession(req.sessionId);
    const { page } = session;
    recordAction(session, { action: 'inspect', summary: `Inspected ${page.url()}` });
    res.json(await getPageState(page, { screenshot: false, sessionId: req.sessionId }));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/back', sessionMiddleware, async (req, res) => {
  try {
    const session = await getOrCreateSession(req.sessionId);
    const { page } = session;
    await page.goBack({ waitUntil: 'networkidle' });
    recordAction(session, { action: 'back', summary: `Went back to ${page.url()}` });
    res.json(await getPageState(page, { screenshot: false, sessionId: req.sessionId }));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/forward', sessionMiddleware, async (req, res) => {
  try {
    const session = await getOrCreateSession(req.sessionId);
    const { page } = session;
    await page.goForward({ waitUntil: 'networkidle' });
    recordAction(session, { action: 'forward', summary: `Went forward to ${page.url()}` });
    res.json(await getPageState(page, { screenshot: false, sessionId: req.sessionId }));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/viewer', sessionMiddleware, async (req, res) => {
  res.set('Content-Type', 'text/html; charset=utf-8');
  res.send(
    renderViewerHtml({
      basePath: typeof req.query.basePath === 'string' ? req.query.basePath : undefined,
      sessionId: req.sessionId,
    }),
  );
});

app.get('/events', sessionMiddleware, async (req, res) => {
  res.set({
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'Content-Type': 'text/event-stream',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders?.();

  let closed = false;
  let timer;
  req.on('close', () => {
    closed = true;
    clearTimeout(timer);
  });

  const sendFrame = async () => {
    if (closed) return;
    try {
      const session = await getOrCreateSession(req.sessionId);
      res.write(
        `data: ${JSON.stringify(
          await getPageState(session.page, {
            pointer: session.lastPointer,
            sessionId: req.sessionId,
          }),
        )}\n\n`,
      );
    } catch (err) {
      res.write(`event: error\ndata: ${JSON.stringify({ error: err.message })}\n\n`);
    }
  };

  const schedule = async () => {
    if (closed) return;
    await sendFrame();
    if (closed) return;

    const session = sessions.get(req.sessionId);
    const active = session && Date.now() - session.lastInputAt < STREAM_ACTIVE_WINDOW_MS;
    timer = setTimeout(schedule, active ? STREAM_ACTIVE_INTERVAL_MS : STREAM_IDLE_INTERVAL_MS);
  };

  await schedule();
});

app.post('/input', sessionMiddleware, async (req, res) => {
  try {
    const session = await getOrCreateSession(req.sessionId);
    const payload = req.body || {};
    if (typeof payload.x === 'number' && typeof payload.y === 'number') {
      session.lastPointer = { x: payload.x, y: payload.y };
    }
    session.lastInputAt = Date.now();
    await applyInput(session.page, payload);
    await session.page.waitForTimeout(100);
    if (payload.type && payload.type !== 'mousemove') {
      recordAction(session, { action: payload.type, summary: `User ${payload.type} in viewer` });
    }
    res.json(
      await getPageState(session.page, {
        pointer: session.lastPointer,
        screenshot: payload.type !== 'mousemove',
        sessionId: req.sessionId,
      }),
    );
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/page', sessionMiddleware, async (req, res) => {
  res.redirect(307, `/viewer?session=${encodeURIComponent(req.sessionId)}`);
});

app.post('/close', sessionMiddleware, async (req, res) => {
  await destroySession(req.sessionId);
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.info(`Browser service listening on port ${PORT}`);
  console.info(`  Max sessions: ${MAX_SESSIONS}`);
  console.info(`  Session idle timeout: ${SESSION_IDLE_MS / 1000}s`);
});
