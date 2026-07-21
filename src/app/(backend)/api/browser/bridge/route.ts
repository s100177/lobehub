import { NextResponse } from 'next/server';

import { checkAuth } from '@/app/(backend)/middleware/auth';

import {
  createBrowserServiceHeaders,
  getBrowserServiceUrl,
  proxyBrowserServiceResponse,
} from '../utils';

export const dynamic = 'force-dynamic';

const BRIDGE_POST_ACTIONS = new Set(['connect', 'disconnect', 'interrupt', 'result']);

const getRequiredSearchParam = (request: Request, key: string) => {
  const value = new URL(request.url).searchParams.get(key);
  return value && value.trim() ? value : undefined;
};

export const GET = checkAuth(async (request: Request, { userId }) => {
  const browserServiceUrl = getBrowserServiceUrl();
  if (!browserServiceUrl) {
    return NextResponse.json({ error: 'Browser service not configured' }, { status: 503 });
  }

  const sessionId = getRequiredSearchParam(request, 'sessionId');
  const clientId = getRequiredSearchParam(request, 'clientId');
  if (!sessionId) {
    return NextResponse.json({ error: 'Missing sessionId' }, { status: 400 });
  }
  if (!clientId) {
    return NextResponse.json({ error: 'Missing clientId' }, { status: 400 });
  }

  try {
    const targetUrl = new URL(`${browserServiceUrl}/bridge/commands`);
    targetUrl.searchParams.set('session', sessionId);
    targetUrl.searchParams.set('clientId', clientId);

    const res = await fetch(targetUrl, {
      cache: 'no-store',
      headers: createBrowserServiceHeaders(userId),
      method: 'GET',
      signal: request.signal,
    });

    return proxyBrowserServiceResponse(res, 'application/json');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Proxy error: ${message}` }, { status: 502 });
  }
});

export const POST = checkAuth(async (request: Request, { userId }) => {
  const browserServiceUrl = getBrowserServiceUrl();
  if (!browserServiceUrl) {
    return NextResponse.json({ error: 'Browser service not configured' }, { status: 503 });
  }

  let body: Record<string, unknown> & { action?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const action = typeof body.action === 'string' ? body.action : undefined;
  const sessionId = typeof body.sessionId === 'string' ? body.sessionId.trim() : '';
  if (!action || !BRIDGE_POST_ACTIONS.has(action)) {
    return NextResponse.json({ error: 'Unsupported bridge action' }, { status: 400 });
  }
  if (!sessionId) {
    return NextResponse.json({ error: 'Missing sessionId' }, { status: 400 });
  }

  try {
    const res = await fetch(`${browserServiceUrl}/bridge/${action}`, {
      body: JSON.stringify(body),
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
