import {
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface AuthUser {
  id: string;
  role: Role;
  businessId: string | null;
  name: string;
}

export const Roles = (...roles: Role[]) => SetMetadata('roles', roles);
export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): AuthUser => ctx.switchToHttp().getRequest().user,
);

/** Valida el JWT, recarga el usuario y comprueba rol y estado del establecimiento. */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private jwt: JwtService,
    private prisma: PrismaService,
    private reflector: Reflector,
  ) {}

  async canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest();
    const header: string = req.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) throw new UnauthorizedException('Falta el token');
    const user = await this.verify(token);
    req.user = user;
    const roles =
      this.reflector.get<Role[]>('roles', ctx.getHandler()) ?? this.reflector.get<Role[]>('roles', ctx.getClass());
    if (roles?.length && !roles.includes(user.role)) throw new ForbiddenException('Sin permisos');
    return true;
  }

  async verify(token: string): Promise<AuthUser> {
    let payload: { sub: string };
    try {
      payload = await this.jwt.verifyAsync(token);
    } catch {
      throw new UnauthorizedException('Token invalido');
    }
    const u = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: { business: { select: { status: true } } },
    });
    if (!u || !u.active) throw new UnauthorizedException('Usuario inactivo');
    if (u.business && u.business.status !== 'ACTIVE') throw new ForbiddenException('Establecimiento suspendido');
    return { id: u.id, role: u.role, businessId: u.businessId, name: u.name };
  }
}
