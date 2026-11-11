import { createHash, randomBytes, randomInt, timingSafeEqual } from 'crypto';
import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, Global, Injectable, Module, OnModuleDestroy, OnModuleInit, Post, ServiceUnavailableException, UnauthorizedException, UseGuards } from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Throttle } from '@nestjs/throttler';
import { IsEmail, IsIn, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { AuthGuard, AuthUser, CurrentUser } from './auth';
import { Mailer } from './mailer';

class LoginDto {
  @IsEmail() email: string;
  @IsString() @MinLength(1) password: string;
}

class ForgotDto {
  @IsEmail() email: string;
}

class ResetDto {
  @IsEmail() email: string;
  @IsString() @Matches(/^[0-9]{6}$/, { message: 'El codigo tiene 6 digitos' }) code: string;
  @IsString() @MinLength(8) @MaxLength(100) password: string;
}

const OTP_TTL_MS = 10 * 60_000;
const OTP_RESEND_MS = 60_000;
const OTP_MAX_ATTEMPTS = 5;
const otpHash = (code: string, userId: string) => createHash('sha256').update(`${code}:${userId}:${process.env.JWT_SECRET}`).digest('hex');

class RegisterDto {
  @IsString() @MinLength(2) @MaxLength(80) businessName: string;
  @IsString() @MinLength(2) @MaxLength(80) name: string;
  @IsEmail() email: string;
  @IsString() @MinLength(8) @MaxLength(100) password: string;
  @IsString() @Matches(/^\+?[0-9 ()-]{7,18}$/, { message: 'Numero de WhatsApp invalido' }) phone: string;
  @IsString() @MaxLength(80) plan: string;
}

const slugify = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'bar';

@Controller('auth')
class AuthController {
  constructor(private prisma: PrismaService, private jwt: JwtService, private mailer: Mailer) {}

  @Post('login')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async login(@Body() dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
      include: { business: true },
    });
    if (!user || !user.active || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('Credenciales invalidas');
    }
    if (user.business?.status === 'PENDING_PAYMENT') throw new ForbiddenException('PAGO_PENDIENTE');
    if (user.business?.status === 'PAYMENT_REVIEW') throw new ForbiddenException('PAGO_REVISION');
    if (user.business?.status === 'ACTIVE' && user.business.paidUntil && user.business.paidUntil < new Date()) {
      await this.prisma.business.update({ where: { id: user.business.id }, data: { status: 'SUSPENDED' } });
      throw new UnauthorizedException('Tu suscripcion vencio. Escribenos por WhatsApp para renovarla');
    }
    if (user.business && user.business.status !== 'ACTIVE') throw new UnauthorizedException('Establecimiento suspendido');
    const token = await this.jwt.signAsync({ sub: user.id });
    return {
      token,
      user: {
        id: user.id,
        name: user.name,
        role: user.role,
        businessId: user.businessId,
        businessName: user.business?.name ?? null,
      },
    };
  }

  /** Planes visibles en la landing y el registro. */
  @Get('plans')
  plans() {
    return this.prisma.plan.findMany({ where: { active: true }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] });
  }

  /** Autoregistro: crea el establecimiento (pendiente de pago) y su cuenta de administrador. */
  @Post('register')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async register(@Body() dto: RegisterDto) {
    const email = dto.email.toLowerCase();
    if (await this.prisma.user.findUnique({ where: { email } })) throw new ConflictException('Ese correo ya esta registrado');
    if (!(await this.prisma.plan.findFirst({ where: { id: dto.plan, active: true } }))) throw new BadRequestException('Plan no disponible');
    const business = await this.prisma.business.create({
      data: {
        name: dto.businessName.trim(),
        slug: `${slugify(dto.businessName)}-${randomBytes(2).toString('hex')}`,
        phone: dto.phone.trim(),
        plan: dto.plan,
        status: 'PENDING_PAYMENT',
        users: { create: { name: dto.name.trim(), email, passwordHash: await bcrypt.hash(dto.password, 10), role: 'ADMIN' } },
      },
      include: { users: true },
    });
    // No hay sesion hasta que se confirme el pago (el super admin activa el establecimiento)
    return { pendingPayment: true, businessName: business.name, plan: business.plan };
  }

  /** "Ya pague": pasa el establecimiento a revision (pide las credenciales para saber de cual se trata). */
  @Post('payment-sent')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async paymentSent(@Body() dto: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email.toLowerCase() } });
    if (!user?.businessId || !(await bcrypt.compare(dto.password, user.passwordHash))) throw new UnauthorizedException('Credenciales invalidas');
    await this.prisma.business.updateMany({ where: { id: user.businessId, status: 'PENDING_PAYMENT' }, data: { status: 'PAYMENT_REVIEW' } });
    return { ok: true };
  }

  /** Paso 1 de recuperar contrasena: envia un codigo de 6 digitos al correo (responde igual exista o no la cuenta). */
  @Post('forgot')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async forgot(@Body() dto: ForgotDto) {
    if (!this.mailer.configured && process.env.NODE_ENV === 'production') throw new ServiceUnavailableException('El envio de correos no esta configurado');
    const user = await this.prisma.user.findUnique({ where: { email: dto.email.toLowerCase() } });
    if (user && user.active) {
      const last = await this.prisma.passwordReset.findFirst({ where: { userId: user.id }, orderBy: { createdAt: 'desc' } });
      if (!last || Date.now() - last.createdAt.getTime() >= OTP_RESEND_MS) {
        const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
        await this.prisma.passwordReset.deleteMany({ where: { userId: user.id } });
        await this.prisma.passwordReset.create({ data: { userId: user.id, codeHash: otpHash(code, user.id), expiresAt: new Date(Date.now() + OTP_TTL_MS) } });
        const m = this.mailer.otpEmail(code);
        await this.mailer.send(user.email, m.subject, m.text, m.html).catch((e) => console.error('No se pudo enviar el codigo:', e?.message));
      }
    }
    return { ok: true };
  }

  /** Paso 2: valida el codigo y guarda la contrasena nueva. */
  @Post('reset')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async reset(@Body() dto: ResetDto) {
    // El motivo solo se escribe en la consola del servidor (nunca se le dice al cliente)
    const bad = (why: string) => { console.warn(`[reset] rechazado para ${dto.email}: ${why}`); return new BadRequestException('Codigo invalido o vencido'); };
    const user = await this.prisma.user.findUnique({ where: { email: dto.email.toLowerCase() } });
    if (!user || !user.active) throw bad('no existe una cuenta activa con ese correo');
    const r = await this.prisma.passwordReset.findFirst({ where: { userId: user.id, usedAt: null }, orderBy: { createdAt: 'desc' } });
    if (!r) throw bad('no hay un codigo pendiente (se pidio otro, ya se uso o se borro)');
    if (r.expiresAt < new Date()) throw bad('el codigo vencio');
    if (r.attempts >= OTP_MAX_ATTEMPTS) throw bad('demasiados intentos con este codigo');
    await this.prisma.passwordReset.update({ where: { id: r.id }, data: { attempts: { increment: 1 } } });
    const a = Buffer.from(otpHash(dto.code, user.id));
    const b = Buffer.from(r.codeHash);
    if (a.length !== b.length || !timingSafeEqual(a, b)) throw bad(`el codigo no coincide (intento ${r.attempts + 1} de ${OTP_MAX_ATTEMPTS})`);
    await this.prisma.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(dto.password, 10) } });
    await this.prisma.passwordReset.deleteMany({ where: { userId: user.id } });
    return { ok: true };
  }

  @Get('me')
  @UseGuards(AuthGuard)
  me(@CurrentUser() user: AuthUser) {
    return user;
  }
}

/** Suspende los establecimientos cuya suscripcion ya vencio. */
@Injectable()
class SubscriptionSweeper implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  constructor(private prisma: PrismaService) {}
  private sweep = () => this.prisma.business.updateMany({ where: { status: 'ACTIVE', paidUntil: { lt: new Date() } }, data: { status: 'SUSPENDED' } }).catch(() => undefined);
  onModuleInit() { this.sweep(); this.timer = setInterval(this.sweep, 60_000); }
  onModuleDestroy() { clearInterval(this.timer); }
}

@Global()
@Module({
  imports: [JwtModule.register({ secret: process.env.JWT_SECRET, signOptions: { expiresIn: '12h' } })],
  controllers: [AuthController],
  providers: [AuthGuard, SubscriptionSweeper, Mailer],
  exports: [AuthGuard, JwtModule],
})
export class AuthModule {}
