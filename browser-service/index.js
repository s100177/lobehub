import { createHash } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { isIP } from 'node:net';
import path from 'node:path';

import express from 'express';
import { chromium } from 'playwright';

import { BridgeError, BridgeSessionManager } from './bridge-session-manager.js';
import { createIframePolicy } from './iframe-policy.js';
import { createServiceAuthMiddleware } from './service-auth.js';

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
const SKILL_PACKS_DIR = process.env.BROWSER_SKILL_PACKS_DIR;
const USER_AGENT =
  process.env.BROWSER_USER_AGENT ||
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36';
const BROWSER_SERVICE_TOKEN = process.env.BROWSER_SERVICE_TOKEN;
const iframePolicy = createIframePolicy(process.env.BROWSER_IFRAME_ALLOWED_ORIGINS);
const ALLOWED_PRIVATE_HOSTS = new Set(
  (process.env.BROWSER_ALLOW_PRIVATE_HOSTS || '')
    .split(',')
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean),
);
const dnsCache = new Map();

const sessions = new Map();
const sessionCreations = new Map();
const sessionModes = new Map();
const sessionOwners = new Map();
const bridgeSessions = new BridgeSessionManager({
  commandTimeoutMs: Number.parseInt(process.env.BRIDGE_COMMAND_TIMEOUT_MS || '15000', 10),
  idleMs: SESSION_IDLE_MS,
  maxSessions: MAX_SESSIONS,
});
let sharedBrowser;
let sharedBrowserCreation;

function isPrivateAddress(address) {
  const normalized = address.toLowerCase().replaceAll(/^\[|\]$/g, '');
  if (normalized === '::' || normalized === '::1') return true;
  if (normalized.startsWith('fc') || normalized.startsWith('fd') || normalized.startsWith('fe80:'))
    return true;
  const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  const ipv4 = (mapped || normalized).match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!ipv4) return false;
  const [, aRaw, bRaw, cRaw] = ipv4;
  const a = Number(aRaw);
  const b = Number(bRaw);
  const c = Number(cRaw);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 192 && b === 0 && c === 0)
  );
}

async function resolveHostAddresses(hostname) {
  if (isIP(hostname)) return [hostname];
  const cached = dnsCache.get(hostname);
  if (cached && cached.expiresAt > Date.now()) return cached.addresses;
  const addresses = (await lookup(hostname, { all: true, verbatim: true })).map(
    ({ address }) => address,
  );
  dnsCache.set(hostname, { addresses, expiresAt: Date.now() + 30_000 });
  return addresses;
}

async function assertNetworkUrlAllowed(input) {
  const url = new URL(input);
  if (['about:', 'blob:', 'data:'].includes(url.protocol)) return;
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('Only HTTP(S) browser requests are allowed');
  }
  const hostname = url.hostname.toLowerCase();
  if (ALLOWED_PRIVATE_HOSTS.has(hostname)) return;
  const addresses = await resolveHostAddresses(hostname);
  if (addresses.some(isPrivateAddress)) {
    const error = new Error(`Private browser destination is not allowed: ${hostname}`);
    error.code = 'BROWSER_SSRF_BLOCKED';
    error.status = 403;
    throw error;
  }
}

async function getSharedBrowser() {
  if (sharedBrowser?.isConnected()) return sharedBrowser;
  if (sharedBrowserCreation) return sharedBrowserCreation;

  sharedBrowserCreation = chromium
    .launch({
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled',
      ],
      headless: true,
    })
    .then((browser) => {
      sharedBrowser = browser;
      browser.once('disconnected', () => {
        if (sharedBrowser === browser) sharedBrowser = undefined;
        for (const [sessionId, session] of sessions) {
          if (session.browser === browser) sessions.delete(sessionId);
        }
      });
      return browser;
    })
    .finally(() => {
      sharedBrowserCreation = undefined;
    });

  return sharedBrowserCreation;
}

async function destroySession(sessionId) {
  const session = sessions.get(sessionId);
  if (!session) return;

  try {
    await session.context.close();
  } catch {
    // Closing an already-dead browser should not block session cleanup.
  }

  sessions.delete(sessionId);
}

async function getOrCreateSession(sessionId) {
  const existing = sessions.get(sessionId);
  if (existing) {
    if (!existing.page.isClosed() && existing.browser.isConnected()) {
      existing.lastUsed = Date.now();
      return existing;
    }
    await destroySession(sessionId);
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

    const browser = await getSharedBrowser();
    const context = await browser.newContext({
      extraHTTPHeaders: {
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      },
      locale: 'zh-CN',
      timezoneId: 'Asia/Shanghai',
      userAgent: USER_AGENT,
      viewport: VIEWPORT,
    });
    await context.route('**/*', async (route) => {
      try {
        await assertNetworkUrlAllowed(route.request().url());
        await route.continue();
      } catch {
        await route.abort('blockedbyclient');
      }
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
      executionEvents: [],
      executionState: undefined,
      inputPauseVersion: 0,
      inspectedInputPauseVersion: 0,
      inspectedInterventionVersion: 0,
      inspectedRiskPauseVersion: 0,
      interventionVersion: 0,
      lastInputAt: Date.now(),
      lastUsed: Date.now(),
      page,
      riskPauseVersion: 0,
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

const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (now - session.lastUsed > SESSION_IDLE_MS) destroySession(id).catch(() => {});
  }
  bridgeSessions.cleanup(now);
  for (const [sessionId, ownerId] of sessionOwners) {
    if (!sessions.has(sessionId) && !bridgeSessions.has(sessionId, ownerId)) {
      sessionModes.delete(sessionId);
      sessionOwners.delete(sessionId);
    }
  }
}, 60_000);
cleanupTimer.unref();

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

async function adoptPageAsCurrentSessionPage(session, nextPage) {
  if (!nextPage || nextPage.isClosed()) return false;

  const previousPage = session.page;
  await nextPage.setViewportSize(VIEWPORT).catch(() => {});
  await nextPage.waitForLoadState('domcontentloaded', { timeout: 5000 }).catch(() => null);
  await nextPage.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => null);
  await nextPage.bringToFront().catch(() => null);
  session.page = nextPage;

  if (previousPage && previousPage !== nextPage && !previousPage.isClosed()) {
    await previousPage.close().catch(() => null);
  }

  recordAction(session, {
    action: 'popup',
    summary: `Kept popup navigation inside the right-side browser: ${nextPage.url()}`,
    target: nextPage.url(),
  });

  return true;
}

async function runWithPopupAdoption(session, action) {
  let popup;
  const capturePage = (page) => {
    if (!popup && page !== session.page) popup = page;
  };

  session.context.on('page', capturePage);
  try {
    const result = await action();
    if (result?.blocked) return result;

    const deadline = Date.now() + 1500;
    while (!popup && Date.now() < deadline) {
      await session.page.waitForTimeout(50).catch(() => null);
    }

    await adoptPageAsCurrentSessionPage(session, popup);

    return result;
  } finally {
    session.context.off('page', capturePage);
  }
}

function resetExecutionState(session) {
  session.executionState = undefined;
  session.executionEvents = [];
}

function createPlanKey(pageState, plan) {
  return [pageState.url || '', pageState.skillPack?.source || 'builtin', plan?.intent || ''].join(
    '::',
  );
}

function ensureExecutionState(session, pageState, plan, restart = false) {
  const planKey = createPlanKey(pageState, plan);
  if (!restart && session.executionState?.planKey === planKey) return session.executionState;

  session.executionState = {
    completedStepIds: [],
    cursor: 0,
    phase: 'acting',
    planIntent: plan?.intent,
    planKey,
    updatedAt: Date.now(),
  };
  return session.executionState;
}

function updateExecutionState(session, patch) {
  const previous = session.executionState || {
    completedStepIds: [],
    cursor: 0,
    phase: 'acting',
  };

  session.executionState = {
    ...previous,
    ...patch,
    updatedAt: Date.now(),
  };
  return session.executionState;
}

function appendExecutionEvent(session, event) {
  session.executionEvents = [...(session.executionEvents || []), event].slice(-50);
  return session.executionEvents;
}

function recordUserIntervention(session, { inputType = 'input', reason } = {}) {
  if (session.executionState?.phase === 'paused_by_user_intervention') return;

  const currentStepId = session.executionState?.currentStepId;
  const blockedStepId =
    currentStepId || session.executionState?.blockedStepId || 'user_intervention';
  const summary =
    reason || `Automation paused because the user performed ${inputType} in the browser.`;
  const interventionVersion = (session.interventionVersion || 0) + 1;
  session.interventionVersion = interventionVersion;

  updateExecutionState(session, {
    blockedStepId,
    currentStepId,
    interventionVersion,
    phase: 'paused_by_user_intervention',
  });

  const event = createExecutionEvent({
    action: 'interrupt',
    id: `user_intervention:${Date.now()}`,
    status: 'blocked',
    summary,
  });
  appendExecutionEvent(session, event);
  recordAction(session, {
    action: 'interrupt',
    status: 'blocked',
    summary,
  });

  return event;
}

function recordTaskCancellation(session, { reason } = {}) {
  const currentStepId = session.executionState?.currentStepId;
  const blockedStepId = currentStepId || session.executionState?.blockedStepId || 'task_cancelled';
  const summary = reason || 'Browser automation task was cancelled by the user.';

  updateExecutionState(session, {
    blockedStepId,
    currentStepId,
    phase: 'cancelled',
  });

  const event = createExecutionEvent({
    action: 'cancel',
    id: `task_cancelled:${Date.now()}`,
    status: 'blocked',
    summary,
  });
  appendExecutionEvent(session, event);
  recordAction(session, {
    action: 'cancel',
    status: 'blocked',
    summary,
  });

  return event;
}

function markInterventionInspected(session) {
  if (session.executionState?.phase !== 'paused_by_user_intervention') return;
  session.inspectedInterventionVersion = session.interventionVersion || 0;
  updateExecutionState(session, {
    inspectedInterventionVersion: session.inspectedInterventionVersion,
  });
}

function hasFreshInterventionInspect(session) {
  return (
    (session.inspectedInterventionVersion || 0) >= (session.interventionVersion || 0) &&
    (session.interventionVersion || 0) > 0
  );
}

function markInputPause(session, patch = {}) {
  const inputPauseVersion = (session.inputPauseVersion || 0) + 1;
  session.inputPauseVersion = inputPauseVersion;
  updateExecutionState(session, {
    ...patch,
    inputPauseVersion,
  });
}

function markInputPauseInspected(session) {
  if (session.executionState?.phase !== 'paused_for_input') return;
  session.inspectedInputPauseVersion = session.inputPauseVersion || 0;
  updateExecutionState(session, {
    inspectedInputPauseVersion: session.inspectedInputPauseVersion,
  });
}

