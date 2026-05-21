import config from '../config/config';
import { ProxyConfig } from '../types';

let parsed: URL | null = null;

function getParsedUrl(): URL {
  if (!parsed) {
    const raw = config.proxy.url;
    if (!raw) throw new Error('DECODO_PROXY_URL is not configured');
    parsed = new URL(raw);
  }
  return parsed;
}

export function isProxyConfigured(): boolean {
  return !!config.proxy.url;
}

export function getProxyConfig(sessionId?: string): ProxyConfig {
  const url = getParsedUrl();

  let username = decodeURIComponent(url.username);
  if (sessionId) {
    username = `${username}-session-${sessionId}`;
  }

  return {
    endpoint: url.hostname,
    port: parseInt(url.port, 10),
    username,
    password: decodeURIComponent(url.password),
  };
}
