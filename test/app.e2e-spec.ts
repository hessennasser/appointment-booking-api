import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { BookingStatus, PrismaClient } from '@prisma/client';
import { AddressInfo } from 'net';
import { io, Socket } from 'socket.io-client';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';

/**
 * E2E tests hit a real PostgreSQL database.
 *
 * Setup (once):
 *   1. Start Postgres (example):
 *      docker run -d --name booking-pg \
 *        -e POSTGRES_USER=booking -e POSTGRES_PASSWORD=booking \
 *        -e POSTGRES_DB=booking_dev -p 5432:5432 postgres:16-alpine
 *   2. Create a dedicated test database named booking_test:
 *      docker exec booking-pg psql -U booking -d booking_dev -c "CREATE DATABASE booking_test;"
 *   3. Apply migrations to the test DB:
 *      DATABASE_URL=postgresql://booking:booking@localhost:5432/booking_test?schema=public \
 *        npx prisma migrate deploy
 *
 * Run:
 *   DATABASE_URL=postgresql://booking:booking@localhost:5432/booking_test?schema=public \
 *     npm run test:e2e
 *
 * Destructive cleanup only runs when the database name is exactly booking_test.
 */

const SLOT_ID = '11111111-1111-4111-8111-111111111111';
const EXPECTED_TEST_DB = 'booking_test';