function hasFreshInputPauseInspect(session) {
  return (
    (session.inspectedInputPauseVersion || 0) >= (session.inputPauseVersion || 0) &&
    (session.inputPauseVersion || 0) > 0
  );
}

function markRiskPause(session, patch = {}) {
  const riskPauseVersion = (session.riskPauseVersion || 0) + 1;
  session.riskPauseVersion = riskPauseVersion;
  updateExecutionState(session, {
    ...patch,
    riskPauseVersion,
  });
}

function markRiskPauseInspected(session) {
  if (session.executionState?.phase !== 'risk_blocked') return;
  session.inspectedRiskPauseVersion = session.riskPauseVersion || 0;
  updateExecutionState(session, {
    inspectedRiskPauseVersion: session.inspectedRiskPauseVersion,
  });
}

function hasFreshRiskPauseInspect(session) {
  return (
    (session.inspectedRiskPauseVersion || 0) >= (session.riskPauseVersion || 0) &&
    (session.riskPauseVersion || 0) > 0
  );
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
    includePageState
      ? inspectPageState(page, { intent: options.intent }).catch(() => undefined)
      : undefined,
  ]);

  const frameId = screenshot
    ? createHash('sha256').update(screenshot).digest('base64url').slice(0, 16)
    : undefined;
  return {
    embeddable: false,
    mode: 'remote',
    title,
    url: page.url(),
    viewport: VIEWPORT,
    ...(session?.actionEvents?.length ? { actionEvents: session.actionEvents } : {}),
    ...(session?.executionEvents?.length ? { executionTimeline: session.executionEvents } : {}),
    ...(session?.executionState ? { executionState: session.executionState } : {}),
    ...(pageState ? { pageState } : {}),
    ...(pageState?.plan ? { plan: pageState.plan } : {}),
    ...(pointer ? { pointer } : {}),
    ...(screenshot ? { frameId, screenshot: screenshot.toString('base64') } : {}),
    ...(pageState?.skillPack ? { skillPack: pageState.skillPack } : {}),
    ...(pageState?.taskState ? { taskState: pageState.taskState } : {}),
  };
}

function normalizeHttpUrl(input) {
  const url = new URL(input);
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('Only http:// and https:// URLs are supported');
  }

  return url.toString();
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

const ALLOWED_SKILL_STEP_TYPES = new Set([
  'ask',
  'click',
  'fill',
  'inspect',
  'risk_gate',
  'select',
  'verify',
]);

function asStringArray(value, limit = 40) {
  return Array.isArray(value)
    ? value
        .filter((item) => typeof item === 'string')
        .map((item) => item.slice(0, 160))
        .slice(0, limit)
    : undefined;
}

function asOptionalString(value, limit = 160) {
  return typeof value === 'string' && value ? value.slice(0, limit) : undefined;
}

function sanitizeSkillStepAction(action) {
  if (!action || typeof action !== 'object') return undefined;

  const selector = asOptionalString(action.selector, 240);
  if (!selector) return undefined;

  return {
    ...(asOptionalString(action.expectedText, 240)
      ? { expectedText: asOptionalString(action.expectedText, 240) }
      : {}),
    ...(asOptionalString(action.inputKey, 80)
      ? { inputKey: asOptionalString(action.inputKey, 80) }
      : {}),
    selector,
    ...(asOptionalString(action.value, 500) ? { value: asOptionalString(action.value, 500) } : {}),
  };
}

function sanitizeWorkflowLayers(layers) {
  if (!layers || typeof layers !== 'object' || Array.isArray(layers)) return undefined;

  const goal = layers.goal && typeof layers.goal === 'object' ? layers.goal : undefined;
  const constraints =
    layers.constraints && typeof layers.constraints === 'object' ? layers.constraints : undefined;
  const execution =
    layers.execution && typeof layers.execution === 'object' ? layers.execution : undefined;

  const inputPolicy =
    execution?.inputPolicy &&
    typeof execution.inputPolicy === 'object' &&
    !Array.isArray(execution.inputPolicy)
      ? Object.fromEntries(
          Object.entries(execution.inputPolicy)
            .filter(([field, mode]) => typeof field === 'string' && typeof mode === 'string')
            .map(([field, mode]) => [field.slice(0, 80), mode.slice(0, 40)])
            .slice(0, 30),
        )
      : undefined;

  return {
    ...(constraints
      ? {
          constraints: {
            ...(asStringArray(constraints.forbiddenActions, 40)
              ? { forbiddenActions: asStringArray(constraints.forbiddenActions, 40) }
              : {}),
            ...(asStringArray(constraints.riskActions, 40)
              ? { riskActions: asStringArray(constraints.riskActions, 40) }
              : {}),
            ...(asStringArray(constraints.rules, 40)
              ? { rules: asStringArray(constraints.rules, 40) }
              : {}),
          },
        }
      : {}),
    ...(execution
      ? {
          execution: {
            ...(inputPolicy && Object.keys(inputPolicy).length > 0 ? { inputPolicy } : {}),
            ...(asOptionalString(execution.resumePolicy, 120)
              ? { resumePolicy: asOptionalString(execution.resumePolicy, 120) }
              : {}),
            ...(asStringArray(execution.steps, 80)
              ? { steps: asStringArray(execution.steps, 80) }
              : {}),
          },
        }
      : {}),
    ...(goal
      ? {
          goal: {
            ...(asOptionalString(goal.description, 240)
              ? { description: asOptionalString(goal.description, 240) }
              : {}),
            ...(asOptionalString(goal.intent, 120)
              ? { intent: asOptionalString(goal.intent, 120) }
              : {}),
          },
        }
      : {}),
  };
}

function sanitizeSkillPack(pack, source = 'external') {
  if (!pack || typeof pack !== 'object') return undefined;
  if (typeof pack.site !== 'string' || typeof pack.page !== 'string') return undefined;
  if (!Array.isArray(pack.workflows) || pack.workflows.length === 0) return undefined;

  const workflows = pack.workflows
    .filter((workflow) => workflow && typeof workflow === 'object')
    .map((workflow, workflowIndex) => {
      const steps = Array.isArray(workflow.steps)
        ? workflow.steps
            .filter((step) => step && typeof step === 'object')
            .map((step, stepIndex) => {
              const type = ALLOWED_SKILL_STEP_TYPES.has(step.type) ? step.type : undefined;
              if (!type) return undefined;
              const action = sanitizeSkillStepAction(step.action);

              return {
                ...(action ? { action } : {}),
                ...(asStringArray(step.gaps, 12) ? { gaps: asStringArray(step.gaps, 12) } : {}),
                id:
                  typeof step.id === 'string' && step.id
                    ? step.id.slice(0, 80)
                    : `step_${stepIndex + 1}`,
                ...(typeof step.risk === 'string' ? { risk: step.risk.slice(0, 40) } : {}),
                title:
                  typeof step.title === 'string' && step.title
                    ? step.title.slice(0, 160)
                    : `步骤 ${stepIndex + 1}`,
                type,
              };
            })
            .filter(Boolean)
        : [];

      if (steps.length === 0) return undefined;

      return {
        ...(asStringArray(workflow.constraints, 20)
          ? { constraints: asStringArray(workflow.constraints, 20) }
          : {}),
        goal:
          typeof workflow.goal === 'string' && workflow.goal
            ? workflow.goal.slice(0, 200)
            : pack.description || pack.page,
        intent:
          typeof workflow.intent === 'string' && workflow.intent
            ? workflow.intent.slice(0, 120)
            : `${pack.page}_workflow_${workflowIndex + 1}`,
        ...(sanitizeWorkflowLayers(workflow.layers)
          ? { layers: sanitizeWorkflowLayers(workflow.layers) }
          : {}),
        steps,
      };
    })
    .filter(Boolean);

  if (workflows.length === 0) return undefined;

  const match = pack.match && typeof pack.match === 'object' ? pack.match : undefined;

  return {
    ...(asStringArray(pack.ambiguityRules, 30)
      ? { ambiguityRules: asStringArray(pack.ambiguityRules, 30) }
      : {}),
    ...(Array.isArray(pack.confirmationPoints)
      ? {
          confirmationPoints: pack.confirmationPoints
            .filter((point) => point && typeof point === 'object')
            .map((point, index) => ({
              id:
                typeof point.id === 'string' && point.id
                  ? point.id.slice(0, 80)
                  : `confirmation_${index + 1}`,
              ...(typeof point.reason === 'string' ? { reason: point.reason.slice(0, 200) } : {}),
              title:
                typeof point.title === 'string' && point.title
                  ? point.title.slice(0, 120)
                  : '确认点',
            }))
            .slice(0, 20),
        }
      : {}),
    description:
      typeof pack.description === 'string' && pack.description
        ? pack.description.slice(0, 240)
        : pack.page,
    ...(asStringArray(pack.entities, 40) ? { entities: asStringArray(pack.entities, 40) } : {}),
    ...(Array.isArray(pack.fillGaps)
      ? {
          fillGaps: pack.fillGaps
            .filter((gap) => gap && typeof gap === 'object' && typeof gap.field === 'string')
            .map((gap) => ({
              field: gap.field.slice(0, 80),
              mode: ['ask_user', 'auto_suggest', 'manual_only', 'auto_fill_if_known'].includes(
                gap.mode,
              )
                ? gap.mode
                : 'ask_user',
              reason:
                typeof gap.reason === 'string' && gap.reason
                  ? gap.reason.slice(0, 200)
                  : '外部技能包要求补齐该字段',
            }))
            .slice(0, 30),
        }
      : {}),
    ...(match
      ? {
          match: {
            ...(asStringArray(match.keywords, 30)
              ? { keywords: asStringArray(match.keywords, 30) }
              : {}),
            ...(asStringArray(match.paths, 30) ? { paths: asStringArray(match.paths, 30) } : {}),
            ...(typeof match.pageType === 'string'
              ? { pageType: match.pageType.slice(0, 80) }
              : {}),
          },
        }
      : {}),
    page: pack.page.slice(0, 120),
    pageType:
      typeof pack.pageType === 'string' && pack.pageType ? pack.pageType.slice(0, 80) : 'page',
    ...(asStringArray(pack.riskActions, 40)
      ? { riskActions: asStringArray(pack.riskActions, 40) }
      : {}),
    ...(asStringArray(pack.safeActions, 40)
      ? { safeActions: asStringArray(pack.safeActions, 40) }
      : {}),
    site: pack.site.slice(0, 160),
    source,
    workflows,
  };
}

function loadExternalSkillPacks(dir) {
  if (!dir || !existsSync(dir)) return [];

  const loaded = [];
  for (const file of readdirSync(dir)
    .filter((entry) => entry.endsWith('.json'))
    .sort()) {
    try {
      const parsed = JSON.parse(readFileSync(path.join(dir, file), 'utf8'));
      const packs = Array.isArray(parsed) ? parsed : [parsed];
      for (const pack of packs) {
        const sanitized = sanitizeSkillPack(pack, `file:${file}`);
        if (sanitized) loaded.push(sanitized);
      }
    } catch (err) {
      console.warn(`Failed to load browser skill pack ${file}: ${err.message}`);
    }
  }

  return loaded;
}

