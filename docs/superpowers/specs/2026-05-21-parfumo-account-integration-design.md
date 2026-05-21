# Parfumo Account Integration

**Date:** 2026-05-21
**Status:** Draft
**Scope:** Backend API only (no frontend), single Parfumo account

## Overview

Add authenticated Parfumo account management to fragscrape: log in to Parfumo, manage your collection/wishlist, submit ratings and reviews, and sync data between the local database and your Parfumo profile. All operations go through a dedicated auth browser instance that connects directly (no proxy) to avoid account flags.

## Constraints & Decisions

- **Single Parfumo account** — one session stored at a time, matching the existing single-user design
- **Backend API only** — endpoints + data model, no frontend
- **Browser handoff for login** — launches a visible browser window, user logs in manually, API captures cookies
- **Direct connection for auth** — authenticated requests bypass Decodo proxies and use the server's real IP. Scraping continues to use the proxy.
- **Manual push/pull sync** — explicit API calls control when data moves between local DB and Parfumo. No automatic syncing.
- **Encrypted cookie storage** — session cookies stored in SQLite encrypted with AES-256, key from `PARFUMO_SESSION_KEY` env var

## Architecture

### Browser Separation

Two independent Puppeteer browser instances:

1. **`BrowserClient` (existing)** — headless + Decodo proxy — scraping only. No changes.
2. **`AuthBrowserClient` (new)** — direct connection (no proxy) — authenticated Parfumo actions only.

`AuthBrowserClient` operates in two modes:
- **Visible mode** for login: `headless: false`, user interacts with the real Parfumo login page
- **Headless mode** for actions: loads stored cookies, navigates to perfume pages, interacts with DOM

### Component Layout

```
src/
├── auth/
│   ├── authBrowserClient.ts    # Puppeteer client for authenticated actions
│   ├── sessionManager.ts       # Cookie encryption, storage, validation
│   └── parfumoActions.ts       # DOM interaction helpers (collection, rating, review)
├── api/routes/
│   ├── auth.ts                 # POST /login, GET /status, POST /logout
│   ├── parfumoCollection.ts    # Collection CRUD on Parfumo
│   ├── parfumoRating.ts        # Rating submission/retrieval
│   ├── parfumoReview.ts        # Review/statement CRUD
│   └── sync.ts                 # Push/pull/diff
├── constants/
│   └── parfumoSelectors.ts     # All CSS selectors for Parfumo DOM interaction
└── database/
    └── parfumoDb.ts            # Session table, sync log, user data extensions
```

## Data Model

### New Table: `parfumo_session`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INTEGER | PRIMARY KEY, always 1 | Single account design |
| cookies | TEXT | NOT NULL | AES-256 encrypted JSON blob of Puppeteer cookies |
| username | TEXT | NULLABLE | Parfumo username for display/logging |
| logged_in_at | DATETIME | NOT NULL | When the session was established |
| last_verified_at | DATETIME | NULLABLE | Last successful session health check |
| created_at | DATETIME | NOT NULL | Row creation |
| updated_at | DATETIME | NOT NULL | Last modification |

### New Table: `parfumo_sync_log`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INTEGER | PRIMARY KEY | Auto-increment |
| direction | TEXT | NOT NULL | 'push' or 'pull' |
| perfume_id | INTEGER | FK → perfumes | Which perfume was synced |
| action | TEXT | NOT NULL | 'add_collection', 'remove_collection', 'rate', 'review', 'statement' |
| category | TEXT | NULLABLE | Collection category if applicable (wishlist, i_have, tested, i_had) |
| status | TEXT | NOT NULL | 'success', 'failed', 'skipped' |
| error_message | TEXT | NULLABLE | If failed, why |
| synced_at | DATETIME | NOT NULL | When the sync happened |

### Changes to Existing Table: `perfume_user_data`

New columns (all nullable, added via migration):

| Column | Type | Description |
|--------|------|-------------|
| parfumo_scent_rating | REAL | Your scent rating on Parfumo (0-10 scale) |
| parfumo_longevity_rating | REAL | Your longevity rating |
| parfumo_sillage_rating | REAL | Your sillage rating |
| parfumo_bottle_rating | REAL | Your bottle design rating |
| parfumo_value_rating | REAL | Your value-for-money rating |
| parfumo_review | TEXT | Your review/statement text on Parfumo |
| parfumo_synced_at | DATETIME | When this perfume's Parfumo data was last synced |

## API Endpoints

### Authentication

**`POST /api/auth/login`** — Launch visible browser for Parfumo login.

Behavior:
1. Launch Puppeteer in visible mode (headless: false), no proxy
2. Navigate to `https://www.parfumo.com/login`
3. Poll for login completion: check for the disappearance of the login form or appearance of a profile link
4. Timeout after 5 minutes → return 408
5. Extract all cookies via `page.cookies()`
6. Extract username from the profile link
7. Encrypt cookies with AES-256 using `PARFUMO_SESSION_KEY`
8. Upsert into `parfumo_session` table
9. Close browser, return `{ username, loggedInAt }`

