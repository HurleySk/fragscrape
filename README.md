# Fragscrape API

A web scraping API for perfume and fragrance data from Parfumo, built with TypeScript, Express, and optional Decodo rotating residential proxies. Features saved queries with progress tracking, tagging, collection management, and Parfumo account integration.

## Features

- **Saved Queries & Progress Tracking**: Save search queries, review results one by one, pick up where you left off
- **Collection Management**: Tag perfumes ("want to try", "own", "tested", "pass"), add notes and interest ratings
- **Parfumo Account Integration**: Log in to Parfumo via browser handoff, manage collection/wishlist, submit ratings
- **Bidirectional Sync**: Push local tags to Parfumo collections, pull Parfumo data locally
- **Optional Proxy Support**: Decodo rotating residential proxies via `DECODO_PROXY_URL` — works without a proxy using direct connections
- **Data Caching**: SQLite database for caching perfume details and search results
- **Tag-Based Cleanup**: Delete perfumes you've tagged "pass" - no automatic expiry
- **Rate Limiting**: Configurable rate limiting to respect target websites
- **RESTful API**: Clean API endpoints for search, detail, queries, tags, and collections

## Prerequisites

- Node.js v18+ and npm
- Chrome/Chromium (bundled with Puppeteer, or set `BROWSER_EXECUTABLE_PATH`)
- (Optional) Decodo account with residential proxy access

## Installation

### From npm

```bash
npm install fragscrape
```

### From source

```bash
git clone https://github.com/HurleySk/fragscrape.git
cd fragscrape
npm install
```

Create environment file:
```bash
cp .env.example .env
```

Optionally set your Decodo proxy URL in `.env` (scraping works without it via direct connections):
```env
# Optional — omit to use direct connections
DECODO_PROXY_URL=http://user-USERNAME-country-us:PASSWORD@gate.decodo.com:7000
```

