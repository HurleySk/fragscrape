import { Router, Request, Response } from 'express';
import logger from '../../utils/logger';
import { asyncHandler } from '../middleware/errorHandler';
import { sendSuccess } from '../../utils/apiResponse';
import { AuthBrowserClient } from '../../auth/authBrowserClient';

const router = Router();

function getAuthClient(): AuthBrowserClient {
  return new AuthBrowserClient();
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
  const authClient = getAuthClient();
  const isValid = await authClient.verifySession();

  return sendSuccess(res, {
    authenticated: isValid,
  });
}));

router.post('/logout', asyncHandler(async (_req: Request, res: Response) => {
  logger.info('Logout: user should clear browser profile or re-login');
  return sendSuccess(res, { message: 'To fully log out, delete the chrome-profile directory in data/' });
}));

export default router;
