import { Logger } from '@nestjs/common';
import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server } from 'socket.io';

export type SlotBookedPayload = {
  slotId: string;
  bookingId: string;
  available: false;
};

export type SlotReleasedPayload = {
  slotId: string;
  bookingId: string;
  available: true;
};

/**
 * Server-push only. Clients connect and listen; they do not need to emit app events.
 * Emit failures are logged and swallowed so a realtime glitch cannot fail an
 * already-committed booking/cancel HTTP response.
 */
@WebSocketGateway({
  namespace: '/',
  path: '/socket.io',
  cors: { origin: '*' },
})
export class EventsGateway {
  private readonly logger = new Logger(EventsGateway.name);

  @WebSocketServer()
  server!: Server;

  emitSlotBooked(payload: SlotBookedPayload): void {
    try {
      this.server.emit('slot.booked', payload);
    } catch (error: unknown) {
      this.logger.error('Failed to emit slot.booked', error);
    }
  }

  emitSlotReleased(payload: SlotReleasedPayload): void {
    try {
      this.server.emit('slot.released', payload);
    } catch (error: unknown) {
      this.logger.error('Failed to emit slot.released', error);
    }
  }
}
