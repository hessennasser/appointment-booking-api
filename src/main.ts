import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    // Keep Nest's default body parser so malformed JSON becomes a 400.
    rawBody: false,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());

  const openApiConfig = new DocumentBuilder()
    .setTitle('Appointment Booking API')
    .setDescription(
      [
        'Simple appointment booking API.',
        '',
        'No authentication is required.',
        '',
        'Real-time updates use Socket.IO on the same server',
        '(namespace `/`, path `/socket.io`).',
        'See the README for Socket.IO event documentation — those are not HTTP operations.',
      ].join('\n'),
    )
    .setVersion('1.0.0')
    .build();

  const document = SwaggerModule.createDocument(app, openApiConfig);
  SwaggerModule.setup('docs', app, document, {
    jsonDocumentUrl: 'openapi.json',
  });

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
}

void bootstrap();
