/**
 * Startup banner display utility
 */

interface BannerConfig {
  version: string;
  port: number;
}

export function displayStartupBanner(config: BannerConfig): void {
  const { version, port } = config;

  console.log(`
╔══════════════════════════════════════════════════╗
║        Fragscrape API Server v${version.padEnd(13)}║
╚══════════════════════════════════════════════════╝

🚀 Server running at: http://localhost:${port}

API Endpoints:
  Perfume:
    • GET  /api/search?q=query          - Search perfumes
    • GET  /api/perfume/:brand/:name    - Get perfume details
    • POST /api/perfume/by-url          - Get perfume by URL
    • GET  /api/brand/:brand            - List brand perfumes

  Proxy Management:
    • GET  /api/proxy/status            - View proxy status & usage
    • GET  /api/proxy/subusers          - List all sub-users
    • POST /api/proxy/create-subuser    - Create new sub-user (1GB)
    • POST /api/proxy/add-subuser       - Add existing sub-user to DB
    • GET  /api/proxy/test              - Test proxy connection
    • POST /api/proxy/rotate            - Force rotate proxy

  Health:
    • GET  /health                      - Server health check

⚠️  Remember to create a Decodo sub-user before starting!
   Use: curl -X POST http://localhost:${port}/api/proxy/create-subuser
  `);
}
