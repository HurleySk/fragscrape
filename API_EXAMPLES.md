# Fragscrape API Examples

Complete examples for using the Fragscrape API with curl, JavaScript, and Python.

## Proxy Management

### Monitor Proxy Status
```bash
# Get complete proxy status with all sub-users
curl http://localhost:3000/api/proxy/status | jq '.'

# Response includes:
# - Total sub-users count
# - Active vs exhausted sub-users
# - Current sub-user in use
# - Traffic usage for each sub-user
```

### Create New Sub-User
```bash
# Create a new 1GB sub-user
curl -X POST http://localhost:3000/api/proxy/create-subuser

# Response:
# {
#   "success": true,
#   "data": {
#     "id": "sub_123",
#     "username": "fragscrape_1234567890_abc123",
#     "status": "active",
#     "trafficLimitMB": 1024,
#     "createdAt": "2024-01-01T00:00:00Z"
#   }
# }
```

### Monitor Sub-User Usage
```bash
# List all sub-users with detailed usage
curl http://localhost:3000/api/proxy/subusers | jq '.data[] | {username, usagePercent, status}'

# Watch usage in real-time (updates every 5 seconds)
watch -n 5 'curl -s http://localhost:3000/api/proxy/status | jq ".data.totalTrafficUsedMB"'
```

### Test and Rotate Proxy
```bash
# Test current proxy connection
curl http://localhost:3000/api/proxy/test

# Force rotate to different sub-user
curl -X POST http://localhost:3000/api/proxy/rotate
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
# Get by brand and name
curl "http://localhost:3000/api/perfume/Tom%20Ford/Black%20Orchid"

# Get specific year variant
curl "http://localhost:3000/api/perfume/Dior/Sauvage?year=2015"

# Get by direct URL
curl -X POST http://localhost:3000/api/perfume/by-url \
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

## JavaScript/Node.js Examples

### Using fetch
```javascript
// Monitor proxy status
async function getProxyStatus() {
  const response = await fetch('http://localhost:3000/api/proxy/status');
  const data = await response.json();

  if (data.success) {
    console.log(`Active sub-users: ${data.data.activeSubUsers}`);
    console.log(`Total traffic used: ${data.data.totalTrafficUsedMB}MB`);

    // Check if new sub-user needed
    if (data.data.activeSubUsers === 0) {
      await createSubUser();
    }
  }
}

// Create sub-user
async function createSubUser() {
  const response = await fetch('http://localhost:3000/api/proxy/create-subuser', {
    method: 'POST'
  });
  const data = await response.json();
  console.log('New sub-user created:', data.data.username);
}

// Search perfumes
async function searchPerfumes(query, limit = 20) {
  const response = await fetch(
    `http://localhost:3000/api/search?q=${encodeURIComponent(query)}&limit=${limit}`
  );
  const data = await response.json();

  return data.data;
}

// Get perfume details
async function getPerfumeDetails(brand, name) {
  const response = await fetch(
    `http://localhost:3000/api/perfume/${encodeURIComponent(brand)}/${encodeURIComponent(name)}`
  );
  const data = await response.json();

  return data.data;
}
```

### Using axios
```javascript
const axios = require('axios');

const API_BASE = 'http://localhost:3000/api';

// Create axios instance
const api = axios.create({
  baseURL: API_BASE,
  timeout: 30000
});

// Monitor sub-users
async function monitorSubUsers() {
  try {
    const { data } = await api.get('/proxy/subusers');

    data.data.forEach(user => {
      console.log(`${user.username}: ${user.usagePercent}% used`);

      if (parseFloat(user.usagePercent) > 90) {
        console.warn(`⚠️ ${user.username} is near limit!`);
      }
    });
  } catch (error) {
    console.error('Error:', error.message);
  }
}

// Search with error handling
async function robustSearch(query, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const { data } = await api.get(`/search?q=${query}`);
      return data.data;
    } catch (error) {
      if (i === retries - 1) throw error;

      // Rotate proxy and retry
      await api.post('/proxy/rotate');
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
}
```

## Python Examples

```python
import requests
import json
import time

API_BASE = 'http://localhost:3000/api'