const externalSkillPacks = loadExternalSkillPacks(SKILL_PACKS_DIR);

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

function createExecutionEvent({ action, id, status, summary, target }) {
  return {
    ...(action ? { action } : {}),
    id,
    status,
    summary,
    ...(target ? { target } : {}),
    timestamp: Date.now(),
  };
}

async function inspectPageState(page, options = {}) {
  const requestedIntent =
    typeof options.intent === 'string' && options.intent.trim() ? options.intent.trim() : undefined;

  return await page.evaluate(
    ({ externalSkillPacks, requestedIntent }) => {
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

      const cssEscape = (value) =>
        globalThis.CSS?.escape
          ? globalThis.CSS.escape(value)
          : String(value).replaceAll(/[^\w-]/g, '\\$&');

      const cssAttrEscape = (value) =>
        String(value).replaceAll('\\', '\\\\').replaceAll('"', '\\"');

      const isUniqueSelector = (selector) => {
        try {
          return document.querySelectorAll(selector).length === 1;
        } catch {
          return false;
        }
      };

      const selectorFor = (element) => {
        if (element.id) {
          const idSelector = `#${cssEscape(element.id)}`;
          if (isUniqueSelector(idSelector)) return idSelector;
        }

        for (const attr of ['data-testid', 'data-test-id', 'data-cy', 'name', 'aria-label']) {
          const value = element.getAttribute(attr);
          if (!value) continue;

          const selector = `${element.tagName.toLowerCase()}[${attr}="${cssAttrEscape(value)}"]`;
          if (isUniqueSelector(selector)) return selector;
        }

        const parts = [];
        let current = element;
        while (current && current.nodeType === Node.ELEMENT_NODE && current !== document.body) {
          const tag = current.tagName.toLowerCase();
          const parent = current.parentElement;
          if (!parent) break;

          const siblings = [...parent.children].filter(
            (child) => child.tagName === current.tagName,
          );
          const index = siblings.indexOf(current) + 1;
          parts.unshift(siblings.length > 1 ? `${tag}:nth-of-type(${index})` : tag);

          const selector = parts.join(' > ');
          if (isUniqueSelector(selector)) return selector;

          current = parent;
        }

        return parts.length > 0 ? `body > ${parts.join(' > ')}` : element.tagName.toLowerCase();
      };

      const rectFor = (element) => {
        const rect = element.getBoundingClientRect();
        const x = Math.max(0, Math.min(window.innerWidth, rect.left));
        const y = Math.max(0, Math.min(window.innerHeight, rect.top));
        const right = Math.max(0, Math.min(window.innerWidth, rect.right));
        const bottom = Math.max(0, Math.min(window.innerHeight, rect.bottom));

        return {
          height: Math.max(1, Math.round((bottom - y) * 10) / 10),
          width: Math.max(1, Math.round((right - x) * 10) / 10),
          x: Math.round(x * 10) / 10,
          y: Math.round(y * 10) / 10,
        };
      };

      const highlightFor = (element, label) => {
        if (!element || !visible(element)) return undefined;

        return {
          ...rectFor(element),
          label: clean(label).slice(0, 120),
          selector: selectorFor(element),
        };
      };

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
        return clean(
          explicit?.innerText || implicit?.innerText || aria || placeholder || parentText,
        );
      };

      const fieldCandidates = [...document.querySelectorAll('input, textarea, select')]
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
            element,
            field: {
              ...(isCheckbox || isRadio ? { checked: element.checked } : {}),
              label: fieldLabel(element).slice(0, 120),
              ...(element instanceof HTMLSelectElement
                ? {
                    options: [...element.options]
                      .map((option) => clean(option.textContent))
                      .slice(0, 30),
                  }
                : {}),
              selector: selectorFor(element),
              value: clean(value).slice(0, 120),
            },
          };
        })
        .filter(({ field }) => field.label || field.value);

      const fields = fieldCandidates.map(({ field }) => field);

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

      const actionCandidates = [
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
            action: {
              ...(classifyRisk(text) ? { risk: classifyRisk(text) } : {}),
              selector: selectorFor(element),
              text: text.slice(0, 120),
            },
            element,
          };
        })
        .filter(Boolean)
        .slice(0, 60);

      const actions = actionCandidates.map(({ action }) => action);

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

      const pageType = (() => {
        if (/登录|sign in|log in|账号密码|验证码|手机号验证/i.test(bodyText)) return 'login';
        if (/购物车|立即购买|下单|支付|订单|结算|购买/.test(bodyText)) return 'purchase';
        if (/搜索|查询|结果|百度一下|google|bing/i.test(bodyText)) return 'search';
        if (fields.length > 0 && /提交|保存|申请|表单|审批/.test(bodyText)) return 'form';
        if (/控制台|仪表盘|dashboard|overview|资源|管理/i.test(bodyText)) return 'dashboard';
        return 'page';
      })();

      const loggedIn = !/登录|sign in|log in|请先登录|未登录/i.test(bodyText);
      const confirmBeforeProceed = Boolean(
        /立即购买|下单|提交订单|去支付|确认支付|删除|释放|授权|开通|保存更改/.test(bodyText),
      );
      const needsUserAttention = Boolean(
        confirmBeforeProceed || /多个|请选择|二选一|请确认|需要补充|缺少|未填写/.test(bodyText),
      );

      const confirmationPoints = [
        {
          id: 'before_risk_action',
          reason: '页面存在购买、支付、提交或删除类动作',
          title: '风险动作前确认',
        },
      ].filter(() => confirmBeforeProceed);

      const gaps = [];
      if (!loggedIn) gaps.push('login_required');
      if (needsUserAttention) gaps.push('user_attention_required');
      if (fields.some((field) => !field.value && field.label)) gaps.push('missing_field_values');

      const workflowHints = [];
      if (pageType === 'login') workflowHints.push('先完成登录，再继续当前任务');
      if (pageType === 'search') workflowHints.push('先输入搜索词，再提交搜索');
      if (pageType === 'purchase') workflowHints.push('读取配置并停在确认前');
      if (pageType === 'form') workflowHints.push('先补全必填字段，再提交前确认');
      if (pageType === 'dashboard') workflowHints.push('先读取当前资源状态，再判断下一步');

      const taskState = (() => {
        if (!loggedIn) return 'needs_more_info';
        if (confirmBeforeProceed) return 'waiting_user_authorization';
        if (needsUserAttention) return 'asking_clarification';
        if (pageType === 'purchase') return 'plan_ready';
        if (pageType === 'search' || pageType === 'form' || pageType === 'dashboard')
          return 'understanding';
        return 'idle';
      })();

      const matchesExternalSkillPack = (pack) => {
        const site = location.hostname || 'local-page';
        const path = `${location.pathname}${location.search}`;
        const haystack = `${location.href} ${document.title} ${bodyText}`.toLowerCase();
        const siteMatches = !pack.site || site === pack.site || site.endsWith(`.${pack.site}`);
        const pageTypeMatches =
          !pack.match?.pageType || pageType === 'page' || pack.match.pageType === pageType;
        const pathMatches =
          !pack.match?.paths?.length || pack.match.paths.some((item) => path.includes(item));
        const keywordMatches =
          !pack.match?.keywords?.length ||
          pack.match.keywords.some((keyword) => haystack.includes(String(keyword).toLowerCase()));

        return siteMatches && pageTypeMatches && pathMatches && keywordMatches;
      };

      const externalSkillPack = externalSkillPacks.find(matchesExternalSkillPack);

      const buildSkillPack = () => {
        if (externalSkillPack) return externalSkillPack;

        const site = location.hostname || 'local-page';
        const isCloudBuyPage = /kiki-cloud-buy|云服务器购买|订单确认/i.test(
          `${location.pathname} ${bodyText}`,
        );

        if (isCloudBuyPage) {
          return {
            ambiguityRules: [
              '多个地域、规格或预算都可行时必须询问用户',
              '预算缺失时先询问或给出推荐',
            ],
            confirmationPoints: [
              {
                id: 'before_order',
                reason: '提交订单、购买、支付、删除、释放和授权都属于风险动作',
                title: '风险动作前确认',
              },
            ],
            description: '云服务器购买/订单确认页面',
            entities: ['region', 'scenario', 'instanceType', 'price', 'budget'],
            fillGaps: [
              {
                field: 'region',
                mode: 'ask_user',
                reason: '地域影响延迟、价格和资源可用性',
              },
              {
                field: 'budget',
                mode: 'ask_user',
                reason: '预算决定推荐配置上限',
              },
            ],
            page: 'cloud_buy',
            pageType: 'purchase',
            riskActions: ['purchase', 'payment', 'submit_order', 'delete', 'release', 'authorize'],
            safeActions: [
              'inspect_configuration',
              'select_region',
              'select_instance',
              'read_price',
            ],
            site,
            workflows: [
              {
                constraints: ['不要付款', '不要提交订单', '风险动作前必须停下'],
                goal: '选择适合目标的云服务器配置并停在风险确认前',
                intent: 'cloud_server_purchase',
                steps: [
                  { id: 'inspect', title: '读取当前配置、价格和登录态', type: 'inspect' },
                  {
                    gaps: ['region', 'budget'],
                    id: 'collect_requirements',
                    title: '补齐地域、预算或用途等关键信息',
                    type: 'ask',
                  },
                  { id: 'select_config', title: '选择安全范围内的地域和实例规格', type: 'select' },
                  { id: 'read_price', title: '读取并核对费用', type: 'verify' },
                  {
                    id: 'risk_gate',
                    risk: 'purchase',
                    title: '停在购买、支付或提交订单前等待用户确认',
                    type: 'risk_gate',
                  },
                ],
              },
              {
                constraints: ['不要付款', '不要提交订单', '只核对当前可见配置和价格'],
                goal: '配置一套合适方案，但停在下单前',
                intent: 'configure_before_purchase',
                steps: [
                  { id: 'inspect', title: '读取当前配置、价格和登录态', type: 'inspect' },
                  { id: 'read_price', title: '读取并核对费用', type: 'verify' },
                  {
                    id: 'risk_gate',
                    risk: 'purchase',
                    title: '停在购买、支付或提交订单前等待用户确认',
                    type: 'risk_gate',
                  },
                ],
              },
            ],
          };
        }

        if (pageType === 'search') {
          return {
            ambiguityRules: ['搜索词缺失时必须询问用户'],
            description: '搜索页面',
            entities: ['query', 'result'],
            fillGaps: [{ field: 'query', mode: 'ask_user', reason: '搜索词决定查询目标' }],
            page: 'search',
            pageType: 'search',
            riskActions: [],
            safeActions: ['fill_query', 'submit_search', 'open_result'],
            site,
            workflows: [
              {
                goal: '输入搜索词并提交搜索',
                intent: 'search_web',
                steps: [
                  { id: 'inspect', title: '读取搜索框和当前页面状态', type: 'inspect' },
                  { gaps: ['query'], id: 'fill_query', title: '填写搜索词', type: 'fill' },
                  { id: 'submit_search', title: '提交搜索表单', type: 'click' },
                  { id: 'verify_results', title: '确认搜索结果已出现', type: 'verify' },
                ],
              },
            ],
          };
        }

        return undefined;
      };

      const skillPack = buildSkillPack();
      const workflow =
        skillPack?.workflows?.find((item) => item.intent === requestedIntent) ||
        skillPack?.workflows?.[0];
      const plan = workflow
        ? {
            confirmationRequired: workflow.steps.some((step) => step.type === 'risk_gate'),
            goal: workflow.goal,
            intent: workflow.intent,
            ...(workflow.layers ? { layers: workflow.layers } : {}),
            source: 'skill_pack',
            steps: workflow.steps.map((step, index) => ({
              ...step,
              status:
                step.type === 'risk_gate'
                  ? 'blocked'
                  : index === 0
                    ? 'current'
                    : step.gaps?.some(
                          (gap) => gaps.includes(gap) || gaps.includes(`${gap}_required`),
                        )
                      ? 'current'
                      : 'pending',
            })),
          }
        : undefined;

      const currentPlanStep =
        plan?.steps?.find((step) => step.status === 'current') ||
        plan?.steps?.find((step) => step.status === 'blocked');
      const fillGapByField = new Map((skillPack?.fillGaps || []).map((gap) => [gap.field, gap]));
      const findFieldForGap = (gap) =>
        fieldCandidates.find(({ field }) => {
          const descriptor = `${field.label} ${field.selector}`.toLowerCase();
          return descriptor.includes(String(gap).toLowerCase());
        });
      const clarificationFields =
        currentPlanStep?.gaps?.length > 0
          ? currentPlanStep.gaps
          : skillPack?.fillGaps?.map((gap) => gap.field) || [];
      const clarifications = clarificationFields
        .map((fieldName) => {
          const gap = fillGapByField.get(fieldName);
          const matchedField = findFieldForGap(fieldName);
          const options = matchedField?.field.options?.filter(Boolean).map((option, index) => ({
            id: `${fieldName}_${index + 1}`,
            label: option,
            value: option,
          }));

          return {
            field: fieldName,
            id: fieldName,
            ...(options?.length ? { options } : {}),
            question: gap?.reason
              ? `${gap.reason}。请提供 ${fieldName}。`
              : `请提供 ${fieldName}，用于继续执行当前页面任务。`,
            required: gap?.mode !== 'auto_suggest',
          };
        })
        .slice(0, 5);

      const suggestedTasks = (() => {
        const tasks = [];
        const addTask = (task) => {
          if (!task?.title || tasks.some((item) => item.intent === task.intent)) return;
          tasks.push(task);
        };
        const hasRiskAction = actions.some((action) => action.risk);
        const hasPrice = prices.length > 0;
        const missingFieldCount = fields.filter((field) => field.label && !field.value).length;

        if (workflow) {
          addTask({
            intent: workflow.intent,
            reason: skillPack?.description
              ? `当前页面匹配技能包：${skillPack.description}`
              : '当前页面匹配页面技能包 workflow',
            risk: workflow.steps.some((step) => step.type === 'risk_gate' || step.risk)
              ? 'medium'
              : 'low',
            title: workflow.goal || workflow.intent,
          });
        }

        if (pageType === 'purchase') {
          if (hasPrice) {
            addTask({
              intent: 'explain_current_price',
              reason: '页面检测到价格区域，可先审阅价格构成',
              risk: 'low',
              title: '解释当前配置的价格构成',
            });
          }
          addTask({
            intent: 'configure_before_purchase',
            reason: hasRiskAction
              ? '页面存在购买、支付或提交类风险动作，自动化必须停在确认前'
              : '页面包含购买配置字段，可在安全范围内调整配置',
            risk: hasRiskAction ? 'medium' : 'low',
            title: '配置一套合适方案，但停在下单前',
          });
        }

        if (pageType === 'search') {
          addTask({
            intent: 'search_and_summarize',
            reason: '页面检测到搜索输入或结果区域',
            risk: 'low',
            title: '搜索并总结当前结果',
          });
          addTask({
            intent: 'find_official_source',
            reason: '搜索页可对比结果并识别可信来源',
            risk: 'low',
            title: '找到官方网站或可信来源',
          });
        }

        if (pageType === 'form') {
          addTask({
            intent: 'complete_form_before_submit',
            reason:
              missingFieldCount > 0
                ? `页面还有 ${missingFieldCount} 个未填写字段`
                : '页面是表单流程，提交前必须确认',
            risk: confirmBeforeProceed ? 'medium' : 'low',
            title: '补全表单并停在提交前',
          });
        }

        if (pageType === 'dashboard') {
          addTask({
            intent: 'review_resource_status',
            reason: '页面检测到控制台或资源管理信息',
            risk: 'low',
            title: '读取当前资源状态并给出下一步建议',
          });
        }

        if (!loggedIn) {
          addTask({
            intent: 'wait_for_login',
            reason: '当前页面需要用户登录，AI 不会绕过登录或验证码',
            risk: 'medium',
            title: '等待你完成登录后继续',
          });
        }

        if (hasRiskAction) {
          addTask({
            intent: 'review_risky_actions',
            reason: '页面出现购买、支付、提交、删除或授权类动作',
            risk: 'high',
            title: '检查风险动作并标出需要你确认的位置',
          });
        }

        return tasks.slice(0, 4);
      })();

      const targetHighlight = (() => {
        const currentStep =
          plan?.steps?.find((step) => step.status === 'current') ||
          plan?.steps?.find((step) => step.status === 'blocked');
        const riskAction = actionCandidates.find(({ action }) => action.risk);
        const emptyField = fieldCandidates.find(({ field }) => !field.value && field.label);
        const searchField = fieldCandidates.find(({ element, field }) => {
          const inputType = element instanceof HTMLInputElement ? element.type : '';
          const descriptor = `${field.label} ${field.selector}`.toLowerCase();
          return (
            element instanceof HTMLTextAreaElement ||
            element instanceof HTMLSelectElement ||
            ['search', 'text', ''].includes(inputType) ||
            /search|query|wd|kw|搜索|查询/.test(descriptor)
          );
        });
        const submitAction = actionCandidates.find(({ action }) =>
          /搜索|查询|提交|生成推荐|下一步|继续/.test(action.text),
        );

        if (currentStep?.action?.selector) {
          const declaredTarget = document.querySelector(currentStep.action.selector);
          const declaredHighlight = highlightFor(declaredTarget, currentStep.title);
          if (declaredHighlight) return declaredHighlight;
        }

        if (!loggedIn) {
          const loginField = fieldCandidates.find(({ field }) =>
            /账号|登录|密码|验证码/.test(field.label),
          );
          const loginAction = actionCandidates.find(({ action }) =>
            /登录|sign in|log in/i.test(action.text),
          );
          return highlightFor(
            loginField?.element || loginAction?.element,
            loginField?.field.label || loginAction?.action.text || '登录信息',
          );
        }

        if (currentStep?.type === 'risk_gate' || confirmBeforeProceed) {
          return highlightFor(riskAction?.element, riskAction?.action.text || '风险动作');
        }

        if (currentStep?.type === 'ask' || gaps.includes('missing_field_values')) {
          return highlightFor(emptyField?.element, emptyField?.field.label || '待补充字段');
        }

        if (currentStep?.type === 'fill' || pageType === 'search') {
          return highlightFor(
            searchField?.element || submitAction?.element,
            searchField?.field.label || submitAction?.action.text || '搜索输入',
          );
        }

        if (currentStep?.type === 'click') {
          return highlightFor(submitAction?.element, submitAction?.action.text || '下一步操作');
        }

        return highlightFor(
          riskAction?.element || actionCandidates[0]?.element || fieldCandidates[0]?.element,
          riskAction?.action.text ||
            actionCandidates[0]?.action.text ||
            fieldCandidates[0]?.field.label ||
            '当前目标',
        );
      })();

      return {
        actions,
        clarifications,
        confirmationPoints,
        confirmBeforeProceed,
        fields,
        gaps,
        loggedIn,
        needsUserAttention,
        pageType,
        prices,
        selectedOptions,
        primaryActions: actions.filter((action) => action.risk).slice(0, 10),
        plan,
        skillPack,
        suggestedTasks,
        targetHighlight,
        taskState,
        workflowHints,
        textSample: bodyText.slice(0, 1000),
        title: document.title,
        url: location.href,
        warnings,
      };
    },
    { externalSkillPacks, requestedIntent },
  );
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

