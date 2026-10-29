# Al Hara Cafeteria — Backend API

Node.js backend API and persistence layer for **Al Hara Cafeteria**, optimized for serverless deployment on **Vercel** with **Neon PostgreSQL** database support and local filesystem fallback.

## Features

- **PostgreSQL Database (Neon)**: Persistent cloud database for menu, site content, orders, and sessions.
- **Serverless Ready (Vercel)**: Configured with `vercel.json` rewrites and `api/index.js` serverless function.
- **Cross-Origin (CORS) Support**: Preflight `OPTIONS` and credentials support for decoupled frontends.
- **Database Image Storage**: Uploaded media safely stored in PostgreSQL and served directly via `/uploads/*` without needing external S3 buckets.
- **Multi-Instance Sessions**: Admin session tokens persisted in database across serverless function instances.
- **Local Fallback**: Automatically falls back to local JSON (`data/data.json`) and disk storage if no `DATABASE_URL` is set.

## Deployment to Vercel

1. Import your GitHub repository (`syednehajafferyy/alharabackend`) into [Vercel](https://vercel.com).
2. Set the **Framework Preset** to `Other`.
3. Add the following **Environment Variables** in the Vercel project settings:

| Variable | Description | Example / Recommended Value |
| :--- | :--- | :--- |
| `DATABASE_URL` | Neon PostgreSQL Connection URI | `postgresql://neondb_owner:npg_w5qAMLWkZbV8@ep-calm-hat-b45uu5p7-pooler.c-6.us-east-2.aws.neon.tech/neondb?sslmode=require` |
| `ADMIN_USER` | Admin Panel Login Username | `admin` |
| `ADMIN_PASSWORD_HASH` | Admin Password Salt & Hash | `3e2248d3fab8bd7e4fd14fefdb10a443:190caa71190a472279cafb4bad6fb5f6121137bc39266c4f4a6d41521bd7cda1` |
| `CORS_ORIGIN` | Allowed Frontend Origin(s) | `*` (or your frontend domain, e.g. `https://syednehajafferyy.github.io`) |
| `COOKIE_SECURE` | HTTPS secure cookie flag | `1` |
| `COOKIE_SAMESITE` | Cross-site cookie attribute | `None` |

4. Click **Deploy**.

## Generating Your Own Admin Password

Run the included hashing utility to create a new password hash:

```bash
node server/hash.js "your-secure-password"
```

Copy the generated `ADMIN_PASSWORD_HASH=...` output into your Vercel Environment Variables.

## Local Development

```bash
# Install dependencies
npm install

# Start server locally
npm start
```

The backend server starts on `http://localhost:3000`.