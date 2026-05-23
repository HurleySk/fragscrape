import logger from './logger';

export async function saveDebugHtml(label: string, html: string): Promise<void> {
  if (process.env.DEBUG_HTML !== 'true') return;
  const fs = await import('fs/promises');
  const debugPath = `./debug_${label}_${Date.now()}.html`;
  await fs.writeFile(debugPath, html);
  logger.debug(`Saved debug HTML to: ${debugPath}`);
}
