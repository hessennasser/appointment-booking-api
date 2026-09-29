import { Injectable } from '@nestjs/common';
import { Booking, BookingStatus, Prisma } from '@prisma/client';
import { isUUID } from 'class-validator';
import {
  bookingNotFound,
  slotNotFound,
  slotUnavailable,
  validationError,
} from '../common/errors/api.exception';
import { EventsGateway } from '../events/events.gateway';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBookingDto } from './dto/create-booking.dto';

@Injectable()
export class BookingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsGateway,
  ) {}

  async create(dto: CreateBookingDto) {
    const slot = await this.prisma.slot.findUnique({
      where: { id: dto.slotId },
      select: { id: true },
    });

    if (!slot) {
      throw slotNotFound();
    }

    let booking: Booking;
    try {
      // Rely on partial unique index (slot_id WHERE status=active) for races.
      booking = await this.prisma.booking.create({
        data: {
          slotId: dto.slotId,
          customerName: dto.customerName,
          customerEmail: dto.customerEmail,
          status: BookingStatus.active,
        },
      });
    } catch (error: unknown) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw slotUnavailable();
      }
      throw error;
    }

    this.events.emitSlotBooked({
      slotId: booking.slotId,
      bookingId: booking.id,
      available: false,
    });

    return { booking: this.toResponse(booking) };
  }

  async cancel(bookingId: string) {
    if (!isUUID(bookingId, '4')) {
      throw validationError('bookingId must be a valid UUID.');
    }

    // Atomic active → cancelled. Concurrent cancels: only one row is updated,
    // so only the winner emits slot.released.
    const updated = await this.prisma.booking.updateMany({
      where: {
        id: bookingId,
        status: BookingStatus.active,
      },
      data: { status: BookingStatus.cancelled },
    });

    if (updated.count === 1) {
      const booking = await this.prisma.booking.findUniqueOrThrow({
        where: { id: bookingId },
      });

      this.events.emitSlotReleased({
        slotId: booking.slotId,
        bookingId: booking.id,
        available: true,
      });

      return { booking: this.toResponse(booking) };
    }

    // No active row matched: either missing, or already cancelled (idempotent).
    const existing = await this.prisma.booking.findUnique({
      where: { id: bookingId },
    });

    if (!existing) {
      throw bookingNotFound();
    }

    return { booking: this.toResponse(existing) };
  }

  private toResponse(booking: Booking) {
    return {
      id: booking.id,
      slotId: booking.slotId,
      customerName: booking.customerName,
      customerEmail: booking.customerEmail,
      status: booking.status,
    };
  }
}
