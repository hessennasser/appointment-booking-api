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
 */
@WebSocketGateway({
  namespace: '/',
  path: '/socket.io',
  cors: { origin: '*' },
})
export class EventsGateway {
  @WebSocketServer()
  server!: Server;

  emitSlotBooked(payload: SlotBookedPayload): void {
    this.server.emit('slot.booked', payload);
  }

  emitSlotReleased(payload: SlotReleasedPayload): void {
    this.server.emit('slot.released', payload);
  }
}
