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

    const existing = await this.prisma.booking.findUnique({
      where: { id: bookingId },
    });

    if (!existing) {
      throw bookingNotFound();
    }

    // Idempotent: repeating cancel on an already-cancelled booking returns 200
    // with the same booking and does not emit another event.
    if (existing.status === BookingStatus.cancelled) {
      return { booking: this.toResponse(existing) };
    }

    const booking = await this.prisma.booking.update({
      where: { id: bookingId },
      data: { status: BookingStatus.cancelled },
    });

    this.events.emitSlotReleased({
      slotId: booking.slotId,
      bookingId: booking.id,
      available: true,
    });

    return { booking: this.toResponse(booking) };
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
