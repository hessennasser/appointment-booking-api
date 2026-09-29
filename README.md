# Appointment Booking API

NestJS + PostgreSQL + Prisma + Socket.IO appointment booking API for an independent take-home exercise.

## Requirements

- Node.js 20+ (tested with Node 24) — *or* Docker
- PostgreSQL 14+ — *or* Docker Compose
- npm — *or* Docker

## Run with Docker (recommended)

Starts PostgreSQL + the API, applies migrations, and seeds slots automatically.

```bash
docker compose up --build -d
```

API: `http://localhost:3000`  
Docs: `http://localhost:3000/docs`

Useful commands:

```bash
# logs
docker compose logs -f api

# stop
docker compose down

# stop and wipe database volume
docker compose down -v
```

Smoke check:

```bash
curl -s http://localhost:3000/slots
```

## Install (local, without Docker)

```bash
npm install
cp .env.example .env
# edit DATABASE_URL if needed
```

## Environment

| Variable       | Description                                      | Example |
|----------------|--------------------------------------------------|---------|
| `DATABASE_URL` | Prisma PostgreSQL connection string              | `postgresql://booking:booking@localhost:5432/booking_dev?schema=public` |
| `PORT`         | HTTP + Socket.IO listen port (optional)          | `3000` |
| `SOCKET_URL`   | Used only by `npm run socket:listen` (optional)  | `http://localhost:3000` |

Copy `.env.example` → `.env`. Do not commit real `.env` files.

## Migrations & seed

```bash
# apply migrations
npm run prisma:migrate

# seed fixed slots
npm run prisma:seed

# or both
npm run db:setup
```

Seed inserts five fixed slots with stable UUIDs (idempotent upserts), including:

`11111111-1111-4111-8111-111111111111` → `2030-01-15T09:00:00.000Z`–`09:30:00.000Z`

## Run

```bash
npm run start:dev
# or
npm run build && npm run start:prod
```

API base: `http://localhost:3000`

| Resource | URL |
|----------|-----|
| List available slots | `GET /slots` |
| Create booking | `POST /bookings` |
| Cancel booking | `DELETE /bookings/{bookingId}` |
| Swagger UI | `GET /docs` |
| OpenAPI JSON | `GET /openapi.json` |

No authentication is required.

## Test database setup & e2e tests

Tests use a **real PostgreSQL** database (not mocks). Recommended: a dedicated `booking_test` database.

```bash
# create test DB (example using psql)
psql "postgresql://booking:booking@localhost:5432/booking_dev" \
  -c "CREATE DATABASE booking_test;"

# migrate the test database
DATABASE_URL="postgresql://booking:booking@localhost:5432/booking_test?schema=public" \
  npx prisma migrate deploy

# run the e2e suite (refuses to run unless the DB name is booking_test)
DATABASE_URL="postgresql://booking:booking@localhost:5432/booking_test?schema=public" \
  npm run test:e2e
```

Each test truncates `bookings` / `slots` and re-seeds one known slot so runs are repeatable.

Covered scenarios:

1. Successful booking → `201`, slot disappears from `GET /slots`
2. Two concurrent booking requests for the same free slot → one `201` and one `409`, exactly one active booking row
3. Cancel → `200`, slot becomes available again, a new booking succeeds

## Socket.IO (no frontend)

Same HTTP server. Namespace `/`, path `/socket.io`. No auth, rooms, or client-emitted app events.

After a **successful** DB commit the server emits once:

| Event | Payload |
|-------|---------|
| `slot.booked` | `{ "slotId": "...", "bookingId": "...", "available": false }` |
| `slot.released` | `{ "slotId": "...", "bookingId": "...", "available": true }` |

Rejected requests and repeated cancels do **not** emit. Customer fields are never included.

Socket.IO events are **change notifications**, not a durable source of truth. The database remains authoritative; after an event, clients may refresh `GET /slots` when they need definitive availability (for example if cancel and rebook race on the same slot).

### Manual listen script

Terminal 1 — API:

```bash
npm run start:dev
```

Terminal 2 — listener:

```bash
npm run socket:listen
```

Terminal 3 — HTTP:

```bash
curl -s http://localhost:3000/slots

curl -s -X POST http://localhost:3000/bookings \
  -H 'Content-Type: application/json' \
  -d '{"slotId":"11111111-1111-4111-8111-111111111111","customerName":"Alex Morgan","customerEmail":"alex@example.com"}'

curl -s -X DELETE http://localhost:3000/bookings/<bookingId>
```

You should see `slot.booked` then `slot.released` printed by the listener.

## Conflict prevention (design)

**Mechanism:** a PostgreSQL **partial unique index**:

```sql
CREATE UNIQUE INDEX bookings_one_active_per_slot_idx
ON bookings (slot_id)
WHERE status = 'active';
```

Booking creation is a single `INSERT`. Under concurrent requests:

- one insert commits → HTTP `201`
- the other hits unique violation (`Prisma P2002` on that index / `slot_id`) → HTTP `409 SLOT_UNAVAILABLE`
- at most one `active` booking per slot remains

Only that active-slot unique violation is mapped to `SLOT_UNAVAILABLE`; other database errors stay unexpected (`INTERNAL_ERROR`).

Why this approach:

- Enforced by the database, not application locks that can race across processes
- Works for identical or different customer payloads
- Cancelling flips `status` to `cancelled`, which drops the row from the partial index and frees the slot for a new active booking
- Cancelled history stays queryable by id; a later active booking on the same slot is independent

## Key decisions

- **Lean NestJS modules** (`slots`, `bookings`, `events`, `prisma`) with a simple vertical-slice layout
- **Response shapes match the exercise literally** (`{ slots }`, `{ booking }`, `{ error: { code, message } }`) — no extra envelope
- **Prisma + migrations** with a CHECK that `ends_at > starts_at`
- **Trim then validate** name/email via `class-transformer` + `class-validator`
- **Socket.IO gateway** emits only after successful writes
- **OpenAPI** via `@nestjs/swagger` at `/docs` and `/openapi.json`; Socket.IO documented here, not as HTTP ops

## Possible improvements (not implemented — out of scope)

- Auth / ownership checks on cancel
- Pagination / filtering of slots
- Durable event outbox for Socket.IO
- Rate limiting and observability
- Soft scheduling rules (past slots, buffers)
