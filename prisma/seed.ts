import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Fixed slots for the exercise. IDs are stable so API examples stay readable.
 * endsAt is always after startsAt.
 */
const slots = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    startsAt: new Date('2030-01-15T09:00:00.000Z'),
    endsAt: new Date('2030-01-15T09:30:00.000Z'),
  },
  {
    id: '11111111-1111-4111-8111-111111111112',
    startsAt: new Date('2030-01-15T10:00:00.000Z'),
    endsAt: new Date('2030-01-15T10:30:00.000Z'),
  },
  {
    id: '11111111-1111-4111-8111-111111111113',
    startsAt: new Date('2030-01-15T11:00:00.000Z'),
    endsAt: new Date('2030-01-15T11:30:00.000Z'),
  },
  {
    id: '11111111-1111-4111-8111-111111111114',
    startsAt: new Date('2030-01-16T09:00:00.000Z'),
    endsAt: new Date('2030-01-16T09:30:00.000Z'),
  },
  {
    id: '11111111-1111-4111-8111-111111111115',
    startsAt: new Date('2030-01-16T14:00:00.000Z'),
    endsAt: new Date('2030-01-16T14:45:00.000Z'),
  },
];

async function main() {
  for (const slot of slots) {
    await prisma.slot.upsert({
      where: { id: slot.id },
      create: slot,
      update: {
        startsAt: slot.startsAt,
        endsAt: slot.endsAt,
      },
    });
  }

  console.log(`Seeded ${slots.length} slots.`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
