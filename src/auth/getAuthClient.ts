import { AuthBrowserClient } from './authBrowserClient';

export function getAuthClient(): AuthBrowserClient {
  return new AuthBrowserClient();
}
