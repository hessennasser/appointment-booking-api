import { Module } from '@nestjs/common';
import { BookingsModule } from './bookings/bookings.module';
import { EventsModule } from './events/events.module';
import { PrismaModule } from './prisma/prisma.module';
import { SlotsModule } from './slots/slots.module';

@Module({
  imports: [PrismaModule, EventsModule, SlotsModule, BookingsModule],
})
export class AppModule {}
