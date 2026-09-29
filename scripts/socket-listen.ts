/**
 * Headless Socket.IO listener for manual verification (no frontend).
 *
 * Usage (with the API already running on PORT, default 3000):
 *   npm run socket:listen
 *
 * Then in another terminal:
 *   curl -s http://localhost:3000/slots
 *   curl -s -X POST http://localhost:3000/bookings \
 *     -H 'Content-Type: application/json' \
 *     -d '{"slotId":"11111111-1111-4111-8111-111111111111","customerName":"Alex Morgan","customerEmail":"alex@example.com"}'
 *   curl -s -X DELETE http://localhost:3000/bookings/<bookingId>
 */
import { io } from 'socket.io-client';

const url = process.env.SOCKET_URL ?? 'http://localhost:3000';

const socket = io(url, {
  path: '/socket.io',
  transports: ['websocket'],
});

socket.on('connect', () => {
  console.log(`[socket] connected id=${socket.id} url=${url}`);
});

socket.on('disconnect', (reason) => {
  console.log(`[socket] disconnected reason=${reason}`);
});

socket.on('connect_error', (err) => {
  console.error(`[socket] connect_error: ${err.message}`);
});

socket.on('slot.booked', (payload) => {
  console.log('[socket] slot.booked', JSON.stringify(payload));
});

socket.on('slot.released', (payload) => {
  console.log('[socket] slot.released', JSON.stringify(payload));
});

console.log(`[socket] listening on ${url} (Ctrl+C to exit)`);
