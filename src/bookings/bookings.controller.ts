import {
  Body,
  Controller,
  Delete,
  HttpCode,
  Param,
  Post,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiInternalServerErrorResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { BookingsService } from './bookings.service';
import { CreateBookingDto } from './dto/create-booking.dto';

const errorSchema = (code: string, message: string) => ({
  example: { error: { code, message } },
});

@ApiTags('bookings')
@Controller('bookings')
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  @Post()
  @HttpCode(201)
  @ApiOperation({
    summary: 'Create a booking',
    description:
      'Creates an active booking for an available slot. Customer name and email are trimmed before validation. Concurrent requests for the same free slot yield one 201 and one 409. No authentication required.',
  })
  @ApiCreatedResponse({
    description: 'Booking created.',
    schema: {
      example: {
        booking: {
          id: '22222222-2222-4222-8222-222222222222',
          slotId: '11111111-1111-4111-8111-111111111111',
          customerName: 'Alex Morgan',
          customerEmail: 'alex@example.com',
          status: 'active',
        },
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'Missing/invalid fields or malformed JSON.',
    schema: errorSchema(
      'VALIDATION_ERROR',
      'customerEmail must be a valid email address',
    ),
  })
  @ApiNotFoundResponse({
    description: 'Valid UUID that does not match any slot.',
    schema: errorSchema('SLOT_NOT_FOUND', 'No slot exists with the given id.'),
  })
  @ApiConflictResponse({
    description: 'Slot already has an active booking.',
    schema: errorSchema(
      'SLOT_UNAVAILABLE',
      'This slot already has an active booking.',
    ),
  })
  @ApiInternalServerErrorResponse({
    description: 'Unexpected failure.',
    schema: errorSchema('INTERNAL_ERROR', 'An unexpected error occurred.'),
  })
  create(@Body() dto: CreateBookingDto) {
    return this.bookingsService.create(dto);
  }

  @Delete(':bookingId')
  @ApiOperation({
    summary: 'Cancel a booking',
    description:
      'Cancels an active booking and releases the slot. Cancelling an already-cancelled booking returns 200 with the same booking and does not emit another Socket.IO event. Does not affect a newer active booking on the same slot. No authentication required.',
  })
  @ApiParam({
    name: 'bookingId',
    format: 'uuid',
    example: '22222222-2222-4222-8222-222222222222',
  })
  @ApiOkResponse({
    description: 'Booking cancelled (or already cancelled).',
    schema: {
      example: {
        booking: {
          id: '22222222-2222-4222-8222-222222222222',
          slotId: '11111111-1111-4111-8111-111111111111',
          customerName: 'Alex Morgan',
          customerEmail: 'alex@example.com',
          status: 'cancelled',
        },
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'bookingId is not a valid UUID.',
    schema: errorSchema(
      'VALIDATION_ERROR',
      'bookingId must be a valid UUID.',
    ),
  })
  @ApiNotFoundResponse({
    description: 'Valid UUID that does not match any booking.',
    schema: errorSchema(
      'BOOKING_NOT_FOUND',
      'No booking exists with the given id.',
    ),
  })
  @ApiInternalServerErrorResponse({
    description: 'Unexpected failure.',
    schema: errorSchema('INTERNAL_ERROR', 'An unexpected error occurred.'),
  })
  cancel(@Param('bookingId') bookingId: string) {
    return this.bookingsService.cancel(bookingId);
  }
}
