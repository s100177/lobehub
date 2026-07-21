const isLocalOrPrivateHostname = (hostname) => {
  const normalized = hostname.toLowerCase();
  if (normalized === 'localhost' || normalized.endsWith('.localhost')) return true;
  if (normalized === 'host.docker.internal') return true;

  const ipv4 = normalized.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!ipv4) return false;

  const [, aRaw, bRaw] = ipv4;
  const a = Number(aRaw);
  const b = Number(bRaw);
  return a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
};

export const createIframePolicy = (configuredOrigins = '') => {
  const allowedOrigins = new Set(
    configuredOrigins
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean)
      .map((origin) => new URL(origin).origin),
  );

  return {
    assertAllowed(url) {
      const origin = new URL(url).origin;
      if (allowedOrigins.has(origin)) return;

      const error = new Error(`Iframe browser origin is not trusted: ${origin}`);
      error.code = 'BROWSER_IFRAME_ORIGIN_BLOCKED';
      error.status = 403;
      throw error;
    },
    shouldAutoUse(url) {
      const parsed = new URL(url);
      return isLocalOrPrivateHostname(parsed.hostname) && allowedOrigins.has(parsed.origin);
    },
  };
};
