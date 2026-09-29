import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SlotsService } from './slots.service';

@ApiTags('slots')
@Controller('slots')
export class SlotsController {
  constructor(private readonly slotsService: SlotsService) {}

  @Get()
  @ApiOperation({
    summary: 'List available slots',
    description:
      'Returns slots that do not currently have an active booking, ordered by startsAt then id. No authentication required.',
  })
  @ApiOkResponse({
    description: 'Available slots (may be an empty list).',
    schema: {
      example: {
        slots: [
          {
            id: '11111111-1111-4111-8111-111111111111',
            startsAt: '2030-01-15T09:00:00.000Z',
            endsAt: '2030-01-15T09:30:00.000Z',
          },
        ],
      },
    },
  })
  listAvailable() {
    return this.slotsService.listAvailable();
  }
}