async function selectElementWithDomFallback(page, selector, value) {
  return await page.evaluate(
    ({ selector, value }) => {
      const element = document.querySelector(selector);
      if (!(element instanceof HTMLSelectElement)) return { ok: false, reason: 'not_select' };

      const option = [...element.options].find(
        (item) => item.value === value || item.textContent?.trim() === value,
      );
      if (!option) return { ok: false, reason: 'option_not_found' };

      element.value = option.value;
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));

      return { ok: true, value: element.value };
    },
    { selector, value },
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

async function getBlankLinkTargetBySelector(page, selector) {
  return await page.evaluate((selector) => {
    const element = document.querySelector(selector);
    const link = element?.closest?.('a[href]');
    if (!(link instanceof HTMLAnchorElement)) return undefined;
    if (link.target?.toLowerCase() !== '_blank') return undefined;
    return link.href || undefined;
  }, selector);
}

async function getBlankLinkTargetByPoint(page, x, y) {
  return await page.evaluate(
    ({ x, y }) => {
      const element = document.elementFromPoint(x, y);
      const link = element?.closest?.('a[href]');
      if (!(link instanceof HTMLAnchorElement)) return undefined;
      if (link.target?.toLowerCase() !== '_blank') return undefined;
      return link.href || undefined;
    },
    { x, y },
  );
}

