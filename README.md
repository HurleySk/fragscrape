# Fragscrape API

A sophisticated web scraping API for perfume and fragrance data from Parfumo and Fragrantica, built with TypeScript, Express, and utilizing Decodo's rotating residential proxies for reliable data extraction.

## Features

- **Smart Proxy Management**: Automatic rotation of Decodo residential proxies with sub-user management
- **Cost Control**: Built-in 1GB traffic limits per sub-user with automatic warnings
- **Data Caching**: SQLite database for efficient caching and reducing API calls
- **Rate Limiting**: Configurable rate limiting to respect target websites
- **RESTful API**: Clean, well-documented API endpoints with comprehensive proxy monitoring
- **Error Handling**: Comprehensive error handling and logging
- **Real-time Monitoring**: Full proxy and sub-user status via API endpoints

## Prerequisites

- Node.js v18+ and npm
- Decodo account with API access (API key or username/password)
- SQLite3

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

4. Configure your Decodo authentication in `.env`:

**Option 1: API Key (Recommended)**
```env
# Get from Decodo dashboard > Settings > API Keys
DECODO_API_KEY=your_api_key_here
```

**Option 2: Username/Password**
```env
DECODO_USERNAME=your_decodo_username
DECODO_PASSWORD=your_decodo_password
```

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

### First Time Setup

1. Start the server
2. Set up a Decodo sub-user (choose one):

   **Option A: Create a new sub-user** (recommended for new accounts)
   ```bash
   curl -X POST http://localhost:3000/api/proxy/create-subuser
   ```

   **Option B: Add existing sub-user** (if you already have one in Decodo)
   ```bash
   curl -X POST http://localhost:3000/api/proxy/add-subuser \
     -H "Content-Type: application/json" \
     -d '{"username": "your_existing_subuser", "password": "their_password"}'
   ```

3. Test the proxy connection:
```bash
curl http://localhost:3000/api/proxy/test
```

### Quick Start Examples

```bash
# Search for perfumes
curl "http://localhost:3000/api/search?q=Aventus&limit=10"

# Get specific perfume details
curl "http://localhost:3000/api/perfume/Creed/Aventus"

# Check current proxy status and usage
curl http://localhost:3000/api/proxy/status | jq .

# Monitor all sub-users
curl http://localhost:3000/api/proxy/subusers | jq .
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
Parameters:
- `cache`: Query parameter, set to `false` to bypass cache (default: `true`)

#### Get Perfumes by Brand
```
GET /api/brand/{brand}?page=1
```

### Proxy Management Endpoints

#### Get Proxy Status
```
GET /api/proxy/status
```

#### Create Sub-User
```
POST /api/proxy/create-subuser
```

#### Test Connection
```
GET /api/proxy/test
```

#### Rotate Proxy
```
POST /api/proxy/rotate
```

#### List Sub-Users
```
GET /api/proxy/subusers
```

#### Add Existing Sub-User
```
POST /api/proxy/add-subuser
Body: { "username": "existing_user", "password": "their_password" }
```

Adds an existing Decodo sub-user to the local database. Useful for:
- Importing sub-users created outside the API
- Recovering from database loss
- Managing pre-existing sub-users

Response includes current traffic usage, status, and all sub-user details.

**Example:**
```bash
curl -X POST http://localhost:3000/api/proxy/add-subuser \
  -H "Content-Type: application/json" \
  -d '{
    "username": "fragscrape_1234567890_abc",
    "password": "SecureP@ssw0rd"
  }'
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "12345",
    "username": "fragscrape_1234567890_abc",
    "status": "active",
    "trafficUsedMB": "123.45",
    "trafficLimitMB": "1024.00",
    "usagePercent": "12.1",
    "serviceType": "residential",
    "createdAt": "2024-01-15T10:30:00.000Z",
    "lastChecked": "2025-10-06T..."
  }
}
```

## Authentication Methods

### API Key Authentication (Recommended)

1. Log into your [Decodo dashboard](https://dashboard.decodo.com)
2. Navigate to Settings > API Keys
3. Create a new API key and save it immediately (you won't see it again)
4. Set `DECODO_API_KEY` in your `.env` file

Benefits:
- Simpler setup - no auth endpoint required
- Better security - can be rotated easily
- Direct authentication with every request

### Username/Password Authentication

Traditional method using Decodo account credentials:
1. Set `DECODO_USERNAME` and `DECODO_PASSWORD` in `.env`
2. The API will authenticate and obtain a session token
3. Token is used for subsequent requests

Note: Either API key OR username/password must be provided.

## Monitoring via API

Monitor your proxy status and sub-users using these API endpoints:

```bash
# Get comprehensive proxy status and all sub-users
curl http://localhost:3000/api/proxy/status

