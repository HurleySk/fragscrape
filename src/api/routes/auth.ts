import { Router, Request, Response } from 'express';
import config from '../../config/config';
import logger from '../../utils/logger';
import { asyncHandler, SessionNotConfiguredError } from '../middleware/errorHandler';
import { sendSuccess } from '../../utils/apiResponse';
import { SessionManager } from '../../auth/sessionManager';
import { AuthBrowserClient } from '../../auth/authBrowserClient';
import { getParfumoDb } from '../../database/parfumoDb';

const router = Router();

function getSessionManager(): SessionManager {
  const key = config.parfumo.sessionKey;
  if (!key) throw new SessionNotConfiguredError();
  return new SessionManager(getParfumoDb(), key);
}

function getAuthClient(): AuthBrowserClient {
  return new AuthBrowserClient(getSessionManager(), getParfumoDb());
}

router.post('/login', asyncHandler(async (_req: Request, res: Response) => {
  const authClient = getAuthClient();

  logger.info('Starting Parfumo login flow...');
  const result = await authClient.launchLoginBrowser();

  return sendSuccess(res, {
    message: 'Login successful',
    username: result.username,
  });
}));

router.get('/status', asyncHandler(async (_req: Request, res: Response) => {
  const sessionManager = getSessionManager();
  const session = sessionManager.loadSession();

  if (!session) {
    return sendSuccess(res, {
      authenticated: false,
      username: null,
      loggedInAt: null,
      lastVerifiedAt: null,
    });
  }

  const needsVerify = sessionManager.needsVerification(config.parfumo.sessionVerifyIntervalMs);

  if (needsVerify) {
    const authClient = getAuthClient();
    const isValid = await authClient.verifySession();

    if (!isValid) {
      sessionManager.clearSession();
      return sendSuccess(res, {
        authenticated: false,
        username: session.username,
        loggedInAt: session.loggedInAt,
        lastVerifiedAt: session.lastVerifiedAt,
        message: 'Session expired — call POST /api/auth/login to re-authenticate',
      });
    }
  }

  const updatedSession = sessionManager.loadSession();
  return sendSuccess(res, {
    authenticated: true,
    username: updatedSession?.username,
    loggedInAt: updatedSession?.loggedInAt,
    lastVerifiedAt: updatedSession?.lastVerifiedAt,
  });
}));

router.post('/logout', asyncHandler(async (_req: Request, res: Response) => {
  const sessionManager = getSessionManager();
  sessionManager.clearSession();
  logger.info('Parfumo session cleared');
  return sendSuccess(res, { message: 'Logged out' });
}));

export default router;
