import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const ALLOWED_ACTIONS = new Set([
  'navigate',
  'click',
  'fill',
  'submit',
  'scroll',
  'screenshot',
  'evaluate',
  'execute-plan',
  'executePlan',
  'inspect',
  'interrupt',
  'back',
  'forward',
]);

export async function POST(request: NextRequest) {
  const browserServiceUrl = process.env.BROWSER_SERVICE_URL;
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
    const serviceAction = action === 'executePlan' ? 'execute-plan' : action;
    const res = await fetch(`${browserServiceUrl}/${serviceAction}`, {
      body: JSON.stringify(params ?? {}),
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        'X-Session-ID': sessionId,
      },
      method: 'POST',
    });

    const text = await res.text();
    const contentType = res.headers.get('content-type') ?? 'application/json';

    return new NextResponse(text, {
      headers: {
        'Cache-Control': 'no-store',
        'Content-Type': contentType,
      },
      status: res.status,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Proxy error: ${message}` }, { status: 502 });
  }
}