Returns 503 if `PARFUMO_SESSION_KEY` is not configured.

**`GET /api/auth/status`** — Check if session is valid.

Behavior:
1. Load cookies from `parfumo_session`, decrypt
2. If no session exists, return `{ authenticated: false }`
3. Launch headless browser with cookies (no proxy)
4. Navigate to a lightweight authenticated page (e.g., profile settings)
5. Check for login form (expired) vs profile content (valid)
6. Update `last_verified_at` if valid
7. Return `{ authenticated: true/false, username, loggedInAt, lastVerifiedAt }`

**`POST /api/auth/logout`** — Clear stored session.

Behavior:
1. Delete the `parfumo_session` row
2. Return `{ message: "Logged out" }`

### Parfumo Collection Management

**`POST /api/parfumo/collection`** — Add perfume to a Parfumo collection.

Request body:
```json
{
  "perfumeId": 5,
  "category": "wishlist"
}
```

Valid categories: `wishlist`, `i_have`, `tested`, `i_had`.

Behavior:
1. Validate session exists and is not expired
2. Look up perfume URL from local DB
3. Launch auth browser headless with cookies
4. Navigate to perfume page
5. Click collection button area
6. Select the target category from the dropdown/modal
7. Verify action succeeded (DOM state change)
8. Update local tag to match (category → tag mapping: wishlist → "want to try", i_have → "own", tested → "tested")
9. Log to `parfumo_sync_log`
10. Return success

**`DELETE /api/parfumo/collection`** — Remove perfume from a Parfumo collection.

Request body: same as POST.

Behavior: Same flow but deselects the category. Removes local tag if it matches.

**`GET /api/parfumo/collection`** — Pull your full collection from Parfumo.

Response: scrapes your profile's collection pages and returns perfumes grouped by category.

### Parfumo Ratings

**`PUT /api/parfumo/rating`** — Submit or update your rating on Parfumo.

Request body:
```json
{
  "perfumeId": 5,
  "scent": 8.5,
  "longevity": 7.0,
  "sillage": 6.5,
  "bottle": 9.0,
  "value": 7.0
}
```

All rating fields are optional — only provided fields are updated. Values are 0-10 in 0.5 increments.

Behavior:
1. Validate session
2. Navigate to perfume page with auth cookies
3. Find rating area
4. For each provided dimension, interact with the rating input (slider/stars) to set the value
5. Parfumo auto-saves ratings — wait for XHR completion
6. Update local `perfume_user_data` Parfumo rating columns
7. Log to sync log
8. Return the full set of ratings as confirmed by the page

**`GET /api/parfumo/rating/:perfumeId`** — Get your current rating from Parfumo.

Behavior: Navigate to perfume page, read current rating values from the DOM, return them. Also updates local columns.

### Parfumo Reviews & Statements

**`GET /api/parfumo/reviews/:perfumeId`** — Get your review/statement from Parfumo.

Behavior: Navigate to perfume page, find your existing review/statement text, return it.

**`PUT /api/parfumo/reviews`** — Create or update your review on Parfumo.

Request body:
```json
{
  "perfumeId": 5,
  "text": "Rich oud opening that dries down to a warm amber..."
}
```

Behavior:
1. Navigate to perfume page with auth cookies
2. Find review/statement text area
3. Clear existing content, type new content
4. Submit (click button for reviews; statements may auto-save)
5. Verify content was saved
6. Update local `perfumo_review` column
7. Log to sync log

**`DELETE /api/parfumo/reviews/:perfumeId`** — Delete your review from Parfumo.

Behavior: Navigate to perfume page, find and click the delete/remove option for your review.

### Sync

**`GET /api/sync/diff`** — Preview what would change without executing.

Response:
```json
{
  "push": {
    "collections": [
      { "perfumeId": 5, "name": "Aventus", "localTag": "want to try", "parfumoCategory": null, "action": "add to wishlist" }
    ],
    "ratings": [],
    "reviews": []
  },
  "pull": {
    "collections": [
      { "perfumeId": 12, "name": "Sauvage", "parfumoCategory": "i_have", "localTag": null, "action": "add 'own' tag" }
    ],
    "ratings": [],
    "reviews": []
  }
}
```

**`POST /api/sync/push`** — Push local state to Parfumo.

Request body (optional filters):
```json
{
  "scope": "collections"  // "collections" | "ratings" | "reviews" | "all"
}
```

Default scope: `"all"`.

Behavior:
1. Run diff logic
2. For each item in the push list, execute the corresponding Parfumo action
3. Log each action to `parfumo_sync_log`
4. Return summary: `{ pushed: 5, failed: 1, skipped: 0, errors: [...] }`

Tag → Parfumo category mapping:
- `"want to try"` → `wishlist`
- `"own"` → `i_have`
- `"tested"` → `tested`
- Other tags (e.g., `"pass"`, custom tags) → not synced

