import express from 'express';
import { chromium } from 'playwright';

const PORT = Number.parseInt(process.env.PORT || '3100', 10);
const MAX_SESSIONS = Number.parseInt(process.env.MAX_SESSIONS || '20', 10);
const SESSION_IDLE_MS = Number.parseInt(process.env.SESSION_IDLE_MS || '300000', 10);
const STREAM_INTERVAL_MS = Number.parseInt(process.env.STREAM_INTERVAL_MS || '900', 10);
const VIEWPORT = { width: 1280, height: 800 };
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
    const session = { browser, context, lastUsed: Date.now(), page };
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

async function getPageState(page, options = {}) {
  const includeScreenshot = options.screenshot !== false;
  const [title, screenshot] = await Promise.all([
    page.title().catch(() => ''),
    includeScreenshot ? page.screenshot({ fullPage: false, type: 'png' }).catch(() => null) : null,
  ]);

  return {
    title,
    url: page.url(),
    viewport: VIEWPORT,
    ...(screenshot ? { screenshot: screenshot.toString('base64') } : {}),
  };
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
      max-width: 100%;
      max-height: 100%;
      outline: none;
      background: #fff;
      box-shadow: 0 20px 70px rgba(0, 0, 0, 0.45);
      cursor: default;
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

    function endpoint(mode) {
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

    async function sendInput(payload) {
      try {
        await fetch(endpoint('input'), {
          body: JSON.stringify(payload),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
        });
      } catch {
        statusEl.textContent = 'input failed';
      }
    }

    function drawFrame(frame) {
      if (frame.viewport) {
        viewport = frame.viewport;
        canvas.width = viewport.width;
        canvas.height = viewport.height;
      }
      if (frame.url && frame.url !== 'about:blank') {
        urlEl.textContent = frame.title ? frame.title + ' - ' + frame.url : frame.url;
        emptyEl.style.display = 'none';
      }
      if (!frame.screenshot) return;
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
      sendInput({ type: 'click', ...canvasPoint(event) });
    });
    canvas.addEventListener('dblclick', (event) => {
      canvas.focus();
      sendInput({ type: 'dblclick', ...canvasPoint(event) });
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
    const { timeout = 30000, url } = req.body;
    if (!url) return res.status(400).json({ error: 'Missing url' });

    const { page } = await getOrCreateSession(req.sessionId);
    await page.goto(url, { timeout, waitUntil: 'networkidle' });
    res.json(await getPageState(page, { screenshot: false }));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/click', sessionMiddleware, async (req, res) => {
  try {
    const { selector, timeout = 5000 } = req.body;
    if (!selector) return res.status(400).json({ error: 'Missing selector' });

    const { page } = await getOrCreateSession(req.sessionId);
    try {
      await page.waitForSelector(selector, { state: 'visible', timeout });
      await page.click(selector);
    } catch (err) {
      const fallback = await clickElementWithDomFallback(page, selector);
      if (!fallback.ok) throw err;
    }
    await page.waitForTimeout(500);
    res.json(await getPageState(page, { screenshot: false }));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/fill', sessionMiddleware, async (req, res) => {
  try {
    const { selector, text, timeout = 5000 } = req.body;
    if (!selector) return res.status(400).json({ error: 'Missing selector' });

    const { page } = await getOrCreateSession(req.sessionId);
    try {
      await page.waitForSelector(selector, { state: 'visible', timeout });
      await page.fill(selector, text ?? '');
    } catch (err) {
      const fallback = await fillElementWithDomFallback(page, selector, text);
      if (!fallback.ok) throw err;
    }
    await page.waitForTimeout(300);
    res.json(await getPageState(page, { screenshot: false }));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/submit', sessionMiddleware, async (req, res) => {
  try {
    const { selector, timeout = 10000 } = req.body;
    if (!selector) return res.status(400).json({ error: 'Missing selector' });

    const { page } = await getOrCreateSession(req.sessionId);
    await page.waitForSelector(selector, { state: 'attached', timeout });
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
    res.json(await getPageState(page, { screenshot: false }));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/scroll', sessionMiddleware, async (req, res) => {
  try {
    const { x = 0, y = 0 } = req.body;
    const { page } = await getOrCreateSession(req.sessionId);
    await page.evaluate(({ x, y }) => window.scrollTo(x, y), { x, y });
    await page.waitForTimeout(300);
    res.json(await getPageState(page, { screenshot: false }));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/screenshot', sessionMiddleware, async (req, res) => {
  try {
    const { page } = await getOrCreateSession(req.sessionId);
    res.json(await getPageState(page));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/evaluate', sessionMiddleware, async (req, res) => {
  try {
    const { code } = req.body;
    if (!code) return res.status(400).json({ error: 'Missing code' });

    const { page } = await getOrCreateSession(req.sessionId);
    const result = await page.evaluate(code);
    res.json({ result, ...(await getPageState(page, { screenshot: false })) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/back', sessionMiddleware, async (req, res) => {
  try {
    const { page } = await getOrCreateSession(req.sessionId);
    await page.goBack({ waitUntil: 'networkidle' });
    res.json(await getPageState(page, { screenshot: false }));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/forward', sessionMiddleware, async (req, res) => {
  try {
    const { page } = await getOrCreateSession(req.sessionId);
    await page.goForward({ waitUntil: 'networkidle' });
    res.json(await getPageState(page, { screenshot: false }));
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
  req.on('close', () => {
    closed = true;
  });

  const sendFrame = async () => {
    if (closed) return;
    try {
      const { page } = await getOrCreateSession(req.sessionId);
      res.write(`data: ${JSON.stringify(await getPageState(page))}\n\n`);
    } catch (err) {
      res.write(`event: error\ndata: ${JSON.stringify({ error: err.message })}\n\n`);
    }
  };

  await sendFrame();
  const timer = setInterval(sendFrame, STREAM_INTERVAL_MS);
  req.on('close', () => clearInterval(timer));
});

app.post('/input', sessionMiddleware, async (req, res) => {
  try {
    const { page } = await getOrCreateSession(req.sessionId);
    await applyInput(page, req.body || {});
    await page.waitForTimeout(100);
    res.json(await getPageState(page, { screenshot: false }));
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
