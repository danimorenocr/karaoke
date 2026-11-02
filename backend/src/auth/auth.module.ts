import { randomBytes } from 'crypto';
import { Body, ConflictException, Controller, Get, Global, Module, Post, UnauthorizedException, UseGuards } from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Throttle } from '@nestjs/throttler';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { AuthGuard, AuthUser, CurrentUser } from './auth';

class LoginDto {
  @IsEmail() email: string;
  @IsString() @MinLength(1) password: string;
}

class RegisterDto {
  @IsString() @MinLength(2) @MaxLength(80) businessName: string;
  @IsString() @MinLength(2) @MaxLength(80) name: string;
  @IsEmail() email: string;
  @IsString() @MinLength(8) @MaxLength(100) password: string;
}

const slugify = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'bar';

@Controller('auth')
class AuthController {
  constructor(private prisma: PrismaService, private jwt: JwtService) {}

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

  /** Autoregistro: crea el establecimiento y su cuenta de administrador, y deja la sesion iniciada. */
  @Post('register')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async register(@Body() dto: RegisterDto) {
    const email = dto.email.toLowerCase();
    if (await this.prisma.user.findUnique({ where: { email } })) throw new ConflictException('Ese correo ya esta registrado');
    const business = await this.prisma.business.create({
      data: {
        name: dto.businessName.trim(),
        slug: `${slugify(dto.businessName)}-${randomBytes(2).toString('hex')}`,
        users: { create: { name: dto.name.trim(), email, passwordHash: await bcrypt.hash(dto.password, 10), role: 'ADMIN' } },
      },
      include: { users: true },
    });
    const user = business.users[0];
    return {
      token: await this.jwt.signAsync({ sub: user.id }),
      user: { id: user.id, name: user.name, role: user.role, businessId: business.id, businessName: business.name },
    };
  }

  @Get('me')
  @UseGuards(AuthGuard)
  me(@CurrentUser() user: AuthUser) {
    return user;
  }
}

@Global()
@Module({
  imports: [JwtModule.register({ secret: process.env.JWT_SECRET, signOptions: { expiresIn: '12h' } })],
  controllers: [AuthController],
  providers: [AuthGuard],
  exports: [AuthGuard, JwtModule],
})
export class AuthModule {}
