#!/bin/sh
set -e

echo "Running database migrations..."
npx prisma migrate deploy

echo "Starting backend server..."
exec node index.js
