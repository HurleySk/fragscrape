# Fragscrape API Examples

Complete examples for using the Fragscrape API with curl, JavaScript, and Python.

## Proxy Configuration

Fragscrape uses a single `DECODO_PROXY_URL` environment variable for proxy configuration. The proxy is optional — omit it to use direct connections.

```bash
# .env file
# Optional — omit to use direct connections without a proxy
DECODO_PROXY_URL=http://user-USERNAME-country-us:PASSWORD@gate.decodo.com:7000
```

Get credentials from your [Decodo dashboard](https://dashboard.decodo.com) under residential proxy settings.

### Test Proxy Connection
```bash
# Test current connection (works whether proxy is enabled or not)
curl http://localhost:3000/api/proxy/test

# Response:
# {
#   "success": true,
#   "data": { "connected": true, "proxyEnabled": true },
#   "timestamp": "2026-01-01T00:00:00.000Z"
# }
```

## Perfume Search & Retrieval

### Search Perfumes
```bash
# Basic search
curl "http://localhost:3000/api/search?q=rose"

# Search with limit
curl "http://localhost:3000/api/search?q=oud&limit=5"

# Search without cache (force fresh results)
curl "http://localhost:3000/api/search?q=amber&cache=false"
```

### Get Perfume Details
```bash
# Get by brand and name (accepts spaces or underscores)
curl "http://localhost:3000/api/perfume/Tom%20Ford/Black%20Orchid"
curl "http://localhost:3000/api/perfume/Tom_Ford/Black_Orchid"

# Get specific year variant
curl "http://localhost:3000/api/perfume/Dior/Sauvage?year=2015"

# Force fresh data (bypass cache)
curl "http://localhost:3000/api/perfume/Creed/Aventus?cache=false"

# Get by direct URL
curl -X POST http://localhost:3000/api/perfume/by-url \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.parfumo.com/Perfumes/Creed/Aventus"}'

# Get by URL without cache
curl -X POST "http://localhost:3000/api/perfume/by-url?cache=false" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.parfumo.com/Perfumes/Creed/Aventus"}'
```

### Browse by Brand
```bash
# Get all perfumes from a brand
curl "http://localhost:3000/api/brand/Chanel"

# Get specific page
curl "http://localhost:3000/api/brand/Guerlain?page=2"
```

### Rankings
```bash
# Get top-ranked men's fragrances
curl "http://localhost:3000/api/rankings?category=mens"

# With pagination and filters
curl "http://localhost:3000/api/rankings?category=womens&page=2&limit=10&production=in-production&edition=regular"
```

**Parameters:**

| Param | Values | Default |
|-------|--------|---------|
| `category` | `mens`, `womens`, `unisex` | _(required)_ |
| `page` | 1-100 | 1 |
| `limit` | 1-100 | 20 |
| `production` | `in-production`, `discontinued`, `all` | `all` |
| `edition` | `regular`, `limited`, `collectors`, `all` | `all` |

## Saved Queries & Progress Tracking

### Create and Manage Queries
```bash
# Save a search query (runs search and snapshots results)
curl -X POST http://localhost:3000/api/queries \
  -H "Content-Type: application/json" \
  -d '{"query": "oud rose", "name": "Summer research"}'

# List all saved queries with progress stats
curl http://localhost:3000/api/queries

# Get a specific query with all items
curl http://localhost:3000/api/queries/1

# Rename a query
curl -X PATCH http://localhost:3000/api/queries/1 \
  -H "Content-Type: application/json" \
  -d '{"name": "New name"}'

# Re-run search and sync new results
curl -X POST http://localhost:3000/api/queries/1/refresh

# Delete a saved query
curl -X DELETE http://localhost:3000/api/queries/1
```

### Review Progress
```bash
# Get next unreviewed item (returns 204 when all done)
curl http://localhost:3000/api/queries/1/next

# Mark item as reviewed
curl -X PATCH http://localhost:3000/api/queries/1/items/3 \
  -H "Content-Type: application/json" \
  -d '{"reviewed": true}'

# Skip an item
curl -X PATCH http://localhost:3000/api/queries/1/items/3 \
  -H "Content-Type: application/json" \
  -d '{"skipped": true}'
```

## Tags & User Data

### Tags
```bash
# Add a tag to a perfume
curl -X POST http://localhost:3000/api/perfumes/5/tags \
  -H "Content-Type: application/json" \
  -d '{"tag": "want to try"}'

# List tags on a perfume
curl http://localhost:3000/api/perfumes/5/tags

# Remove a tag
curl -X DELETE "http://localhost:3000/api/perfumes/5/tags/want%20to%20try"

# See all tags with counts
curl http://localhost:3000/api/tags
```

### User Data (Notes & Interest)
```bash
# Set notes and interest rating (1-5)
curl -X PUT http://localhost:3000/api/perfumes/5/user-data \
  -H "Content-Type: application/json" \
  -d '{"notes": "Smoky, leathery. Try in winter.", "interest": 4}'

# Get user data for a perfume
curl http://localhost:3000/api/perfumes/5/user-data

# Clear user data
curl -X DELETE http://localhost:3000/api/perfumes/5/user-data
```

### Collection & Cleanup
```bash
# View perfumes by tag
curl "http://localhost:3000/api/collection?tag=want+to+try"

# Cleanup all perfumes tagged 'pass'
curl -X DELETE http://localhost:3000/api/cleanup
```

## Parfumo Account Integration

Fragscrape can manage your Parfumo collection directly via a visible Chrome browser (Parfumo blocks headless browsers).

### Authentication
```bash
# Log in to Parfumo (opens visible browser - log in manually)
curl -X POST http://localhost:3000/api/auth/login

# Check session status
curl http://localhost:3000/api/auth/status

# Logout info
curl -X POST http://localhost:3000/api/auth/logout
```

### Parfumo Collection
```bash
# Add a perfume to your Parfumo collection
# Categories: i_have, i_had, wishlist, tested
curl -X POST http://localhost:3000/api/parfumo/collection \
  -H "Content-Type: application/json" \
  -d '{"perfumeId": 5, "category": "wishlist"}'

# Remove from collection
curl -X DELETE http://localhost:3000/api/parfumo/collection \
  -H "Content-Type: application/json" \
  -d '{"perfumeId": 5, "category": "wishlist"}'
```

### Parfumo Ratings
```bash
# Submit/update a rating
curl -X PUT http://localhost:3000/api/parfumo/rating \
  -H "Content-Type: application/json" \
  -d '{"perfumeId": 5, "scent": 8.5, "longevity": 7}'

# Read a rating
curl http://localhost:3000/api/parfumo/rating/5
```

### Parfumo Reviews
```bash
# Read a review
curl http://localhost:3000/api/parfumo/reviews/5

# Create/update a review
curl -X PUT http://localhost:3000/api/parfumo/reviews \
  -H "Content-Type: application/json" \
  -d '{"perfumeId": 5, "text": "A masterful blend of oud and rose..."}'

# Delete a review
curl -X DELETE http://localhost:3000/api/parfumo/reviews/5
```

### Sync
```bash
# Preview what would sync (shows push/pull diff)
curl http://localhost:3000/api/sync/diff

# Push all local tags to Parfumo collections
curl -X POST http://localhost:3000/api/sync/push \
  -H "Content-Type: application/json" \
  -d '{"scope": "all"}'

# Push only collections (not ratings)
curl -X POST http://localhost:3000/api/sync/push \
  -H "Content-Type: application/json" \
  -d '{"scope": "collections"}'

# Push only ratings
curl -X POST http://localhost:3000/api/sync/push \
  -H "Content-Type: application/json" \
  -d '{"scope": "ratings"}'

# Pull Parfumo data locally (work in progress)
curl -X POST http://localhost:3000/api/sync/pull \
  -H "Content-Type: application/json" \
  -d '{"scope": "all"}'
```

## Cache Management

```bash
# Clear all cache (perfumes and search results)
curl -X DELETE "http://localhost:3000/api/cache?type=all"

# Clear only perfume cache
curl -X DELETE "http://localhost:3000/api/cache?type=perfumes"

# Clear only search cache
curl -X DELETE "http://localhost:3000/api/cache?type=search"

# Clear only expired cache entries
curl -X DELETE "http://localhost:3000/api/cache?type=expired"
```

## Health Check

```bash
curl http://localhost:3000/health

# Response:
# {
#   "status": "healthy",
#   "timestamp": "2026-01-01T00:00:00.000Z",
#   "environment": "development",
#   "uptime": { "seconds": 3600, "readable": "1h 0m" },
#   "database": { "status": "ok" },
#   "proxy": { "configured": true },
#   "memory": { "heapUsedMB": 45, "heapTotalMB": 80, "rssMB": 120 }
# }
```

## JavaScript/Node.js Examples

### Using fetch
```javascript
const API_BASE = 'http://localhost:3000/api';

async function searchPerfumes(query, limit = 20) {
  const response = await fetch(
    `${API_BASE}/search?q=${encodeURIComponent(query)}&limit=${limit}`
  );
  const data = await response.json();
  return data.data;
}

async function getPerfumeDetails(brand, name) {
  const response = await fetch(
    `${API_BASE}/perfume/${encodeURIComponent(brand)}/${encodeURIComponent(name)}`
  );
  const data = await response.json();
  return data.data;
}

async function saveQueryAndReview(searchTerm) {
  // Save a query
  const saveRes = await fetch(`${API_BASE}/queries`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: searchTerm }),
  });
  const { data: query } = await saveRes.json();

  // Review items one at a time
  let next;
  while (true) {
    const res = await fetch(`${API_BASE}/queries/${query.id}/next`);
    if (res.status === 204) break;
    next = (await res.json()).data;

    console.log(`${next.perfume.brand} - ${next.perfume.name}`);

    // Mark as reviewed
    await fetch(`${API_BASE}/queries/${query.id}/items/${next.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reviewed: true }),
    });
  }
}

