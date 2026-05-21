# Fragscrape API v1.2.8

A web scraping API for perfume and fragrance data from Parfumo, built with TypeScript, Express, and Decodo rotating residential proxies.

## Features

- **Residential Proxy Rotation**: Decodo rotating proxies via a single `DECODO_PROXY_URL`
- **Data Caching**: SQLite database for caching perfume details and search results
- **Automatic Cleanup**: Configurable auto-deletion of expired cache
- **Rate Limiting**: Configurable rate limiting to respect target websites
- **RESTful API**: Clean API endpoints for search, detail, and brand lookups
- **Error Handling**: Comprehensive error handling and logging with file rotation

## Prerequisites

- Node.js v18+ and npm
- Decodo account with residential proxy access

## Installation

1. Clone the repository:
```bash
git clone https://github.com/HurleySk/fragscrape.git
cd fragscrape
```

2. Install dependencies:
```bash
npm install
```

3. Create environment file:
```bash
cp .env.example .env
```

4. Set your Decodo proxy URL in `.env`:
```env
DECODO_PROXY_URL=http://user-USERNAME-country-us:PASSWORD@gate.decodo.com:7000
```

Get credentials from your [Decodo dashboard](https://dashboard.decodo.com) under residential proxy settings.

## Usage

### Development Mode

```bash
npm run dev
```

### Production Build

```bash
npm run build
npm start
```

### Quick Start

```bash
# Test proxy connection
curl http://localhost:3000/api/proxy/test

# Search for perfumes
curl "http://localhost:3000/api/search?q=Aventus&limit=10"

# Get specific perfume details
curl "http://localhost:3000/api/perfume/Creed/Aventus"

# Health check
curl http://localhost:3000/health
```

## API Endpoints

### Perfume Endpoints

#### Search Perfumes
```
GET /api/search?q={query}&limit=20&cache=true
```

#### Get Perfume Details
```
GET /api/perfume/{brand}/{name}?year=2020&cache=true
```
Parameters:
- `brand`: Brand name (spaces or underscores)
- `name`: Perfume name (spaces or underscores)
- `year`: Optional year variant
- `cache`: Set to `false` to bypass cache (default: `true`)

#### Get Perfume by URL
```
POST /api/perfume/by-url?cache=true
Body: { "url": "https://www.parfumo.com/..." }
```

#### Get Perfumes by Brand
```
GET /api/brand/{brand}?page=1
```

### Cache Management

#### Clear Cache
```
DELETE /api/cache?type={all|perfumes|search|expired}
```

### Proxy

#### Test Connection
```
GET /api/proxy/test
```

### Health

#### Health Check
```
GET /health
```

## Perfume Data Fields

Each perfume response includes:

**Basic Information**: brand, name, year, url, imageUrl, concentration, gender, description

**Fragrance Notes**: top, heart, and base notes arrays

**Ratings** (with vote counts):
- `rating` / `totalRatings` - Overall scent rating
- `longevity` / `longevityRatingCount` - How long the fragrance lasts
- `sillage` / `sillageRatingCount` - Projection strength
- `bottleRating` / `bottleRatingCount` - Bottle design quality
- `priceValue` / `priceValueRatingCount` - Value for money

**Community**: reviewCount, statementCount, photoCount

**Rankings**: rank, rankCategory

**Additional**: perfumer, similarFragrances, scrapedAt

## Configuration

All configuration is done through environment variables:

| Variable | Description | Default |
|----------|-------------|---------|
| `DECODO_PROXY_URL` | Full proxy URL with credentials | - |
| `PORT` | API server port | 3000 |
| `NODE_ENV` | Environment mode | development |
| `DATABASE_PATH` | SQLite database path | ./data/fragscrape.db |
| `CACHE_PERFUME_DURATION_SECONDS` | Cache duration for perfume details | 86400 (24h) |
| `CACHE_SEARCH_DURATION_SECONDS` | Cache duration for search results | 3600 (1h) |
| `LOG_LEVEL` | Logging level (error/warn/info/debug) | info |
| `LOG_FILE_MAX_SIZE_MB` | Max size per log file | 5 |
| `LOG_FILE_MAX_FILES` | Number of rotated log files to keep | 5 |
| `CLEANUP_INTERVAL_HOURS` | Run cache cleanup every N hours | 24 |
| `BROWSER_EXECUTABLE_PATH` | Custom Chrome/Chromium path | (bundled) |
| `RATE_LIMIT_WINDOW_MS` | Rate limit window | 900000 (15m) |
| `RATE_LIMIT_MAX_REQUESTS` | Max requests per window | 100 |

## Project Structure

```
fragscrape/
├── src/
│   ├── api/              # API routes and middleware
│   │   ├── routes/       # Route handlers
│   │   ├── middleware/    # Express middleware
│   │   └── validation/   # Zod schemas
│   ├── scrapers/         # Web scraping logic
│   ├── proxy/            # Proxy configuration and clients
│   ├── database/         # SQLite layer
│   ├── types/            # TypeScript type definitions
│   ├── utils/            # Utility functions
│   ├── constants/        # Scraping constants
│   └── config/           # Configuration
├── tests/                # Test files
├── logs/                 # Application logs
└── data/                 # SQLite database
```

## Error Handling

- Comprehensive error logging with Winston
- Automatic proxy session reset on 403 errors
- Request retry with exponential backoff
- Cloudflare challenge detection and bypass
- Page content validation to detect session pollution

## Testing

```bash
npm test
```

## Troubleshooting

### Proxy Connection Failed
1. Check `DECODO_PROXY_URL` in `.env`
2. Test connection: `GET /api/proxy/test`
3. Verify credentials on the [Decodo dashboard](https://dashboard.decodo.com)

### Cache Issues
- Automatic cleanup runs every 24 hours (configurable via `CLEANUP_INTERVAL_HOURS`)
- Manual cleanup: `DELETE /api/cache?type=all`
- Full reset: Delete `data/fragscrape.db`

## License

MIT

## Disclaimer

This tool is for educational and research purposes only. Always respect website terms of service and robots.txt files.
