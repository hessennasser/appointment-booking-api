import { Injectable, Logger } from '@nestjs/common';
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

/** Partial unique index from the init migration (one active booking per slot). */
const ACTIVE_SLOT_BOOKING_INDEX = 'bookings_one_active_per_slot_idx';

@Injectable()
export class BookingsService {
  private readonly logger = new Logger(BookingsService.name);

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
      if (this.isActiveSlotBookingConflict(error)) {
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

  /**
   * Maps only the "one active booking per slot" unique violation to 409.
   * Other P2002 targets (e.g. primary key) are left as unexpected errors.
   */
  private isActiveSlotBookingConflict(error: unknown): boolean {
    if (
      !(error instanceof Prisma.PrismaClientKnownRequestError) ||
      error.code !== 'P2002'
    ) {
      return false;
    }

    const meta = (error.meta ?? {}) as {
      target?: string | string[];
      constraint?: string;
      modelName?: string;
    };

    const targets = Array.isArray(meta.target)
      ? meta.target.map(String)
      : typeof meta.target === 'string'
        ? [meta.target]
        : [];

    const constraint =
      typeof meta.constraint === 'string' ? meta.constraint : '';

    const hints = [...targets, constraint];

    const matchesSlotConstraint = hints.some(
      (hint) =>
        hint === 'slotId' ||
        hint === 'slot_id' ||
        hint.includes(ACTIVE_SLOT_BOOKING_INDEX) ||
        hint.includes('one_active_per_slot'),
    );

    if (matchesSlotConstraint) {
      return true;
    }

    // Raw partial indexes are sometimes reported without field targets.
    // On Booking create the only business unique we rely on is that index.
    if (hints.length === 0 && meta.modelName === 'Booking') {
      this.logger.debug(
        'Treating P2002 with empty target as active-slot booking conflict',
      );
      return true;
    }

    return false;
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