async function navigateBlankLinkInCurrentPage(page, href) {
  if (!href) return false;

  await page.goto(href, { timeout: 30000, waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => null);
  return true;
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

async function performSafeClick(page, selector, timeout = 5000) {
  const riskProbe = await inspectElementRisk(page, selector, 'click');
  if (riskProbe.ok) {
    const risk = classifyRisk(riskProbe.text);
    if (risk) {
      return {
        blocked: true,
        riskBlock: createRiskBlock({
          action: 'click',
          risk,
          selector,
          text: riskProbe.text,
        }),
      };
    }
  }

  const blankLinkTarget = await getBlankLinkTargetBySelector(page, selector).catch(() => undefined);
  if (await navigateBlankLinkInCurrentPage(page, blankLinkTarget)) {
    return { navigatedBlankLink: true, ok: true, target: blankLinkTarget };
  }

  try {
    await page.waitForSelector(selector, { state: 'visible', timeout });
    await page.click(selector);
  } catch (err) {
    const fallback = await clickElementWithDomFallback(page, selector);
    if (!fallback.ok) throw err;
  }
  await page.waitForTimeout(500);

  return { ok: true };
}

async function performSafeFill(page, selector, text, timeout = 5000) {
  try {
    await page.waitForSelector(selector, { state: 'visible', timeout });
    await page.fill(selector, text ?? '');
  } catch (err) {
    const fallback = await fillElementWithDomFallback(page, selector, text);
    if (!fallback.ok) throw err;
  }
  await page.waitForTimeout(300);

  return { ok: true };
}

async function performSafeSelect(page, selector, value, timeout = 5000) {
  try {
    await page.waitForSelector(selector, { state: 'visible', timeout });
    await page.selectOption(selector, { label: value });
  } catch {
    try {
      await page.selectOption(selector, { value });
    } catch (err) {
      const fallback = await selectElementWithDomFallback(page, selector, value);
      if (!fallback.ok) throw err;
    }
  }
  await page.waitForTimeout(300);

  return { ok: true };
}

async function performSafeSubmit(page, selector, timeout = 10000) {
  await page.waitForSelector(selector, { state: 'attached', timeout });
  const riskProbe = await inspectElementRisk(page, selector, 'submit');
  if (riskProbe.ok) {
    const risk = classifyRisk(riskProbe.text);
    if (risk) {
      return {
        blocked: true,
        riskBlock: createRiskBlock({
          action: 'submit',
          risk,
          selector,
          text: riskProbe.text,
        }),
      };
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
  if (!submitted.ok) return { ok: false, reason: submitted.reason };

  await navigation;
  await waitForPageAfterSubmit(page, { beforeTitle, beforeUrl, expectedText, timeout });

  return { ok: true };
}

function getSessionId(req) {
  return req.headers['x-session-id'] || req.query.session;
}

function sessionMiddleware(req, res, next) {
  const sessionId = getSessionId(req);
  if (!sessionId) {
    return res.status(400).json({ error: 'Missing X-Session-ID header or session query' });
  }

  const ownerId = req.headers['x-browser-owner-id'];
  if (!ownerId || Array.isArray(ownerId)) {
    return res
      .status(400)
      .json({ code: 'BROWSER_OWNER_REQUIRED', error: 'Missing X-Browser-Owner-ID header' });
  }

  const existingOwner = sessionOwners.get(sessionId);
  if (existingOwner && existingOwner !== ownerId) {
    return res.status(403).json({
      code: 'BROWSER_SESSION_FORBIDDEN',
      error: 'Browser session belongs to another user',
    });
  }

  sessionOwners.set(sessionId, ownerId);
  req.ownerId = ownerId;
  req.sessionId = sessionId;
  next();
}

function sendBridgeError(res, error) {
  if (error instanceof BridgeError) {
    return res.status(error.status).json({ code: error.code, error: error.message });
  }
  if (error && typeof error === 'object' && typeof error.status === 'number') {
    return res.status(error.status).json({ code: error.code, error: error.message });
  }
  return res.status(500).json({
    code: 'BRIDGE_INTERNAL_ERROR',
    error: error instanceof Error ? error.message : String(error),
  });
}

function isIframeSession(req) {
  return sessionModes.get(req.sessionId) === 'iframe';
}

async function runIframeAction(req, action, params) {
  if (!bridgeSessions.has(req.sessionId, req.ownerId)) {
    throw new BridgeError(
      'BRIDGE_SESSION_EXPIRED',
      'The iframe Bridge session expired. Navigate to the page again before controlling it.',
      410,
    );
  }
  return bridgeSessions.enqueue(req.sessionId, {
    action,
    ownerId: req.ownerId,
    params,
    timeoutMs: typeof params?.timeout === 'number' ? params.timeout : undefined,
  });
}

function renderViewerHtml({ basePath, sessionId, takeover }) {
  const encodedSession = JSON.stringify(sessionId);
  const encodedBasePath = JSON.stringify(basePath || '/api/browser/proxy');
  const encodedTakeover = JSON.stringify(Boolean(takeover));

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
    .takeover-frame {
      pointer-events: none;
      position: absolute;
      z-index: 3;
      inset: 8px;
      display: none;
      border: 3px solid #16a34a;
      border-radius: 18px;
      box-shadow: 0 0 0 0 rgba(22, 163, 74, 0.28);
      animation: takeover-pulse 1.8s ease-in-out infinite;
    }
    .target-box {
      pointer-events: none;
      position: absolute;
      z-index: 4;
      display: none;
      min-width: 16px;
      min-height: 16px;
      border: 3px solid #f59e0b;
      border-radius: 10px;
      background: rgba(245, 158, 11, 0.1);
      box-shadow:
        0 0 0 9999px rgba(15, 23, 42, 0.04),
        0 0 0 8px rgba(245, 158, 11, 0.14),
        0 12px 32px rgba(146, 64, 14, 0.22);
    }
    .target-label {
      position: absolute;
      top: -32px;
      left: 0;
      overflow: hidden;
      max-width: min(360px, 80vw);
      padding: 5px 9px;
      border-radius: 999px;
      color: #fff7ed;
      text-overflow: ellipsis;
      white-space: nowrap;
      background: rgba(15, 23, 42, 0.88);
      font-size: 12px;
      font-weight: 800;
    }
    @keyframes takeover-pulse {
      0% {
        border-color: #16a34a;
        box-shadow: 0 0 0 0 rgba(22, 163, 74, 0.28);
      }
      50% {
        border-color: #06b6d4;
        box-shadow: 0 0 0 7px rgba(6, 182, 212, 0.16);
      }
      100% {
        border-color: #16a34a;
        box-shadow: 0 0 0 0 rgba(22, 163, 74, 0.28);
      }
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
      <div id="takeover-frame" class="takeover-frame" aria-label="AI takeover frame"></div>
      <div id="target-box" class="target-box" aria-label="AI target highlight"><span id="target-label" class="target-label"></span></div>
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
    const takeover = ${encodedTakeover};
    const canvas = document.getElementById('screen');
    const ctx = canvas.getContext('2d');
    const urlEl = document.getElementById('url');
    const statusEl = document.getElementById('status');
    const emptyEl = document.getElementById('empty');
    const takeoverFrameEl = document.getElementById('takeover-frame');
    const targetBoxEl = document.getElementById('target-box');
    const targetLabelEl = document.getElementById('target-label');
    let viewport = { width: 1280, height: 800 };
    let eventSource;
    let lastFrameKey = '';
    let lastPointer = null;
    let lastPointerSentAt = 0;
    let inputQueue = Promise.resolve();

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

    function notifyUserInput(type) {
      window.parent?.postMessage({
        source: 'lobe-browser-viewer',
        type: 'user-input',
        inputType: type,
        sessionId,
      }, window.location.origin);
    }

    function sendInput(payload, options = {}) {
      const run = async () => {
        try {
          const response = await fetch(endpoint('input'), {
            body: JSON.stringify(payload),
            headers: { 'Content-Type': 'application/json' },
            method: 'POST',
          });
          const frame = response.ok ? await response.json().catch(() => null) : null;
          if (options.drawResponse !== false && frame) {
            drawFrame(frame, { force: true });
          }
        } catch {
          statusEl.textContent = 'input failed';
        }
      };

      if (options.ordered === false) {
        void run();
        return;
      }

      inputQueue = inputQueue.then(run, run);
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
      const frameKey = frame.frameId || frame.url + ':' + frame.title + ':' + frame.screenshot.length;
      if (!options.force && frameKey === lastFrameKey) {
        statusEl.textContent = 'live';
        return;
      }
      lastFrameKey = frameKey;
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        if (takeover) {
          drawTargetHighlight(frame.pageState?.targetHighlight);
          updateTakeoverOverlay(frame.pageState?.targetHighlight);
        }
        statusEl.textContent = 'live';
      };
      img.onerror = () => {
        statusEl.textContent = 'frame error';
      };
      img.src = 'data:image/png;base64,' + frame.screenshot;
    }

    function updateTakeoverOverlay(target) {
      takeoverFrameEl.style.display = 'block';
      if (!target || !Number.isFinite(target.x) || !Number.isFinite(target.y) || !Number.isFinite(target.width) || !Number.isFinite(target.height)) {
        targetBoxEl.style.display = 'none';
        return;
      }

      const rect = canvas.getBoundingClientRect();
      const scaleX = rect.width / Math.max(1, viewport.width);
      const scaleY = rect.height / Math.max(1, viewport.height);
      const padding = 5;
      const x = Math.max(0, target.x - padding) * scaleX;
      const y = Math.max(0, target.y - padding) * scaleY;
      const width = Math.max(16, (target.width + padding * 2) * scaleX);
      const height = Math.max(16, (target.height + padding * 2) * scaleY);

      targetBoxEl.style.display = 'block';
      targetBoxEl.style.left = x + 'px';
      targetBoxEl.style.top = y + 'px';
      targetBoxEl.style.width = width + 'px';
      targetBoxEl.style.height = height + 'px';
      targetLabelEl.textContent = target.label ? 'AI 正在操作：' + target.label : 'AI 正在操作';
    }

    function drawTargetHighlight(target) {
      if (!target || !Number.isFinite(target.x) || !Number.isFinite(target.y)) return;
      if (!Number.isFinite(target.width) || !Number.isFinite(target.height)) return;

      const padding = 5;
      const x = Math.max(0, target.x - padding);
      const y = Math.max(0, target.y - padding);
      const width = Math.min(canvas.width - x, target.width + padding * 2);
      const height = Math.min(canvas.height - y, target.height + padding * 2);

      ctx.save();
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#f59e0b';
      ctx.fillStyle = 'rgba(245, 158, 11, 0.12)';
      ctx.shadowColor = 'rgba(245, 158, 11, 0.55)';
      ctx.shadowBlur = 16;
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') {
        ctx.roundRect(x, y, width, height, 10);
      } else {
        ctx.rect(x, y, width, height);
      }
      ctx.fill();
      ctx.stroke();

      if (target.label) {
        const label = 'AI 正在操作：' + target.label;
        ctx.font = 'bold 13px sans-serif';
        const metrics = ctx.measureText(label);
        const labelWidth = Math.min(canvas.width - 16, metrics.width + 20);
        const labelX = Math.min(Math.max(8, x), canvas.width - labelWidth - 8);
        const labelY = y > 34 ? y - 34 : Math.min(canvas.height - 34, y + height + 8);
        ctx.shadowBlur = 10;
        ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
        ctx.fillRect(labelX, labelY, labelWidth, 26);
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#fff7ed';
        ctx.fillText(label, labelX + 10, labelY + 18, labelWidth - 20);
      }
      ctx.restore();
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
      notifyUserInput('click');
      sendInput({ type: 'click', ...lastPointer });
    });
    canvas.addEventListener('dblclick', (event) => {
      canvas.focus();
      lastPointer = canvasPoint(event);
      notifyUserInput('dblclick');
      sendInput({ type: 'dblclick', ...lastPointer });
    });
    canvas.addEventListener('mousemove', (event) => {
      lastPointer = canvasPoint(event);
      const now = Date.now();
      if (now - lastPointerSentAt < 120) return;
      lastPointerSentAt = now;
      sendInput({ type: 'mousemove', ...lastPointer }, { drawResponse: false, ordered: false });
    });
    canvas.addEventListener('wheel', (event) => {
      event.preventDefault();
      notifyUserInput('wheel');
      sendInput({ deltaX: event.deltaX, deltaY: event.deltaY, type: 'wheel' });
    }, { passive: false });
    canvas.addEventListener('keydown', (event) => {
      event.preventDefault();
      notifyUserInput('key');
      sendInput({
        altKey: event.altKey,
        code: event.code,
        ctrlKey: event.ctrlKey,
        key: event.key,
        metaKey: event.metaKey,
        shiftKey: event.shiftKey,
        screenshot: false,
        type: 'key',
      }, { drawResponse: false });
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
app.use(createServiceAuthMiddleware(BROWSER_SERVICE_TOKEN));

app.get('/status', async (req, res) => {
  const memory = process.memoryUsage();
  res.json({
    bridgeSessions: bridgeSessions.size,
    browserConnected: Boolean(sharedBrowser?.isConnected()),
    maxSessions: MAX_SESSIONS,
    memory: {
      external: memory.external,
      heapTotal: memory.heapTotal,
      heapUsed: memory.heapUsed,
      rss: memory.rss,
    },
    ok: true,
    remoteSessions: sessions.size,
    sessions: sessions.size + bridgeSessions.size,
  });
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
      if (mode === 'iframe') iframePolicy.assertAllowed(normalizedUrl);
      const embed =
        mode === 'iframe' || (mode === 'auto' && iframePolicy.shouldAutoUse(normalizedUrl))
          ? { embeddable: true, finalUrl: normalizedUrl }
          : {
              embeddable: false,
              fallbackReason:
                'Remote mode selected for public web navigation to keep links inside the right-side browser',
              finalUrl: normalizedUrl,
            };

      if (embed.embeddable) {
        await destroySession(req.sessionId);
        bridgeSessions.destroy(req.sessionId, req.ownerId);
        bridgeSessions.register(req.sessionId, { ownerId: req.ownerId, url: embed.finalUrl });
        sessionModes.set(req.sessionId, 'iframe');
        return res.json({
          ...getIframePageState({
            fallbackReason: embed.fallbackReason,
            finalUrl: embed.finalUrl,
            requestedMode: mode,
          }),
          bridgeStatus: 'waiting',
        });
      }

      fallbackReason = embed.fallbackReason;
    }

    await assertNetworkUrlAllowed(normalizedUrl);
    bridgeSessions.destroy(req.sessionId, req.ownerId);
    sessionModes.set(req.sessionId, 'remote');
    const session = await getOrCreateSession(req.sessionId);
    const { page } = session;
    await page.goto(normalizedUrl, { timeout, waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => null);
    resetExecutionState(session);
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
    sendBridgeError(res, err);
  }
});

app.post('/click', sessionMiddleware, async (req, res) => {
  try {
    const { selector, timeout = 5000 } = req.body;
    if (!selector) return res.status(400).json({ error: 'Missing selector' });

    if (isIframeSession(req)) return res.json(await runIframeAction(req, 'click', req.body));

    const session = await getOrCreateSession(req.sessionId);
    const clicked = await runWithPopupAdoption(session, () =>
      performSafeClick(session.page, selector, timeout),
    );
    resetExecutionState(session);
    if (clicked.blocked) {
      recordAction(session, {
        action: 'click',
        status: 'blocked',
        summary: clicked.riskBlock.reason,
        target: selector,
      });
      return res.json(
        withRiskBlock(
          await getPageState(session.page, { screenshot: false, sessionId: req.sessionId }),
          clicked.riskBlock,
        ),
      );
    }
    recordAction(session, { action: 'click', summary: `Clicked ${selector}`, target: selector });
    res.json(await getPageState(session.page, { screenshot: false, sessionId: req.sessionId }));
  } catch (err) {
    sendBridgeError(res, err);
  }
});

app.post('/fill', sessionMiddleware, async (req, res) => {
  try {
    const { selector, text, timeout = 5000 } = req.body;
    if (!selector) return res.status(400).json({ error: 'Missing selector' });

    if (isIframeSession(req)) return res.json(await runIframeAction(req, 'fill', req.body));

    const session = await getOrCreateSession(req.sessionId);
    const { page } = session;
    await performSafeFill(page, selector, text, timeout);
    resetExecutionState(session);
    recordAction(session, { action: 'fill', summary: `Filled ${selector}`, target: selector });
    res.json(await getPageState(page, { screenshot: false, sessionId: req.sessionId }));
  } catch (err) {
    sendBridgeError(res, err);
  }
});

app.post('/submit', sessionMiddleware, async (req, res) => {
  try {
    const { selector, timeout = 10000 } = req.body;
    if (!selector) return res.status(400).json({ error: 'Missing selector' });

    if (isIframeSession(req)) return res.json(await runIframeAction(req, 'submit', req.body));

    const session = await getOrCreateSession(req.sessionId);
    const submitted = await runWithPopupAdoption(session, () =>
      performSafeSubmit(session.page, selector, timeout),
    );
    resetExecutionState(session);
    if (submitted.blocked) {
      recordAction(session, {
        action: 'submit',
        status: 'blocked',
        summary: submitted.riskBlock.reason,
        target: selector,
      });
      return res.json(
        withRiskBlock(
          await getPageState(session.page, { screenshot: false, sessionId: req.sessionId }),
          submitted.riskBlock,
        ),
      );
    }
    if (!submitted.ok)
      return res.status(400).json({ error: `Failed to submit form: ${submitted.reason}` });
    recordAction(session, { action: 'submit', summary: `Submitted ${selector}`, target: selector });
    res.json(await getPageState(session.page, { screenshot: false, sessionId: req.sessionId }));
  } catch (err) {
    sendBridgeError(res, err);
  }
});

app.post('/scroll', sessionMiddleware, async (req, res) => {
  try {
    const { x = 0, y = 0 } = req.body;
    if (isIframeSession(req)) return res.json(await runIframeAction(req, 'scroll', { x, y }));
    const session = await getOrCreateSession(req.sessionId);
    const { page } = session;
    await page.evaluate(({ x, y }) => window.scrollTo(x, y), { x, y });
    await page.waitForTimeout(300);
    resetExecutionState(session);
    recordAction(session, { action: 'scroll', summary: `Scrolled to x=${x}, y=${y}` });
    res.json(await getPageState(page, { screenshot: false, sessionId: req.sessionId }));
  } catch (err) {
    sendBridgeError(res, err);
  }
});

app.post('/screenshot', sessionMiddleware, async (req, res) => {
  try {
    if (isIframeSession(req)) {
      return res.status(409).json({
        code: 'BRIDGE_ACTION_UNSUPPORTED',
        error:
          'Screenshots are unavailable in iframe mode; inspect the visible page or switch to Remote mode',
      });
    }
    const session = await getOrCreateSession(req.sessionId);
    const { page } = session;
    recordAction(session, {
      action: 'screenshot',
      summary: `Captured screenshot for ${page.url()}`,
    });
    res.json(await getPageState(page, { sessionId: req.sessionId }));
  } catch (err) {
    sendBridgeError(res, err);
  }
});

app.post('/evaluate', sessionMiddleware, async (req, res) => {
  try {
    const { code } = req.body;
    if (!code) return res.status(400).json({ error: 'Missing code' });

    if (isIframeSession(req)) {
      return res.status(409).json({
        code: 'BRIDGE_ACTION_UNSUPPORTED',
        error: 'Arbitrary JavaScript is disabled in iframe Bridge mode',
      });
    }

    const session = await getOrCreateSession(req.sessionId);
    const { page } = session;
    const result = await page.evaluate(code);
    recordAction(session, { action: 'evaluate', summary: 'Evaluated JavaScript in the page' });
    res.json({
      result,
      ...(await getPageState(page, { screenshot: false, sessionId: req.sessionId })),
    });
  } catch (err) {
    sendBridgeError(res, err);
  }
});

app.post('/execute-plan', sessionMiddleware, async (req, res) => {
  try {
    if (isIframeSession(req)) {
      return res.status(409).json({
        code: 'BRIDGE_ACTION_UNSUPPORTED',
        error:
          'Multi-step plans are not available in iframe Bridge mode yet; use inspect and explicit safe actions',
      });
    }
    const {
      authorized = false,
      inspectedAfterPause = false,
      inspectedAfterIntervention = false,
      inspectedAfterRisk = false,
      inputs = {},
      intent,
      maxSteps = 4,
      restart = false,
      timeout = 10000,
    } = req.body || {};
    const session = await getOrCreateSession(req.sessionId);
    let page = session.page;
    const executionEvents = [];
    const finalizeExecutionEvents = (events) => {
      for (const event of events) appendExecutionEvent(session, event);
      return events;
    };
    const getCurrentPageState = (extra = {}) =>
      getPageState(session.page, {
        intent,
        screenshot: false,
        sessionId: req.sessionId,
        ...extra,
      });

    let pageState = await inspectPageState(page, { intent });
    if (!pageState.loggedIn) {
      updateExecutionState(session, {
        blockedStepId: 'login_required',
        phase: 'paused_for_login',
      });
      const events = finalizeExecutionEvents([
        createExecutionEvent({
          id: 'login_required',
          status: 'blocked',
          summary: 'Execution stopped because the page requires user login.',
        }),
      ]);
      const state = await getCurrentPageState();
      return res.json({
        ...state,
        executionEvents: events,
        taskState: 'needs_more_info',
      });
    }

    const plan = pageState.plan;
    if (!plan?.steps?.length) {
      updateExecutionState(session, {
        blockedStepId: 'plan_missing',
        phase: 'paused_for_input',
      });
      const events = finalizeExecutionEvents([
        createExecutionEvent({
          id: 'plan_missing',
          status: 'blocked',
          summary: 'Execution stopped because no page skill-pack plan is available.',
        }),
      ]);
      const state = await getCurrentPageState();
      return res.json({
        ...state,
        executionEvents: events,
        taskState: pageState.taskState || 'failed',
      });
    }

    if (authorized !== true) {
      updateExecutionState(session, {
        blockedStepId: plan.steps[0]?.id || 'authorization_required',
        currentStepId: plan.steps[0]?.id,
        phase: 'waiting_authorization',
      });
      const events = finalizeExecutionEvents([
        createExecutionEvent({
          action: 'authorize',
          id: 'authorization_required',
          status: 'blocked',
          summary: 'Execution stopped because user authorization is required before automation.',
        }),
      ]);
      const state = await getCurrentPageState();
      return res.json({
        ...state,
        executionEvents: events,
        executionState: session.executionState,
        taskState: 'waiting_user_authorization',
      });
    }

    if (
      session.executionState?.phase === 'paused_by_user_intervention' &&
      (inspectedAfterIntervention !== true || !hasFreshInterventionInspect(session))
    ) {
      const events = finalizeExecutionEvents([
        createExecutionEvent({
          action: 'inspect',
          id: 'inspect_required_after_intervention',
          status: 'blocked',
          summary:
            'Execution stopped because user intervention requires a fresh inspect before resume.',
        }),
      ]);
      const state = await getCurrentPageState();
      return res.json({
        ...state,
        executionEvents: events,
        executionState: session.executionState,
        taskState: 'paused_by_user_intervention',
      });
    }

    if (
      session.executionState?.phase === 'paused_for_input' &&
      (inspectedAfterPause !== true || !hasFreshInputPauseInspect(session))
    ) {
      const events = finalizeExecutionEvents([
        createExecutionEvent({
          action: 'inspect',
          id: 'inspect_required_after_input',
          status: 'blocked',
          summary:
            'Execution stopped because user-provided inputs require a fresh inspect before resume.',
        }),
      ]);
      const state = await getCurrentPageState();
      return res.json({
        ...state,
        executionEvents: events,
        executionState: session.executionState,
        taskState: 'asking_clarification',
      });
    }

    if (
      session.executionState?.phase === 'risk_blocked' &&
      (inspectedAfterRisk !== true || !hasFreshRiskPauseInspect(session))
    ) {
      const events = finalizeExecutionEvents([
        createExecutionEvent({
          action: 'inspect',
          id: 'inspect_required_after_risk',
          status: 'blocked',
          summary:
            'Execution stopped because risk recovery requires a fresh inspect before resume.',
        }),
      ]);
      const state = await getCurrentPageState();
      return res.json({
        ...state,
        executionEvents: events,
        executionState: session.executionState,
        taskState: 'risk_blocked',
      });
    }

    const executionState = ensureExecutionState(session, pageState, plan, restart);
    const startIndex = Math.min(executionState.cursor || 0, plan.steps.length);
    updateExecutionState(session, {
      blockedStepId: undefined,
      currentStepId: plan.steps[startIndex]?.id,
      phase: startIndex >= plan.steps.length ? 'completed' : 'acting',
    });

    const searchField = pageState.fields?.find((field) =>
      /搜索|查询|search|query|kw|wd/i.test(`${field.label} ${field.selector}`),
    );
    const searchAction = pageState.actions?.find((action) => /搜索|查询/.test(action.text));
    const queryText = typeof inputs.query === 'string' ? inputs.query.trim() : '';
    const inputPolicy = plan.layers?.execution?.inputPolicy || {};
    const getStepInputPolicy = (step) => {
      const keys = [
        step.action?.inputKey,
        ...(Array.isArray(step.gaps) ? step.gaps : []),
        step.id,
      ].filter(Boolean);
      const key = keys.find((item) => typeof inputPolicy[item] === 'string');

      return key ? { key, mode: inputPolicy[key] } : undefined;
    };
    const resolveStepValue = (step) => {
      const inputKey = step.action?.inputKey;
      if (inputKey && typeof inputs[inputKey] === 'string') return inputs[inputKey].trim();

      if (typeof step.action?.value === 'string') return step.action.value;

      const gapKey = step.gaps?.find((gap) => typeof inputs[gap] === 'string');
      if (gapKey) return inputs[gapKey].trim();

      return undefined;
    };
    const pushPolicyBlock = (step, policy, action, target) => {
      const inputLabel = policy?.key || step.action?.inputKey || step.gaps?.[0] || step.id;
      const reason =
        policy?.mode === 'manual_only'
          ? `Execution paused because ${inputLabel} is marked manual_only and must be handled by the user.`
          : policy?.mode === 'confirm_before'
            ? `Execution paused before ${inputLabel} because inputPolicy requires confirmation.`
            : `Execution needs input for ${inputLabel}.`;
      markBlocked(step, 'paused_for_input');
      executionEvents.push(
        createExecutionEvent({
          action,
          id: step.id,
          status: 'blocked',
          summary: reason,
          target,
        }),
      );
    };
    let blockedRiskBlock;
    const markCompleted = (step, index) => {
      const completedStepIds = [
        ...new Set([...(session.executionState?.completedStepIds || []), step.id]),
      ];
      updateExecutionState(session, {
        blockedStepId: undefined,
        completedStepIds,
        cursor: Math.max(session.executionState?.cursor || 0, index + 1),
        currentStepId: plan.steps[index + 1]?.id,
        phase: index + 1 >= plan.steps.length ? 'completed' : 'acting',
      });
    };
    const markBlocked = (step, phase = 'paused_for_input') => {
      const patch = {
        blockedStepId: step.id,
        currentStepId: step.id,
        phase,
      };

      if (phase === 'paused_for_input') markInputPause(session, patch);
      else if (phase === 'risk_blocked') markRiskPause(session, patch);
      else updateExecutionState(session, patch);
    };

    for (const [index, step] of plan.steps.entries()) {
      if (index < startIndex) continue;
      if (executionEvents.length >= maxSteps) break;

      if (step.type === 'risk_gate' || step.risk) {
        markBlocked(step, 'risk_blocked');
        blockedRiskBlock = createRiskBlock({
          action: 'click',
          risk: step.risk || 'submit',
          text: step.title,
        });
        executionEvents.push(
          createExecutionEvent({
            id: step.id,
            status: 'blocked',
            summary: `Execution stopped before risky step: ${step.title}`,
          }),
        );
        break;
      }

      if (step.type === 'ask') {
        markBlocked(step, 'paused_for_input');
        executionEvents.push(
          createExecutionEvent({
            id: step.id,
            status: 'blocked',
            summary: `Execution needs user input before continuing: ${step.title}`,
          }),
        );
        break;
      }

      if (step.type === 'verify' && step.action?.expectedText) {
        pageState = await inspectPageState(page, { intent });
        const found = pageState.textSample?.includes(step.action.expectedText);
        executionEvents.push(
          createExecutionEvent({
            action: 'verify',
            id: step.id,
            status: found ? 'completed' : 'blocked',
            summary: found
              ? step.title
              : `Expected page text not found: ${step.action.expectedText}`,
            target: step.action.selector,
          }),
        );
        if (!found) {
          markBlocked(step, 'paused_for_input');
          break;
        }
        markCompleted(step, index);
        continue;
      }

      if (step.type === 'inspect' || step.type === 'verify') {
        pageState = await inspectPageState(page, { intent });
        executionEvents.push(
          createExecutionEvent({
            action: step.type,
            id: step.id,
            status: 'completed',
            summary: step.title,
          }),
        );
        markCompleted(step, index);
        continue;
      }

      if (step.type === 'fill') {
        if (step.action?.selector) {
          const policy = getStepInputPolicy(step);
          const value = resolveStepValue(step);
          if (policy?.mode === 'manual_only' || policy?.mode === 'confirm_before') {
            pushPolicyBlock(step, policy, 'fill', step.action.selector);
            break;
          }
          if (!value) {
            pushPolicyBlock(step, policy, 'fill', step.action.selector);
            break;
          }

          await performSafeFill(page, step.action.selector, value, timeout);
          recordAction(session, {
            action: 'fill',
            summary: `Plan filled ${step.action.selector}`,
            target: step.action.selector,
          });
          executionEvents.push(
            createExecutionEvent({
              action: 'fill',
              id: step.id,
              status: 'completed',
              summary: step.title,
              target: step.action.selector,
            }),
          );
          markCompleted(step, index);
          continue;
        }

        if (!queryText || !searchField?.selector) {
          markBlocked(step, 'paused_for_input');
          executionEvents.push(
            createExecutionEvent({
              action: 'fill',
              id: step.id,
              status: 'blocked',
              summary: 'Execution needs a query input before filling the search field.',
              target: searchField?.selector,
            }),
          );
          break;
        }

        await performSafeFill(page, searchField.selector, queryText, timeout);
        recordAction(session, {
          action: 'fill',
          summary: `Plan filled ${searchField.selector}`,
          target: searchField.selector,
        });
        executionEvents.push(
          createExecutionEvent({
            action: 'fill',
            id: step.id,
            status: 'completed',
            summary: `Filled ${searchField.label || searchField.selector}`,
            target: searchField.selector,
          }),
        );
        markCompleted(step, index);
        continue;
      }

      if (step.type === 'select') {
        const policy = getStepInputPolicy(step);
        const value = resolveStepValue(step);
        if (policy?.mode === 'manual_only' || policy?.mode === 'confirm_before') {
          pushPolicyBlock(step, policy, 'select', step.action?.selector);
          break;
        }
        if (!step.action?.selector || !value) {
          pushPolicyBlock(step, policy, 'select', step.action?.selector);
          break;
        }

        await performSafeSelect(page, step.action.selector, value, timeout);
        recordAction(session, {
          action: 'fill',
          summary: `Plan selected ${step.action.selector}`,
          target: step.action.selector,
        });
        executionEvents.push(
          createExecutionEvent({
            action: 'select',
            id: step.id,
            status: 'completed',
            summary: step.title,
            target: step.action.selector,
          }),
        );
        markCompleted(step, index);
        continue;
      }

      if (step.type === 'click') {
        if (step.action?.selector) {
          const clicked = await runWithPopupAdoption(session, () =>
            performSafeClick(session.page, step.action.selector, timeout),
          );
          page = session.page;
          if (clicked.blocked) {
            markBlocked(step, 'risk_blocked');
            recordAction(session, {
              action: 'click',
              status: 'blocked',
              summary: clicked.riskBlock.reason,
              target: step.action.selector,
            });
            const events = finalizeExecutionEvents([
              ...executionEvents,
              createExecutionEvent({
                action: 'click',
                id: step.id,
                status: 'blocked',
                summary: clicked.riskBlock.reason,
                target: step.action.selector,
              }),
            ]);
            const state = await getCurrentPageState();
            return res.json({
              ...withRiskBlock(state, clicked.riskBlock),
              executionEvents: events,
              taskState: 'risk_blocked',
            });
          }

          recordAction(session, {
            action: 'click',
            summary: `Plan clicked ${step.action.selector}`,
            target: step.action.selector,
          });
          executionEvents.push(
            createExecutionEvent({
              action: 'click',
              id: step.id,
              status: 'completed',
              summary: step.title,
              target: step.action.selector,
            }),
          );
          markCompleted(step, index);
          continue;
        }

        const target = searchAction?.selector || searchField?.selector;
        if (!target) {
          markBlocked(step, 'paused_for_input');
          executionEvents.push(
            createExecutionEvent({
              action: 'click',
              id: step.id,
              status: 'blocked',
              summary: 'Execution stopped because no safe click target was found.',
            }),
          );
          break;
        }

        const submitted = await runWithPopupAdoption(session, () =>
          performSafeSubmit(session.page, target, timeout),
        );
        page = session.page;
        if (submitted.blocked) {
          markBlocked(step, 'risk_blocked');
          recordAction(session, {
            action: 'submit',
            status: 'blocked',
            summary: submitted.riskBlock.reason,
            target,
          });
          const events = finalizeExecutionEvents([
            ...executionEvents,
            createExecutionEvent({
              action: 'submit',
              id: step.id,
              status: 'blocked',
              summary: submitted.riskBlock.reason,
              target,
            }),
          ]);
          const state = await getCurrentPageState();
          return res.json({
            ...withRiskBlock(state, submitted.riskBlock),
            executionEvents: events,
            taskState: 'risk_blocked',
          });
        }
        if (!submitted.ok) throw new Error(`Failed to submit form: ${submitted.reason}`);

        recordAction(session, {
          action: 'submit',
          summary: `Plan submitted ${target}`,
          target,
        });
        executionEvents.push(
          createExecutionEvent({
            action: 'submit',
            id: step.id,
            status: 'completed',
            summary: `Submitted ${target}`,
            target,
          }),
        );
        markCompleted(step, index);
        continue;
      }

      markCompleted(step, index);
      executionEvents.push(
        createExecutionEvent({
          id: step.id,
          status: 'skipped',
          summary: `Skipped unsupported safe step type: ${step.type}`,
        }),
      );
    }

    finalizeExecutionEvents(executionEvents);
    const state = await getCurrentPageState();
    const stopped = executionEvents.find((event) => event.status === 'blocked');
    const completedAllSafeSteps = !stopped && session.executionState?.cursor >= plan.steps.length;

    res.json({
      ...(blockedRiskBlock ? withRiskBlock(state, blockedRiskBlock) : state),
      executionEvents,
      executionState: session.executionState,
      taskState: stopped
        ? session.executionState?.phase === 'risk_blocked'
          ? 'risk_blocked'
          : state.taskState || 'asking_clarification'
        : completedAllSafeSteps
          ? 'completed'
          : state.taskState || 'ai_controlling',
    });
  } catch (err) {
    sendBridgeError(res, err);
  }
});

app.post('/inspect', sessionMiddleware, async (req, res) => {
  try {
    if (isIframeSession(req)) return res.json(await runIframeAction(req, 'inspect', {}));
    const session = await getOrCreateSession(req.sessionId);
    const { page } = session;
    markInterventionInspected(session);
    markInputPauseInspected(session);
    markRiskPauseInspected(session);
    recordAction(session, { action: 'inspect', summary: `Inspected ${page.url()}` });
    res.json(await getPageState(page, { screenshot: false, sessionId: req.sessionId }));
  } catch (err) {
    sendBridgeError(res, err);
  }
});

app.post('/interrupt', sessionMiddleware, async (req, res) => {
  try {
    const session = await getOrCreateSession(req.sessionId);
    const { inputType = 'input', reason } = req.body || {};
    const event = recordUserIntervention(session, {
      inputType: typeof inputType === 'string' ? inputType.slice(0, 40) : 'input',
      reason: typeof reason === 'string' ? reason.slice(0, 240) : undefined,
    });
    const state = await getPageState(session.page, { screenshot: false, sessionId: req.sessionId });
    res.json({
      ...state,
      executionEvents: [event],
      executionState: session.executionState,
      taskState: 'paused_by_user_intervention',
    });
  } catch (err) {
    sendBridgeError(res, err);
  }
});

app.post('/cancel-task', sessionMiddleware, async (req, res) => {
  try {
    const session = await getOrCreateSession(req.sessionId);
    const { reason } = req.body || {};
    const event = recordTaskCancellation(session, {
      reason: typeof reason === 'string' ? reason.slice(0, 240) : undefined,
    });
    const state = await getPageState(session.page, { screenshot: false, sessionId: req.sessionId });
    res.json({
      ...state,
      executionEvents: [event],
      executionState: session.executionState,
      taskState: 'cancelled',
    });
  } catch (err) {
    sendBridgeError(res, err);
  }
});

app.post('/back', sessionMiddleware, async (req, res) => {
  try {
    if (isIframeSession(req)) return res.json(await runIframeAction(req, 'back', {}));
    const session = await getOrCreateSession(req.sessionId);
    const { page } = session;
    await page.goBack({ waitUntil: 'networkidle' });
    recordAction(session, { action: 'back', summary: `Went back to ${page.url()}` });
    res.json(await getPageState(page, { screenshot: false, sessionId: req.sessionId }));
  } catch (err) {
    sendBridgeError(res, err);
  }
});

app.post('/forward', sessionMiddleware, async (req, res) => {
  try {
    if (isIframeSession(req)) return res.json(await runIframeAction(req, 'forward', {}));
    const session = await getOrCreateSession(req.sessionId);
    const { page } = session;
    await page.goForward({ waitUntil: 'networkidle' });
    recordAction(session, { action: 'forward', summary: `Went forward to ${page.url()}` });
    res.json(await getPageState(page, { screenshot: false, sessionId: req.sessionId }));
  } catch (err) {
    sendBridgeError(res, err);
  }
});

app.get('/viewer', sessionMiddleware, async (req, res) => {
  res.set('Content-Type', 'text/html; charset=utf-8');
  res.send(
    renderViewerHtml({
      basePath: typeof req.query.basePath === 'string' ? req.query.basePath : undefined,
      sessionId: req.sessionId,
      takeover: req.query.takeover === '1',
    }),
  );
});

app.post('/bridge/connect', sessionMiddleware, (req, res) => {
  try {
    const { clientId, url } = req.body || {};
    if (!clientId || !url) return res.status(400).json({ error: 'Missing clientId or url' });
    return res.json(bridgeSessions.connect(req.sessionId, { clientId, ownerId: req.ownerId, url }));
  } catch (error) {
    return sendBridgeError(res, error);
  }
});

app.get('/bridge/commands', sessionMiddleware, async (req, res) => {
  const clientId = req.query.clientId;
  if (typeof clientId !== 'string' || !clientId) {
    return res.status(400).json({ error: 'Missing clientId' });
  }

  const controller = new AbortController();
  let finished = false;
  req.once('close', () => {
    if (!finished) controller.abort();
  });

  try {
    const command = await bridgeSessions.poll(req.sessionId, {
      clientId,
      ownerId: req.ownerId,
      signal: controller.signal,
    });
    finished = true;
    return res.json({ command });
  } catch (error) {
    finished = true;
    if (error instanceof BridgeError && error.code === 'BRIDGE_POLL_ABORTED') return;
    return sendBridgeError(res, error);
  }
});

app.post('/bridge/result', sessionMiddleware, (req, res) => {
  try {
    const { clientId, commandId, epoch, error, result, url } = req.body || {};
    if (!clientId || !commandId || !Number.isInteger(epoch)) {
      return res.status(400).json({ error: 'Missing clientId, commandId, or epoch' });
    }
    const currentUrl = url || result?.url;
    if (currentUrl)
      bridgeSessions.updateClientUrl(req.sessionId, {
        clientId,
        ownerId: req.ownerId,
        url: currentUrl,
      });
    return res.json(
      bridgeSessions.complete(req.sessionId, {
        clientId,
        commandId,
        epoch,
        error,
        ownerId: req.ownerId,
        result,
      }),
    );
  } catch (bridgeError) {
    return sendBridgeError(res, bridgeError);
  }
});

app.post('/bridge/disconnect', sessionMiddleware, (req, res) => {
  try {
    const { clientId } = req.body || {};
    if (!clientId) return res.status(400).json({ error: 'Missing clientId' });
    return res.json(bridgeSessions.disconnect(req.sessionId, { clientId, ownerId: req.ownerId }));
  } catch (error) {
    return sendBridgeError(res, error);
  }
});

app.post('/bridge/interrupt', sessionMiddleware, (req, res) => {
  try {
    const { clientId } = req.body || {};
    if (!clientId) return res.status(400).json({ error: 'Missing clientId' });
    return res.json(bridgeSessions.interrupt(req.sessionId, { clientId, ownerId: req.ownerId }));
  } catch (error) {
    return sendBridgeError(res, error);
  }
});

app.get('/bridge/status', sessionMiddleware, (req, res) => {
  try {
    return res.json(bridgeSessions.getStatus(req.sessionId, req.ownerId));
  } catch (error) {
    return sendBridgeError(res, error);
  }
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
  let lastFrameId;
  let timer;
  req.on('close', () => {
    closed = true;
    clearTimeout(timer);
  });

  const sendFrame = async () => {
    if (closed) return;
    try {
      const session = await getOrCreateSession(req.sessionId);
      const state = await getPageState(session.page, {
        pointer: session.lastPointer,
        sessionId: req.sessionId,
      });
      if (state.frameId && state.frameId === lastFrameId) delete state.screenshot;
      lastFrameId = state.frameId || lastFrameId;
      res.write(`data: ${JSON.stringify(state)}\n\n`);
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
    if (payload.type === 'click') {
      const blankLinkTarget = await getBlankLinkTargetByPoint(
        session.page,
        payload.x,
        payload.y,
      ).catch(() => undefined);
      if (await navigateBlankLinkInCurrentPage(session.page, blankLinkTarget)) {
        recordAction(session, {
          action: 'popup',
          summary: `Kept target=_blank navigation inside the right-side browser: ${blankLinkTarget}`,
          target: blankLinkTarget,
        });
      } else {
        await runWithPopupAdoption(session, () => applyInput(session.page, payload));
      }
    } else {
      await runWithPopupAdoption(session, () => applyInput(session.page, payload));
    }
    await session.page.waitForTimeout(100);
    if (payload.type && payload.type !== 'mousemove') {
      recordUserIntervention(session, { inputType: payload.type });
    }
    if (payload.screenshot === false) {
      return res.json({ ok: true });
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
  bridgeSessions.destroy(req.sessionId, req.ownerId);
  sessionModes.delete(req.sessionId);
  sessionOwners.delete(req.sessionId);
  res.json({ ok: true });
});

export const browserServiceApp = app;

export const startBrowserService = (port = PORT) =>
  app.listen(port, () => {
    console.info(`Browser service listening on port ${port}`);
    console.info(`  Max sessions: ${MAX_SESSIONS}`);
    console.info(`  Session idle timeout: ${SESSION_IDLE_MS / 1000}s`);
  });

if (process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href) {
  startBrowserService();
}
