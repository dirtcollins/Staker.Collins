# Staker Collins Production Handoff

This zip contains the production-ready Staker Collins app code.

## Live Site

Production URL:

```text
https://staker-collins.vercel.app
```

## What Is Included

- Vercel deployment config: `vercel.json`
- Vercel serverless entrypoint: `api/index.js`
- App server: `server.js`
- Frontend files: `index.html`, `app.js`, `styles.css`
- Property data and photos: `data/`, `assets/`
- Database schema and scripts: `db/schema.sql`, `scripts/`
- Package and lock files: `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`

## Local Run

Install dependencies:

```bash
npm install
```

Run local demo mode:

```bash
MEMORY_DB=1 PORT=4181 npm start
```

Open:

```text
http://localhost:4181
```

## Vercel Deploy

Install the Vercel CLI if needed:

```bash
npm i -g vercel
```

Deploy:

```bash
vercel deploy
```

Deploy to production:

```bash
vercel deploy --prod
```

## Production Database

The live Vercel site currently works in memory/demo mode unless a production `DATABASE_URL` is added in Vercel.

For persistent production data:

1. Add a Postgres connection string as `DATABASE_URL` in Vercel environment variables.
2. Run migrations:

```bash
DATABASE_URL="postgres://USER:PASSWORD@HOST:PORT/DB" npm run db:migrate
```

3. Seed the starting property data:

```bash
DATABASE_URL="postgres://USER:PASSWORD@HOST:PORT/DB" npm run db:seed
```

## UploadThing Media Uploads

Photo and video file uploads use UploadThing when `UPLOADTHING_TOKEN` is configured.

1. Create or open the UploadThing app at:

```text
https://uploadthing.com/
```

2. Copy the token from the UploadThing dashboard API Keys tab.
3. Add it to Vercel environment variables:

```text
UPLOADTHING_TOKEN=...
```

4. Redeploy the Vercel project.

Without `UPLOADTHING_TOKEN`, Vercel cannot accept durable file uploads. The app can still save pasted media links, and local browser fallback can be used for demo uploads.

## Account Access

This zip gives access to the app code. It does not grant dashboard access to Vercel, GitHub, Hostinger, or any database.

To give Nathan full operational access, invite him separately to:

- The Vercel project/team
- The GitHub repository, if one is created
- The production database provider
- Hostinger, if Hostinger remains in use
