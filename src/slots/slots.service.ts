import { Injectable } from '@nestjs/common';
import { BookingStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SlotsService {
  constructor(private readonly prisma: PrismaService) {}

  async listAvailable() {
    const slots = await this.prisma.slot.findMany({
      where: {
        bookings: {
          none: { status: BookingStatus.active },
        },
      },
      orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        startsAt: true,
        endsAt: true,
      },
    });

    return {
      slots: slots.map((slot) => ({
        id: slot.id,
        startsAt: slot.startsAt.toISOString(),
        endsAt: slot.endsAt.toISOString(),
      })),
    };
  }
}
