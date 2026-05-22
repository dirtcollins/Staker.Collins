# Hostinger Node.js Deployment

Upload the zip contents into the Node.js application directory on Hostinger.

## Required Environment Variables

Set these in Hostinger's Node.js app environment or in a server-side `.env` file:

```bash
PORT=4181
DATABASE_URL=postgres://USER:PASSWORD@127.0.0.1:5432/acquisition_os
MEMORY_DB=0
```

Optional:

```bash
RENTCAST_API_KEY=your_rentcast_key
CLERK_SECRET_KEY=your_clerk_secret_key
VITE_CLERK_PUBLISHABLE_KEY=your_clerk_publishable_key
```

## Install And Start

From the extracted app directory:

```bash
npm install --omit=dev
npm run db:migrate
npm run db:seed
npm start
```

The production start command is:

```bash
node server.js
```

## PM2 Alternative

If managing the app directly on a VPS:

```bash
npm install --omit=dev
npm run db:migrate
npm run db:seed
pm2 start server.js --name acquisition-os
pm2 save
```

## Health Check

After the app starts, check:

```bash
curl http://127.0.0.1:4181/api/health
```

Expected response:

```json
{"ok":true,"database":"postgres"}
```

If it says `"memory"`, the app is running without `DATABASE_URL`; that is only acceptable for a temporary demo, not production.