Get proxy credentials from your [Decodo dashboard](https://dashboard.decodo.com) under residential proxy settings.

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
# Search for perfumes
curl "http://localhost:3000/api/search?q=Aventus&limit=10"

# Save a search query
curl -X POST http://localhost:3000/api/queries \
  -H "Content-Type: application/json" \
  -d '{"query": "oud rose", "name": "Summer research"}'

# List saved queries with progress
curl http://localhost:3000/api/queries

# Get next unreviewed item
curl http://localhost:3000/api/queries/1/next

# Mark item as reviewed
curl -X PATCH http://localhost:3000/api/queries/1/items/3 \
  -H "Content-Type: application/json" \
  -d '{"reviewed": true}'

# Tag a perfume
curl -X POST http://localhost:3000/api/perfumes/5/tags \
  -H "Content-Type: application/json" \
  -d '{"tag": "want to try"}'

# Set notes and interest
curl -X PUT http://localhost:3000/api/perfumes/5/user-data \
  -H "Content-Type: application/json" \
  -d '{"notes": "Smoky, leathery. Try in winter.", "interest": 4}'

# View your wishlist
curl "http://localhost:3000/api/collection?tag=want+to+try"

# See all tags with counts
curl http://localhost:3000/api/tags

# Cleanup perfumes tagged 'pass'
curl -X DELETE http://localhost:3000/api/cleanup
```

### Parfumo Account Integration

Fragscrape can manage your Parfumo collection directly. A visible Chrome browser is used for authentication and all Parfumo actions (Parfumo detects and blocks headless browsers). The browser stays running in the background after login.

```bash
# 1. Log in to Parfumo (opens a visible browser window - log in manually)
curl -X POST http://localhost:3000/api/auth/login

# 2. Check session status
curl http://localhost:3000/api/auth/status

# 3. Add a perfume to your Parfumo wishlist
curl -X POST http://localhost:3000/api/parfumo/collection \
  -H "Content-Type: application/json" \
  -d '{"perfumeId": 5, "category": "wishlist"}'

# 4. Remove from collection
curl -X DELETE http://localhost:3000/api/parfumo/collection \
  -H "Content-Type: application/json" \
  -d '{"perfumeId": 5, "category": "wishlist"}'

# 5. Submit a rating
curl -X PUT http://localhost:3000/api/parfumo/rating \
  -H "Content-Type: application/json" \
  -d '{"perfumeId": 5, "scent": 8.5, "longevity": 7}'

# 6. Read your rating
curl http://localhost:3000/api/parfumo/rating/5

# 7. Push all local tags to Parfumo collections
curl -X POST http://localhost:3000/api/sync/push \
  -H "Content-Type: application/json" \
  -d '{"scope": "all"}'

# 8. Preview what would sync
curl http://localhost:3000/api/sync/diff
```

**Collection categories:**

| Category | Parfumo Label | data-type |
|----------|---------------|-----------|
| `i_have` | I have | 1 |
| `i_had` | I had | 2 |
| `wishlist` | Wish List | 3 |
| `tested` | Tested | 5 |

## API Endpoints

### Search & Perfume Data

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/search?q={query}&limit=20&cache=true` | Search perfumes |
| GET | `/api/perfume/{brand}/{name}?year=2020&cache=true` | Get perfume details |
| POST | `/api/perfume/by-url?cache=true` | Get perfume by URL |
| GET | `/api/brand/{brand}?page=1` | Get perfumes by brand |

### Rankings

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/rankings?category=mens&page=1&limit=20` | Get ranked fragrances by category |

**Parameters:**

| Param | Values | Default | Description |
|-------|--------|---------|-------------|
| `category` | `mens`, `womens`, `unisex` | _(required)_ | Gender category |
| `page` | 1-100 | 1 | Page number |
| `limit` | 1-100 | 20 | Max results per page |
| `production` | `in-production`, `discontinued`, `all` | `all` | Filter by production status |
| `edition` | `regular`, `limited`, `collectors`, `all` | `all` | Filter by edition type |

### Saved Queries

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/queries` | Save a query and snapshot results |
| GET | `/api/queries` | List saved queries with progress stats |
| GET | `/api/queries/:id` | Get query with all items and their data |
| PATCH | `/api/queries/:id` | Update query name |
| DELETE | `/api/queries/:id` | Delete a saved query |
| POST | `/api/queries/:id/refresh` | Re-run search, sync results |

### Query Progress

| Method | Endpoint | Description |
|--------|----------|-------------|
| PATCH | `/api/queries/:id/items/:itemId` | Mark item reviewed/skipped |
| GET | `/api/queries/:id/next` | Get next unreviewed item |

### Tags

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/perfumes/:id/tags` | Add a tag to a perfume |
| DELETE | `/api/perfumes/:id/tags/:tag` | Remove a tag |
| GET | `/api/perfumes/:id/tags` | List tags on a perfume |
| GET | `/api/tags` | List all tags with counts |

### User Data

| Method | Endpoint | Description |
|--------|----------|-------------|
| PUT | `/api/perfumes/:id/user-data` | Set notes and/or interest (1-5) |
| GET | `/api/perfumes/:id/user-data` | Get notes and interest |
| DELETE | `/api/perfumes/:id/user-data` | Clear user data |

### Collection & Cleanup

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/collection?tag={tag}` | Get perfumes by tag (wishlist, collection) |
| DELETE | `/api/cleanup` | Delete all perfumes tagged "pass" |

### Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/login` | Launch browser for Parfumo login |
| GET | `/api/auth/status` | Check session validity |
| POST | `/api/auth/logout` | Logout instructions |

### Parfumo Collection

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/parfumo/collection` | Add perfume to Parfumo collection |
| DELETE | `/api/parfumo/collection` | Remove perfume from Parfumo collection |

### Parfumo Ratings

| Method | Endpoint | Description |
|--------|----------|-------------|
| PUT | `/api/parfumo/rating` | Submit/update rating on Parfumo |
| GET | `/api/parfumo/rating/:perfumeId` | Read rating from Parfumo |

### Parfumo Reviews

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/parfumo/reviews/:perfumeId` | Read review from Parfumo |
| PUT | `/api/parfumo/reviews` | Create/update review on Parfumo |
| DELETE | `/api/parfumo/reviews/:perfumeId` | Delete review from Parfumo |

### Sync

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/sync/diff` | Preview sync changes |
| POST | `/api/sync/push` | Push local data to Parfumo |
| POST | `/api/sync/pull` | Pull Parfumo data locally |

### Cache

| Method | Endpoint | Description |
|--------|----------|-------------|
| DELETE | `/api/cache?type=all` | Clear all cached data |
| DELETE | `/api/cache?type=perfumes` | Clear perfume cache only |
| DELETE | `/api/cache?type=search` | Clear search cache only |
| DELETE | `/api/cache?type=expired` | Clear only expired entries |
| DELETE | `/api/cache/error-pages` | Purge cached error page entries |

### System

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |
| GET | `/api/proxy/test` | Test proxy connection |

## Default Tags

Tags aligned with Parfumo's collection categories:

| Tag | Purpose | Parfumo Equivalent |
|-----|---------|-------------------|
| `want to try` | Wishlist | Wish List |
| `tested` | Tried but don't own | Tested |
| `own` | In your collection | I have |
| `pass` | Not interested (eligible for cleanup) | - |

Custom tags are supported - use any string.

## Perfume Data Fields

Each perfume response includes:

**Basic Information**: brand, name, year, url, imageUrl, concentration, gender, description

**Fragrance Notes**: top, heart, and base notes arrays (categorized by prominence when Parfumo uses flat note lists)

**Ratings** (with vote counts):
- `rating` / `totalRatings` - Overall scent rating
- `longevity` / `longevityRatingCount` - How long the fragrance lasts
- `sillage` / `sillageRatingCount` - Projection strength
- `bottleRating` / `bottleRatingCount` - Bottle design quality
- `priceValue` / `priceValueRatingCount` - Value for money

**Community**: reviewCount, statementCount, photoCount

**Rankings**: rank, rankCategory

**Status**: productionStatus (`in-production`, `discontinued`, or `unknown`)

**Cache Metadata**: `_cached` (boolean, present only when `cache=true` and data was served from cache - allows callers to skip rate-limiting delays)

**Additional**: perfumer, similarFragrances, scrapedAt

## Configuration

All configuration is done through environment variables:

| Variable | Description | Default |
|----------|-------------|---------|
| `DECODO_PROXY_URL` | Full proxy URL with credentials (optional) | _(direct mode)_ |
| `PORT` | API server port | 3000 |
| `NODE_ENV` | Environment mode | development |
| `DATABASE_PATH` | SQLite database path | ./data/fragscrape.db |
| `CACHE_PERFUME_DURATION_SECONDS` | Freshness window for perfume data | 21600 (6h) |
| `CACHE_SEARCH_DURATION_SECONDS` | Freshness window for search results | 3600 (1h) |
| `LOG_LEVEL` | Logging level (error/warn/info/debug) | info |
| `LOG_FILE_MAX_SIZE_MB` | Max size per log file | 5 |
| `LOG_FILE_MAX_FILES` | Number of rotated log files to keep | 5 |
| `LOG_RETENTION_DAYS` | Keep database request logs for N days | 30 |
| `CLEANUP_INTERVAL_HOURS` | Run automatic cleanup every N hours | 24 |
| `SCRAPER_BASE_URL` | Base URL for Parfumo | https://www.parfumo.com |
| `BROWSER_EXECUTABLE_PATH` | Custom Chrome/Chromium path | (bundled) |
| `RATE_LIMIT_WINDOW_MS` | Rate limit window | 900000 (15m) |
| `RATE_LIMIT_MAX_REQUESTS` | Max requests per window | 100 |
| `PARFUMO_LOGIN_TIMEOUT_MS` | Login flow timeout | 300000 (5 min) |
| `PARFUMO_ACTION_TIMEOUT_MS` | Per-action browser timeout | 30000 (30s) |
| `PARFUMO_SESSION_VERIFY_INTERVAL_MS` | Session revalidation interval | 1800000 (30 min) |

## Architecture Notes

### Browser Session Management

Parfumo detects headless browsers and blocks automated access. Fragscrape uses a **singleton visible Chrome browser** that stays alive between API calls:

1. `POST /api/auth/login` opens a visible browser window for manual login
2. After login, the browser stays running (minimized off-screen)
3. Subsequent API calls (collection, rating, etc.) open new tabs in the same browser
4. The session persists as long as the server process is running
5. If the server restarts, you need to log in again

The browser uses `puppeteer-extra-plugin-stealth` to reduce detection and a persistent Chrome profile (`data/chrome-profile/`) for cookie storage.

## Project Structure

```
fragscrape/
  src/
    api/
      routes/         # perfume, queries, perfumeData, proxy, auth, parfumo*
      middleware/      # errorHandler, validate
      validation/      # schemas, querySchemas, parfumoSchemas
    auth/              # authBrowserClient, parfumoActions
    scrapers/          # Web scraping logic
    proxy/             # Proxy configuration and clients
    database/          # database.ts (SQLite), queries.ts, parfumoDb.ts
    types/             # TypeScript type definitions
    utils/             # Logger, retry, validation, apiResponse
    constants/         # Scraping constants, parfumoSelectors
    config/            # Configuration
  tests/               # Jest test files
  data/                # SQLite database, Chrome profile
```

## Testing

```bash
npm test
```

## Troubleshooting

### Proxy Connection Failed
1. Check `DECODO_PROXY_URL` in `.env` (omit to use direct connections without a proxy)
2. Test connection: `GET /api/proxy/test` — response includes `proxyEnabled` to confirm whether proxy is active
3. Verify credentials on the [Decodo dashboard](https://dashboard.decodo.com)

### Parfumo Login Issues
- The login browser must be visible (not headless) - Parfumo blocks headless browsers
- If login times out, restart the server and try again
- The browser stays running after login - don't close it manually
- If the server restarts, the session is lost and you need to log in again

### Stale Data
- Perfume data is re-scraped when older than the configured freshness window (default 6 hours)
- To force fresh data, use `?cache=false` on any endpoint

### Cleanup
- Tag unwanted perfumes with "pass": `POST /api/perfumes/:id/tags` with `{"tag": "pass"}`
- Run cleanup: `DELETE /api/cleanup`
- Full database reset: delete `data/fragscrape.db`

## License

MIT

## Disclaimer

This tool is for educational and research purposes only. Always respect website terms of service and robots.txt files.