async function tagAndSync(perfumeId, tag) {
  // Tag locally
  await fetch(`${API_BASE}/perfumes/${perfumeId}/tags`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tag }),
  });

  // Push to Parfumo
  await fetch(`${API_BASE}/sync/push`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scope: 'collections' }),
  });
}

async function clearCache(type = 'all') {
  const response = await fetch(`${API_BASE}/cache?type=${type}`, {
    method: 'DELETE',
  });
  return (await response.json()).data;
}
```

### Using axios
```javascript
const axios = require('axios');

const api = axios.create({
  baseURL: 'http://localhost:3000/api',
  timeout: 30000,
});

async function robustSearch(query, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const { data } = await api.get('/search', {
        params: { q: query, cache: i === 0 },
      });
      return data.data;
    } catch (error) {
      if (i === retries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
}

async function getRankings(category, filters = {}) {
  const { data } = await api.get('/rankings', {
    params: { category, ...filters },
  });
  return data.data;
}
```

## Python Examples

```python
import requests

API_BASE = 'http://localhost:3000/api'


class FragscrapeClient:
    def __init__(self):
        self.session = requests.Session()
        self.base_url = API_BASE

    def search(self, query, limit=20, use_cache=True):
        """Search for perfumes."""
        response = self.session.get(f'{self.base_url}/search', params={
            'q': query,
            'limit': limit,
            'cache': 'true' if use_cache else 'false',
        })
        return response.json()

    def get_perfume(self, brand, name, year=None):
        """Get detailed perfume information."""
        url = f'{self.base_url}/perfume/{brand}/{name}'
        params = {'year': year} if year else {}
        response = self.session.get(url, params=params)
        return response.json()

    def get_rankings(self, category, page=1, limit=20, **filters):
        """Get ranked fragrances."""
        params = {'category': category, 'page': page, 'limit': limit, **filters}
        response = self.session.get(f'{self.base_url}/rankings', params=params)
        return response.json()

    def save_query(self, query, name=None):
        """Save a search query with snapshot."""
        body = {'query': query}
        if name:
            body['name'] = name
        response = self.session.post(f'{self.base_url}/queries', json=body)
        return response.json()

    def review_next(self, query_id):
        """Get next unreviewed item (returns None when done)."""
        response = self.session.get(f'{self.base_url}/queries/{query_id}/next')
        if response.status_code == 204:
            return None
        return response.json()

    def tag_perfume(self, perfume_id, tag):
        """Add a tag to a perfume."""
        response = self.session.post(
            f'{self.base_url}/perfumes/{perfume_id}/tags',
            json={'tag': tag},
        )
        return response.json()

    def get_collection(self, tag):
        """Get perfumes by tag."""
        response = self.session.get(f'{self.base_url}/collection', params={'tag': tag})
        return response.json()

    def push_to_parfumo(self, scope='all'):
        """Push local data to Parfumo."""
        response = self.session.post(f'{self.base_url}/sync/push', json={'scope': scope})
        return response.json()

    def clear_cache(self, cache_type='all'):
        """Clear cache."""
        response = self.session.delete(f'{self.base_url}/cache', params={'type': cache_type})
        return response.json()

    def health(self):
        """Check server health."""
        response = self.session.get('http://localhost:3000/health')
        return response.json()


# Usage
client = FragscrapeClient()

# Search and save
results = client.search('tobacco vanille')
for perfume in results['data']:
    print(f"{perfume['brand']} - {perfume['name']}")

# Save query and review
saved = client.save_query('niche oud', name='Oud exploration')
query_id = saved['data']['id']

while item := client.review_next(query_id):
    perfume = item['data']['perfume']
    print(f"{perfume['brand']} - {perfume['name']}: {perfume.get('rating', 'N/A')}")
    # Tag interesting ones
    client.tag_perfume(item['data']['perfumeId'], 'want to try')

# Get rankings
top_mens = client.get_rankings('mens', limit=10, production='in-production')
```

## Common Response Formats

### Success Response
```json
{
  "success": true,
  "data": { ... },
  "timestamp": "2026-01-01T00:00:00.000Z"
}
```

### Error Response
```json
{
  "success": false,
  "error": "Error message here",
  "timestamp": "2026-01-01T00:00:00.000Z"
}
```

### Validation Error (400)
```json
{
  "success": false,
  "error": "Validation failed",
  "details": [
    { "field": "query", "message": "Required" }
  ],
  "timestamp": "2026-01-01T00:00:00.000Z"
}
```

## Rate Limits

Default rate limits:
- 100 requests per 15 minutes per IP
- Configurable via `RATE_LIMIT_WINDOW_MS` and `RATE_LIMIT_MAX_REQUESTS` environment variables
- Rate limiting applies to all `/api/*` routes
- Health check (`/health`) is not rate limited

## Tips

1. **Use caching**: Default `cache=true` avoids redundant scraping. Use `cache=false` only when you need fresh data.
2. **Saved queries**: Use queries + progress tracking for systematic exploration rather than one-off searches.
3. **Tag early**: Tag perfumes as you review them — tags drive sync and cleanup.
4. **Preview sync**: Always check `GET /api/sync/diff` before pushing to Parfumo.
5. **Handle 204**: `GET /queries/:id/next` returns 204 (no body) when all items are reviewed.