function assertTestDatabaseUrl(databaseUrl: string): void {
  let dbName: string;
  try {
    dbName = new URL(databaseUrl).pathname.replace(/^\//, '').split('?')[0];
  } catch {
    throw new Error(`Invalid DATABASE_URL: ${databaseUrl}`);
  }

  if (dbName !== EXPECTED_TEST_DB) {
    throw new Error(
      `Refusing to run destructive e2e tests against database "${dbName}". ` +
        `Expected "${EXPECTED_TEST_DB}".`,
    );
  }
}

function waitForEvent<T>(
  socket: Socket,
  event: string,
  timeoutMs = 3000,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timed out waiting for socket event "${event}"`));
    }, timeoutMs);

    socket.once(event, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

describe('Appointment Booking API (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let baseUrl: string;

  beforeAll(async () => {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error(
        'DATABASE_URL must point at a PostgreSQL test database.',
      );
    }
    assertTestDatabaseUrl(databaseUrl);

    prisma = new PrismaClient();
    await prisma.$connect();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.listen(0);

    const address = app.getHttpServer().address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  beforeEach(async () => {
    await prisma.booking.deleteMany();
    await prisma.slot.deleteMany();
    await prisma.slot.create({
      data: {
        id: SLOT_ID,
        startsAt: new Date('2030-01-15T09:00:00.000Z'),
        endsAt: new Date('2030-01-15T09:30:00.000Z'),
      },
    });
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('books a slot with 201 and removes it from available slots', async () => {
    const create = await request(app.getHttpServer())
      .post('/bookings')
      .send({
        slotId: SLOT_ID,
        customerName: '  Alex Morgan  ',
        customerEmail: '  alex@example.com  ',
      })
      .expect(201);

    expect(create.body.booking).toMatchObject({
      slotId: SLOT_ID,
      customerName: 'Alex Morgan',
      customerEmail: 'alex@example.com',
      status: 'active',
    });
    expect(create.body.booking.id).toEqual(expect.any(String));

    const slots = await request(app.getHttpServer()).get('/slots').expect(200);
    expect(slots.body).toEqual({ slots: [] });
  });

  it('handles two concurrent bookings for the same slot as 201 and 409 with one active row', async () => {
    const payloadA = {
      slotId: SLOT_ID,
      customerName: 'Alex Morgan',
      customerEmail: 'alex@example.com',
    };
    const payloadB = {
      slotId: SLOT_ID,
      customerName: 'Jamie Lee',
      customerEmail: 'jamie@example.com',
    };

    // Fire both HTTP requests concurrently against the real application/database.
    const [first, second] = await Promise.all([
      request(app.getHttpServer()).post('/bookings').send(payloadA),
      request(app.getHttpServer()).post('/bookings').send(payloadB),
    ]);

    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual([201, 409]);

    const success = first.status === 201 ? first : second;
    const conflict = first.status === 409 ? first : second;

    expect(success.body.booking.status).toBe('active');
    expect(conflict.body).toMatchObject({
      error: {
        code: 'SLOT_UNAVAILABLE',
        message: expect.any(String),
      },
    });

    const [activeCount, totalCount] = await Promise.all([
      prisma.booking.count({
        where: { slotId: SLOT_ID, status: BookingStatus.active },
      }),
      prisma.booking.count({
        where: { slotId: SLOT_ID },
      }),
    ]);

    expect(activeCount).toBe(1);
    expect(totalCount).toBe(1);
  });

  it('cancel returns 200, frees the slot, and allows a new booking', async () => {
    const created = await request(app.getHttpServer())
      .post('/bookings')
      .send({
        slotId: SLOT_ID,
        customerName: 'Alex Morgan',
        customerEmail: 'alex@example.com',
      })
      .expect(201);

    const bookingId = created.body.booking.id as string;

    const cancelled = await request(app.getHttpServer())
      .delete(`/bookings/${bookingId}`)
      .expect(200);

    expect(cancelled.body.booking.status).toBe('cancelled');

    const slots = await request(app.getHttpServer()).get('/slots').expect(200);
    expect(slots.body.slots).toHaveLength(1);
    expect(slots.body.slots[0].id).toBe(SLOT_ID);

    const again = await request(app.getHttpServer())
      .post('/bookings')
      .send({
        slotId: SLOT_ID,
        customerName: 'Jamie Lee',
        customerEmail: 'jamie@example.com',
      })
      .expect(201);

    expect(again.body.booking.status).toBe('active');
    expect(again.body.booking.id).not.toBe(bookingId);
  });

  it('treats repeated cancellation as idempotent', async () => {
    const created = await request(app.getHttpServer())
      .post('/bookings')
      .send({
        slotId: SLOT_ID,
        customerName: 'Alex Morgan',
        customerEmail: 'alex@example.com',
      })
      .expect(201);

    const bookingId = created.body.booking.id as string;

    await request(app.getHttpServer())
      .delete(`/bookings/${bookingId}`)
      .expect(200);

    const repeated = await request(app.getHttpServer())
      .delete(`/bookings/${bookingId}`)
      .expect(200);

    expect(repeated.body.booking).toMatchObject({
      id: bookingId,
      status: 'cancelled',
    });
  });

  it('emits slot.booked and slot.released once for a successful book/cancel cycle', async () => {
    const socket = io(baseUrl, {
      path: '/socket.io',
      transports: ['websocket'],
      forceNew: true,
    });

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('Socket connect timed out')),
        3000,
      );
      socket.on('connect', () => {
        clearTimeout(timer);
        resolve();
      });
      socket.on('connect_error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });

    const bookedPromise = waitForEvent<{
      slotId: string;
      bookingId: string;
      available: boolean;
    }>(socket, 'slot.booked');

    const created = await request(app.getHttpServer())
      .post('/bookings')
      .send({
        slotId: SLOT_ID,
        customerName: 'Alex Morgan',
        customerEmail: 'alex@example.com',
      })
      .expect(201);

    const bookingId = created.body.booking.id as string;
    const booked = await bookedPromise;

    expect(booked).toEqual({
      slotId: SLOT_ID,
      bookingId,
      available: false,
    });

    const releasedPromise = waitForEvent<{
      slotId: string;
      bookingId: string;
      available: boolean;
    }>(socket, 'slot.released');

    await request(app.getHttpServer())
      .delete(`/bookings/${bookingId}`)
      .expect(200);

    const released = await releasedPromise;
    expect(released).toEqual({
      slotId: SLOT_ID,
      bookingId,
      available: true,
    });

    socket.disconnect();
  });
});
