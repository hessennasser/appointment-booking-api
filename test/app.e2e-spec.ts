import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { BookingStatus, PrismaClient } from '@prisma/client';
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
 *   2. Create a dedicated test database:
 *      docker exec booking-pg psql -U booking -d booking_dev -c "CREATE DATABASE booking_test;"
 *   3. Apply migrations to the test DB:
 *      DATABASE_URL=postgresql://booking:booking@localhost:5432/booking_test?schema=public \
 *        npx prisma migrate deploy
 *
 * Run:
 *   DATABASE_URL=postgresql://booking:booking@localhost:5432/booking_test?schema=public \
 *     npm run test:e2e
 *
 * Each test truncates bookings/slots and re-seeds one known slot so runs are isolated.
 */

const SLOT_ID = '11111111-1111-4111-8111-111111111111';

describe('Appointment Booking API (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error(
        'DATABASE_URL must point at a PostgreSQL database for e2e tests.',
      );
    }

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
    await app.init();
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

    // Truly overlapping HTTP requests — not sequential and not a DB mock.
    const [first, second] = await Promise.all([
      request(app.getHttpServer()).post('/bookings').send(payloadA),
      request(app.getHttpServer()).post('/bookings').send(payloadB),
    ]);

    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual([201, 409]);

    const success = first.status === 201 ? first : second;
    const conflict = first.status === 409 ? first : second;

    expect(success.body.booking.status).toBe('active');
    expect(conflict.body.error.code).toBe('SLOT_UNAVAILABLE');

    const activeCount = await prisma.booking.count({
      where: { slotId: SLOT_ID, status: BookingStatus.active },
    });
    expect(activeCount).toBe(1);
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
});
