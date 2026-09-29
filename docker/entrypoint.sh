#!/bin/sh
set -e

echo "Waiting for PostgreSQL..."
until node -e "
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.\$connect()
  .then(() => prisma.\$disconnect())
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
" >/dev/null 2>&1; do
  sleep 1
done

echo "Running migrations..."
./node_modules/.bin/prisma migrate deploy

echo "Seeding slots..."
node dist/prisma/seed.js

echo "Starting API..."
exec node dist/main.js
