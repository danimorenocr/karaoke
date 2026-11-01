import { Body, Controller, Get, Global, Module, Post, UnauthorizedException, UseGuards } from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Throttle } from '@nestjs/throttler';
import { IsEmail, IsString, MinLength } from 'class-validator';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { AuthGuard, AuthUser, CurrentUser } from './auth';

class LoginDto {
  @IsEmail() email: string;
  @IsString() @MinLength(1) password: string;
}

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
