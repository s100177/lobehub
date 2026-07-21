import { NextResponse } from 'next/server';

export const BROWSER_OWNER_HEADER = 'X-Browser-Owner-ID';

export const getBrowserServiceUrl = () => process.env.BROWSER_SERVICE_URL;

export const createBrowserServiceHeaders = (userId: string, headers: HeadersInit = {}): Headers => {
  const resolved = new Headers(headers);
  resolved.set(BROWSER_OWNER_HEADER, userId);
  if (process.env.BROWSER_SERVICE_TOKEN) {
    resolved.set('X-Browser-Service-Token', process.env.BROWSER_SERVICE_TOKEN);
  }

  return resolved;
};

export const proxyBrowserServiceResponse = async (
  res: Response,
  fallbackContentType: string,
  extraHeaders: HeadersInit = {},
) => {
  const headers = new Headers(extraHeaders);
  headers.set('Cache-Control', headers.get('Cache-Control') ?? 'no-store');
  headers.set('Content-Type', res.headers.get('content-type') ?? fallbackContentType);

  return new NextResponse(res.body, {
    headers,
    status: res.status,
    statusText: res.statusText,
  });
};
