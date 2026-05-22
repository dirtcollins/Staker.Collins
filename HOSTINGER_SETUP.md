# Hostinger VPS PostgreSQL Setup

This app now expects a PostgreSQL database named `acquisition_os` in production.

## 1. Install PostgreSQL on the VPS

```bash
sudo apt update
sudo apt install -y postgresql postgresql-contrib
sudo systemctl enable --now postgresql
```

## 2. Create the database and user

```bash
sudo -u postgres psql
```

```sql
CREATE DATABASE acquisition_os;
CREATE USER acquisition_os_user WITH PASSWORD 'CHANGE_THIS_PASSWORD';
GRANT ALL PRIVILEGES ON DATABASE acquisition_os TO acquisition_os_user;
\c acquisition_os
GRANT ALL ON SCHEMA public TO acquisition_os_user;
\q
```

## 3. Configure the app

Create `.env` on the VPS:

```bash
PORT=4181
DATABASE_URL=postgres://acquisition_os_user:CHANGE_THIS_PASSWORD@127.0.0.1:5432/acquisition_os
MEMORY_DB=0
```

## 4. Install, migrate, and seed

```bash
npm install --omit=dev
npm run db:migrate
npm run db:seed
npm start
```

## 5. Production note

The app has an explicit `MEMORY_DB=1` mode for local testing only. Do not use it on the VPS. Production must use `DATABASE_URL`.

Clerk login is scaffold-ready in `.env.example`, but the Clerk keys still need to be added before auth is enforced.
