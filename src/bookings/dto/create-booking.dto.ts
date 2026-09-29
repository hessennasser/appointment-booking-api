import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

function trimString({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class CreateBookingDto {
  @ApiProperty({
    format: 'uuid',
    example: '11111111-1111-4111-8111-111111111111',
  })
  @Transform(trimString)
  @IsUUID('4')
  slotId!: string;

  @ApiProperty({ example: 'Alex Morgan' })
  @Transform(trimString)
  @IsNotEmpty({ message: 'customerName must not be empty' })
  customerName!: string;

  @ApiProperty({ example: 'alex@example.com' })
  @Transform(trimString)
  @IsEmail({}, { message: 'customerEmail must be a valid email address' })
  customerEmail!: string;
}
