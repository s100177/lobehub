import { NextResponse } from 'next/server';

import { checkAuth } from '@/app/(backend)/middleware/auth';

import {
  createBrowserServiceHeaders,
  getBrowserServiceUrl,
  proxyBrowserServiceResponse,
} from '../utils';

export const dynamic = 'force-dynamic';

const ALLOWED_ACTIONS = new Set([
  'navigate',
  'click',
  'fill',
  'submit',
  'scroll',
  'screenshot',
  'evaluate',
  'cancelTask',
  'cancel-task',
  'execute-plan',
  'executePlan',
  'inspect',
  'interrupt',
  'back',
  'forward',
  'hover',
]);

export const POST = checkAuth(async (request: Request, { userId }) => {
  const browserServiceUrl = getBrowserServiceUrl();
  if (!browserServiceUrl) {
    return NextResponse.json({ error: 'Browser service not configured' }, { status: 503 });
  }

  let body: { action?: string; params?: unknown; sessionId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { action, params, sessionId } = body;
  if (!sessionId) {
    return NextResponse.json({ error: 'Missing sessionId' }, { status: 400 });
  }
  if (!action || !ALLOWED_ACTIONS.has(action)) {
    return NextResponse.json({ error: 'Unsupported browser action' }, { status: 400 });
  }

  try {
    const serviceAction =
      action === 'executePlan' ? 'execute-plan' : action === 'cancelTask' ? 'cancel-task' : action;
    const res = await fetch(`${browserServiceUrl}/${serviceAction}`, {
      body: JSON.stringify(params ?? {}),
      cache: 'no-store',
      headers: createBrowserServiceHeaders(userId, {
        'Content-Type': 'application/json',
        'X-Session-ID': sessionId,
      }),
      method: 'POST',
    });
    return proxyBrowserServiceResponse(res, 'application/json');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Proxy error: ${message}` }, { status: 502 });
  }
});
