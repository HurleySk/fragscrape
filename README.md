# Fragscrape API v2.0.0

A web scraping API for perfume and fragrance data from Parfumo, built with TypeScript, Express, and Decodo rotating residential proxies. Features saved queries with progress tracking, tagging, and collection management.

## Features

- **Saved Queries & Progress Tracking**: Save search queries, review results one by one, pick up where you left off
- **Collection Management**: Tag perfumes ("want to try", "own", "tested", "pass"), add notes and interest ratings
- **Residential Proxy Rotation**: Decodo rotating proxies via a single `DECODO_PROXY_URL`
- **Data Caching**: SQLite database for caching perfume details and search results
- **Tag-Based Cleanup**: Delete perfumes you've tagged "pass" — no automatic expiry
- **Rate Limiting**: Configurable rate limiting to respect target websites
- **RESTful API**: Clean API endpoints for search, detail, queries, tags, and collections

## Prerequisites

- Node.js v18+ and npm
- Decodo account with residential proxy access

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

Set your Decodo proxy URL in `.env`:
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

## API Endpoints

### Search & Perfume Data

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/search?q={query}&limit=20&cache=true` | Search perfumes |
| GET | `/api/perfume/{brand}/{name}?year=2020&cache=true` | Get perfume details |
| POST | `/api/perfume/by-url?cache=true` | Get perfume by URL |
| GET | `/api/brand/{brand}?page=1` | Get perfumes by brand |

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

### System

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |
| GET | `/api/proxy/test` | Test proxy connection |

## Default Tags

Tags aligned with Parfumo's collection categories:

| Tag | Purpose | Parfumo Equivalent |
|-----|---------|-------------------|
| `want to try` | Wishlist | Wishlist |
| `tested` | Tried but don't own | Tested |
| `own` | In your collection | I have |
| `pass` | Not interested (eligible for cleanup) | — |

Custom tags are supported — use any string.

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
| `CACHE_PERFUME_DURATION_SECONDS` | Freshness window for perfume data | 21600 (6h) |
| `CACHE_SEARCH_DURATION_SECONDS` | Freshness window for search results | 3600 (1h) |
| `LOG_LEVEL` | Logging level (error/warn/info/debug) | info |
| `LOG_FILE_MAX_SIZE_MB` | Max size per log file | 5 |
| `LOG_FILE_MAX_FILES` | Number of rotated log files to keep | 5 |
| `BROWSER_EXECUTABLE_PATH` | Custom Chrome/Chromium path | (bundled) |
| `RATE_LIMIT_WINDOW_MS` | Rate limit window | 900000 (15m) |
| `RATE_LIMIT_MAX_REQUESTS` | Max requests per window | 100 |

## Project Structure

```
fragscrape/
├── src/
│   ├── api/
│   │   ├── routes/         # perfume, queries, perfumeData, proxy
│   │   ├── middleware/      # errorHandler, validate
│   │   └── validation/      # schemas, querySchemas
│   ├── scrapers/            # Web scraping logic
│   ├── proxy/               # Proxy configuration and clients
│   ├── database/            # database.ts (SQLite), queries.ts (QueryDatabase)
│   ├── types/               # TypeScript type definitions
│   ├── utils/               # Logger, retry, validation, apiResponse
│   ├── constants/           # Scraping constants
│   └── config/              # Configuration
├── tests/                   # Jest test files
├── logs/                    # Application logs
└── data/                    # SQLite database
```

## Testing

```bash
npm test
```

## Troubleshooting

### Proxy Connection Failed
1. Check `DECODO_PROXY_URL` in `.env`
2. Test connection: `GET /api/proxy/test`
3. Verify credentials on the [Decodo dashboard](https://dashboard.decodo.com)

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