# List sub-users with detailed usage
curl http://localhost:3000/api/proxy/subusers

# Test proxy connection
curl http://localhost:3000/api/proxy/test

# Create new sub-user (1GB limit)
curl -X POST http://localhost:3000/api/proxy/create-subuser

# Add existing sub-user to database
curl -X POST http://localhost:3000/api/proxy/add-subuser \
  -H "Content-Type: application/json" \
  -d '{"username": "existing_user", "password": "their_password"}'

# Force rotate to different proxy
curl -X POST http://localhost:3000/api/proxy/rotate
```

## Configuration

All configuration is done through environment variables:

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | API server port | 3000 |
| `NODE_ENV` | Environment mode | development |
| `DECODO_API_URL` | Decodo API endpoint | https://api.decodo.com/v1 |
| `DECODO_API_KEY` | API key for authentication (recommended) | - |
| `DECODO_USERNAME` | Username for legacy auth | - |
| `DECODO_PASSWORD` | Password for legacy auth | - |
| `DECODO_PROXY_ENDPOINT` | Proxy server endpoint | gate.decodo.com |
| `DECODO_PROXY_PORT` | Proxy server port | 7000 |
| `DATABASE_PATH` | SQLite database path | ./data/fragscrape.db |
| `LOG_LEVEL` | Logging level | info |
| `SUB_USER_TRAFFIC_LIMIT_GB` | Traffic limit per sub-user | 1 |
| `SUB_USER_WARNING_THRESHOLD_MB` | Warning threshold | 900 |

## Project Structure

```
fragscrape/
├── src/
│   ├── api/              # API routes and middleware
│   │   ├── routes/       # Route handlers
│   │   └── middleware/   # Express middleware
│   ├── scrapers/         # Web scraping logic
│   ├── proxy/            # Proxy management
│   ├── database/         # Database layer
│   ├── types/            # TypeScript type definitions
│   ├── utils/            # Utility functions
│   └── config/           # Configuration
├── tests/                # Test files
├── logs/                 # Application logs
└── data/                 # SQLite database
```

## Sub-User Management

The API provides flexible Decodo sub-user management to control costs:

1. **Creation Options**:
   - Create new sub-users via API
   - Import existing sub-users from your Decodo account
2. **Usage Monitoring**: Tracks traffic usage in real-time
3. **Warning System**: Alerts at 900MB usage (configurable)
4. **Automatic Rotation**: Switches when limit approached
5. **Cost Control**: Each sub-user limited to 1GB (configurable)
6. **Status Tracking**: Real-time status (active/exhausted/error)

## Error Handling

- Comprehensive error logging with Winston
- Graceful error recovery
- Automatic proxy rotation on failures
- Request retry with exponential backoff

## Testing

Run tests:
```bash
npm test
```

## Security Considerations

- Never expose Decodo credentials
- Use environment variables for sensitive data
- Implement API key authentication for production
- Enable HTTPS in production
- Regularly rotate sub-users

## Troubleshooting

### No Active Sub-Users
Create a new sub-user or add an existing one:

**Create new:**
```bash
curl -X POST http://localhost:3000/api/proxy/create-subuser
```

**Add existing:**
```bash
curl -X POST http://localhost:3000/api/proxy/add-subuser \
  -H "Content-Type: application/json" \
  -d '{"username": "your_user", "password": "your_password"}'
```

### Proxy Connection Failed
1. Check Decodo credentials in `.env`
2. Verify sub-user has available traffic
3. Test connection: `GET /api/proxy/test`

### Cache Issues
Clear expired cache entries:
- Automatic cleanup runs hourly
- Manual cleanup: Delete `data/fragscrape.db`

## Contributing

1. Fork the repository
2. Create feature branch
3. Commit changes
4. Push to branch
5. Open pull request

## License

MIT

## Disclaimer

This tool is for educational and research purposes only. Always respect website terms of service and robots.txt files. Use responsibly and ethically.