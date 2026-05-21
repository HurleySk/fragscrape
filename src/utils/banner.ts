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

Server running at: http://localhost:${port}

API Endpoints:
  Perfume:
    * GET  /api/search?q=query          - Search perfumes
    * GET  /api/perfume/:brand/:name    - Get perfume details
    * POST /api/perfume/by-url          - Get perfume by URL
    * GET  /api/brand/:brand            - List brand perfumes

  Proxy:
    * GET  /api/proxy/test              - Test proxy connection

  Health:
    * GET  /health                      - Server health check
  `);
}
