import 'dotenv/config';
import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import * as bcrypt from 'bcryptjs';
import { AppModule } from './app.module';
import { PrismaService } from './prisma/prisma.service';
import { MetricsService } from './stats/metrics.service';

async function seedSuperAdmin(prisma: PrismaService) {
  const email = process.env.SUPERADMIN_EMAIL?.toLowerCase();
  const password = process.env.SUPERADMIN_PASSWORD;
  if (!email || !password) return;
  if (await prisma.user.findFirst({ where: { role: 'SUPER_ADMIN' } })) return;
  await prisma.user.create({
    data: { name: 'Super Admin', email, passwordHash: await bcrypt.hash(password, 10), role: 'SUPER_ADMIN' },
  });
  new Logger('Seed').log(`Super admin creado: ${email}`);
}

async function bootstrap() {
  if (!process.env.JWT_SECRET) throw new Error('Falta JWT_SECRET');
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks(); // en cada redeploy (SIGTERM) cierra sockets y conexiones a la BD ordenadamente
  // Railway esta detras de un proxy: necesario para que el rate limit vea la IP real
  (app.getHttpAdapter().getInstance() as any).set('trust proxy', 1);
  app.enableCors({
    origin: (process.env.CORS_ORIGINS ?? 'http://localhost:5173').split(',').map((s) => s.trim()),
    credentials: true,
  });
  // Latencia y codigos HTTP de cada peticion (alimenta el panel tecnico del super admin)
  const metrics = app.get(MetricsService);
  app.use((req: any, res: any, next: () => void) => {
    const t = process.hrtime.bigint();
    res.on('finish', () => {
      if (req.path === '/health' || req.path === '/') return;
      metrics.recordRequest(Number(process.hrtime.bigint() - t) / 1e6, res.statusCode);
    });
    next();
  });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  // "/" y "/health" responden 200: sirven para monitores de uptime y health checks de la plataforma
  app.getHttpAdapter().get('/health', (_req: any, res: any) => res.json({ ok: true }));
  app.getHttpAdapter().get('/', (_req: any, res: any) => res.json({ ok: true, service: 'karaoke-api' }));
  await seedSuperAdmin(app.get(PrismaService));
  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port, '0.0.0.0');
  new Logger('Bootstrap').log(`API en puerto ${port}`);
}
bootstrap();
