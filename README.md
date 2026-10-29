# Al Hara Cafeteria — Backend API

Tiny, zero-dependency Node.js backend API and persistence layer for **Al Hara Cafeteria**. Uses only Node.js (v18+) built-in modules (`http`, `fs`, `path`, `crypto`).

## Features

- **Zero npm dependencies**: Fast startup, tiny footprint, no security supply chain concerns.
- **RESTful API**: Public menu/content endpoints, customer order submissions, and full admin management.
- **Built-in Session & Authentication**: Secure scrypt password hashing and HttpOnly cookie-based sessions with brute-force rate limiting.
- **CORS & Decoupled Frontend Support**: Built-in preflight OPTIONS and configurable CORS origins for static frontend hosting (GitHub Pages, Vercel, Netlify).
- **Atomic File Storage**: Orders, menu, and settings safely persisted in JSON with atomic file replacement to prevent data corruption.
- **Image Uploads**: Base64 image upload handler with automatic storage in persistent disk.

## Directory Structure

```text
├── server/
│   ├── server.js       # Main HTTP server & API router
│   ├── hash.js         # CLI tool to generate password hashes
│   └── seed.json       # Initial menu & website content seed
├── data/               # Persistent database directory (contains data.json)
├── uploads/            # Uploaded photos & media files
├── .env.example        # Environment variable template
├── .gitignore          # Git ignore rules
└── package.json        # Project metadata & npm start scripts
```

## Getting Started

### 1. Prerequisites
- Node.js 18 or newer

### 2. Configure Environment
1. Generate an admin password hash:
   ```bash
   node server/hash.js "your-strong-password"
   ```
2. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
3. Set your credentials and configuration in `.env`:
   ```ini
   PORT=3000
   ADMIN_USER=admin
   ADMIN_PASSWORD_HASH=<hash_from_step_1>
   CORS_ORIGIN=*
   ```

### 3. Run the Server
```bash
npm start
# or
node server/server.js
```

The API will be available at `http://localhost:3000`.

## API Endpoints

### Public Endpoints
- `GET /api/public` — Returns cafeteria content, visible menu items, and gallery photos.
- `POST /api/orders` — Submits customer order with rate limiting and price verification.

### Authentication
- `POST /api/login` — Sign in as admin (`{ "username": "...", "password": "..." }`).
- `POST /api/logout` — Invalidate current admin session.
- `GET /api/me` — Verify active admin authentication status.

### Admin Endpoints (Require Admin Session)
- `GET /api/admin/data` — Fetch full state (menu, orders, content, gallery, palette).
- `PUT /api/admin/content` — Update cafeteria details, hours, contact, and branding colors.
- `POST /api/admin/upload` — Upload photo (PNG, JPG, WebP, GIF up to 6MB).
- `POST /api/admin/menu` / `PUT /api/admin/menu/:id` / `DELETE /api/admin/menu/:id` — Manage menu items.
- `POST /api/admin/gallery` / `PUT /api/admin/gallery/:id` / `DELETE /api/admin/gallery/:id` — Manage gallery images.
- `PUT /api/admin/orders/:id` / `DELETE /api/admin/orders/:id` — Update or clear customer orders.

## Deployment Notes

- Deploy on any platform running Node.js (Render, Railway, Fly.io, DigitalOcean, or a VPS).
- **Persistent Storage**: Ensure `DATA_DIR` and `UPLOAD_DIR` point to persistent disk volumes so menu edits and uploads persist across restarts.
- **Production Cookies**: When serving over HTTPS, set `COOKIE_SECURE=1` and `COOKIE_SAMESITE=None` (if frontend and backend use different domains).