class FragscrapeClient:
    def __init__(self):
        self.session = requests.Session()
        self.base_url = API_BASE

    def get_proxy_status(self):
        """Get current proxy status"""
        response = self.session.get(f'{self.base_url}/proxy/status')
        return response.json()

    def create_subuser_if_needed(self):
        """Create sub-user if none active"""
        status = self.get_proxy_status()

        if status['data']['activeSubUsers'] == 0:
            response = self.session.post(f'{self.base_url}/proxy/create-subuser')
            return response.json()

        return None

    def search_perfumes(self, query, limit=20, use_cache=True):
        """Search for perfumes"""
        params = {
            'q': query,
            'limit': limit,
            'cache': 'true' if use_cache else 'false'
        }

        response = self.session.get(f'{self.base_url}/search', params=params)
        return response.json()

    def get_perfume_details(self, brand, name, year=None):
        """Get detailed perfume information"""
        url = f'{self.base_url}/perfume/{brand}/{name}'
        params = {'year': year} if year else {}

        response = self.session.get(url, params=params)
        return response.json()

    def monitor_usage(self, interval=60):
        """Monitor proxy usage continuously"""
        while True:
            status = self.get_proxy_status()
            data = status['data']

            print(f"Active: {data['activeSubUsers']}, "
                  f"Total used: {data['totalTrafficUsedMB']:.2f}MB")

            # Check each sub-user
            for user in data['subUsers']:
                usage_pct = (user['trafficUsedMB'] / user['trafficLimitMB']) * 100
                if usage_pct > 90:
                    print(f"⚠️ {user['username']} at {usage_pct:.1f}% capacity!")

            time.sleep(interval)

# Usage
client = FragscrapeClient()

# Ensure sub-user exists
client.create_subuser_if_needed()

# Search for perfumes
results = client.search_perfumes('tobacco vanille')
for perfume in results['data']:
    print(f"{perfume['brand']} - {perfume['name']}")

# Get details
details = client.get_perfume_details('Tom Ford', 'Tobacco Vanille')
if details['success']:
    perfume = details['data']
    print(f"Rating: {perfume.get('rating', 'N/A')}")
    print(f"Notes: {perfume.get('notes', {})}")
```

## Monitoring Scripts

### Bash Script for Continuous Monitoring
```bash
#!/bin/bash
# monitor.sh - Monitor proxy usage and create sub-users as needed

API_BASE="http://localhost:3000/api"
WARNING_THRESHOLD=90

while true; do
    # Get current status
    STATUS=$(curl -s "$API_BASE/proxy/status")

    # Parse active sub-users count
    ACTIVE=$(echo "$STATUS" | jq '.data.activeSubUsers')
    USED_MB=$(echo "$STATUS" | jq '.data.totalTrafficUsedMB')

    echo "$(date): Active sub-users: $ACTIVE, Total used: ${USED_MB}MB"

    # Create new sub-user if none active
    if [ "$ACTIVE" -eq 0 ]; then
        echo "No active sub-users! Creating new one..."
        curl -X POST "$API_BASE/proxy/create-subuser"
    fi

    # Check each sub-user's usage
    echo "$STATUS" | jq -r '.data.subUsers[] |
        select(.status == "active") |
        "\(.username): \(.trafficUsedMB)MB / \(.trafficLimitMB)MB"'

    sleep 30
done
```

### PowerShell Script for Windows
```powershell
# monitor.ps1 - Monitor proxy usage

$apiBase = "http://localhost:3000/api"

while ($true) {
    $status = Invoke-RestMethod -Uri "$apiBase/proxy/status"

    Write-Host "Active Sub-Users: $($status.data.activeSubUsers)"
    Write-Host "Total Traffic: $($status.data.totalTrafficUsedMB)MB"

    # Check each sub-user
    foreach ($user in $status.data.subUsers) {
        $percentage = [math]::Round(($user.trafficUsedMB / $user.trafficLimitMB) * 100, 1)

        if ($percentage -gt 90) {
            Write-Host "WARNING: $($user.username) at $percentage%" -ForegroundColor Red
        } else {
            Write-Host "$($user.username): $percentage%" -ForegroundColor Green
        }
    }

    Start-Sleep -Seconds 30
}
```

## Error Handling Examples

### Automatic Retry with Proxy Rotation
```javascript
async function searchWithRetry(query, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(`http://localhost:3000/api/search?q=${query}`);
      const data = await response.json();

      if (data.success) {
        return data.data;
      }

      // If error is proxy-related, rotate
      if (data.error && data.error.includes('proxy')) {
        await fetch('http://localhost:3000/api/proxy/rotate', { method: 'POST' });
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    } catch (error) {
      console.log(`Attempt ${attempt} failed:`, error.message);

      if (attempt === maxRetries) {
        throw new Error(`Failed after ${maxRetries} attempts`);
      }
    }
  }
}
```

## Tips & Best Practices

1. **Monitor Usage Regularly**: Check `/api/proxy/status` every few minutes
2. **Pre-create Sub-Users**: Create new sub-users at 90% usage to avoid interruption
3. **Use Caching**: Leverage the cache to reduce API calls and costs
4. **Handle Errors Gracefully**: Implement retry logic with proxy rotation
5. **Rate Limit Yourself**: Add delays between requests to be respectful
6. **Log Everything**: Track usage patterns to optimize your scraping

## Common Response Formats

### Success Response
```json
{
  "success": true,
  "data": { ... },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

### Error Response
```json
{
  "success": false,
  "error": "Error message here",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Rate Limits

Default rate limits:
- 100 requests per 15 minutes per IP
- Configurable via environment variables