**`POST /api/sync/pull`** — Pull Parfumo state to local.

Request body (optional filters):
```json
{
  "scope": "collections"
}
```

Behavior:
1. Scrape user's Parfumo profile collection pages
2. For each perfume found, ensure it exists in local DB (scrape details if needed)
3. Apply tags based on Parfumo category
4. If scope includes ratings: visit each perfume page to read your ratings
5. If scope includes reviews: read your review/statement text
6. Log to sync log
7. Return summary

## Configuration

New environment variables:

| Variable | Description | Default |
|----------|-------------|---------|
| `PARFUMO_SESSION_KEY` | AES-256 encryption key for cookie storage (32+ chars) | (required for auth features) |
| `PARFUMO_LOGIN_TIMEOUT_MS` | How long to wait for manual login | 300000 (5 min) |
| `PARFUMO_ACTION_TIMEOUT_MS` | Timeout for each authenticated browser action | 30000 (30s) |

## Browser Interaction Strategy

### Centralized Selectors

All CSS selectors for Parfumo DOM interaction live in `src/constants/parfumoSelectors.ts`. When Parfumo changes their UI, update selectors in one place. Structure:

```typescript
export const PARFUMO_SELECTORS = {
  login: {
    form: '...login form selector...',
    usernameInput: '...',
    passwordInput: '...',
    profileLink: '...indicator that login succeeded...',
  },
  collection: {
    button: '...collection/heart button...',
    dropdown: '...category dropdown/modal...',
    categories: {
      wishlist: '...',
      i_have: '...',
      tested: '...',
      i_had: '...',
    },
    activeState: '...selector for "already in this category" state...',
  },
  rating: {
    container: '...',
    scent: '...',
    longevity: '...',
    sillage: '...',
    bottle: '...',
    value: '...',
  },
  review: {
    container: '...',
    textArea: '...',
    submitButton: '...',
    deleteButton: '...',
  },
};
```

Selectors will be determined during implementation by inspecting the live Parfumo DOM. They are the most change-prone part of this system.

### Action Verification

Every DOM action includes a verification step:
1. Perform the action (click, type, etc.)
2. Wait for a DOM state change that confirms success
3. If verification fails after timeout, throw `ParfumoUIError` with the selector and page URL

### Session Health

Before each authenticated action:
1. Check `last_verified_at` — if within the last 30 minutes, skip verification
2. Otherwise, quick health check (navigate to an auth-required page, check for login form)
3. If expired, return 401 with instructions to re-login

## Error Handling

### New Error Classes

**`ParfumoUIError`** — extends existing `AppError`. Thrown when a DOM selector is not found or an action verification fails. Includes: selector that failed, page URL, screenshot path (if debug mode is on).

**`SessionExpiredError`** — extends `AppError`. HTTP 401. Thrown when cookies are invalid or session has expired.

**`SessionNotConfiguredError`** — extends `AppError`. HTTP 503. Thrown when `PARFUMO_SESSION_KEY` is not set or no session exists.

### Error Responses

- 401: Session expired → `{ error: "Session expired", action: "Call POST /api/auth/login to re-authenticate" }`
- 503: Auth not configured → `{ error: "Auth not configured", action: "Set PARFUMO_SESSION_KEY env var and call POST /api/auth/login" }`
- 502: Parfumo UI changed → `{ error: "Parfumo UI interaction failed", selector: "...", url: "..." }`

## Testing

### Unit Tests (automated, part of `npm test`)
- Session manager: encryption/decryption round-trip, cookie CRUD, session validation logic
- Parfumo DB: sync log CRUD, user data column migrations, session table operations
- Sync diff logic: tag ↔ category mapping, conflict detection
- Validation schemas: all new Zod schemas

### Selector Tests (automated, part of `npm test`)
- HTML fixtures of Parfumo pages (saved snapshots)
- Verify that selectors in `parfumoSelectors.ts` find the expected elements in the fixtures
- When Parfumo changes their UI, update the fixture and fix the selectors

### Integration Tests (manual, skipped by default)
- Only run when `PARFUMO_TEST=true` is set
- Require a real Parfumo login
- Test script: login → add to wishlist → verify → rate → verify → remove → verify → logout
- Not part of CI

## Parfumo Category ↔ Local Tag Mapping

| Parfumo Category | Local Tag | Direction |
|------------------|-----------|-----------|
| Wishlist | `want to try` | Bidirectional |
| I have | `own` | Bidirectional |
| Tested | `tested` | Bidirectional |
| I had | (not mapped) | Pull only → creates `i had` tag |
| — | `pass` | Local only, never synced |
| — | Custom tags | Local only, never synced |

## Future Considerations

Out of scope but the design supports:
- **Multi-user**: Add `user_id` FK to `parfumo_session` and all user-scoped tables
- **Custom collection sync**: Map custom Parfumo collections to custom local tags
- **Auto-sync**: Add a webhook or polling mechanism to detect changes
- **Frontend**: Auth status indicator, sync dashboard, collection browser
