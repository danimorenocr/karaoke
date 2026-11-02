import { Body, ConflictException, Controller, Get, Injectable, Module, NotFoundException, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { IsBoolean, IsEmail, IsHexColor, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { AuthGuard, AuthUser, CurrentUser, Roles } from '../auth/auth';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.gateway';
import { EXPERIENCE_IDS } from '../experiences';

const newToken = () => randomBytes(9).toString('base64url');
const slugify = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'bar';

class CreateBusinessDto {
  @IsString() @MinLength(2) @MaxLength(80) name: string;
  @IsString() @MinLength(2) adminName: string;
  @IsEmail() adminEmail: string;
  @IsString() @MinLength(8) adminPassword: string;
}
class StatusDto {
  @IsBoolean() active: boolean;
}
class UpdateBusinessDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(80) name?: string;
  @IsOptional() @IsString() @MaxLength(500) logoUrl?: string;
  @IsOptional() @IsHexColor() primaryColor?: string;
  @IsOptional() @IsInt() @Min(1) @Max(20) maxPendingPerTable?: number;
  @IsOptional() @IsBoolean() autoApprove?: boolean;
  @IsOptional() @IsIn(['KARAOKE', 'ANY']) searchMode?: 'KARAOKE' | 'ANY';
}
class TableDto {
  @IsString() @MinLength(1) @MaxLength(40) name: string;
}
class UpdateTableDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(40) name?: string;
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @IsIn([...EXPERIENCE_IDS]) experienceId?: string;
}
class CreateStaffDto {
  @IsString() @MinLength(2) name: string;
  @IsEmail() email: string;
  @IsString() @MinLength(8) password: string;
}

@Injectable()
class AdminService {
  constructor(private prisma: PrismaService, private rt: RealtimeService) {}

  async createBusiness(dto: CreateBusinessDto) {
    const email = dto.adminEmail.toLowerCase();
    if (await this.prisma.user.findUnique({ where: { email } })) throw new ConflictException('Ese correo ya esta registrado');
    return this.prisma.business.create({
      data: {
        name: dto.name,
        slug: `${slugify(dto.name)}-${randomBytes(2).toString('hex')}`,
        users: { create: { name: dto.adminName, email, passwordHash: await bcrypt.hash(dto.adminPassword, 10), role: 'ADMIN' } },
      },
    });
  }

  listBusinesses() {
    return this.prisma.business.findMany({
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { tables: true, users: true, requests: true } } },
    });
  }

  setBusinessStatus(id: string, active: boolean) {
    return this.prisma.business.update({ where: { id }, data: { status: active ? 'ACTIVE' : 'SUSPENDED' } });
  }

  // Toda consulta de abajo filtra por businessId (viene del JWT, nunca del cliente).
  getBusiness(businessId: string) {
    return this.prisma.business.findUniqueOrThrow({ where: { id: businessId } });
  }

  updateBusiness(businessId: string, dto: UpdateBusinessDto) {
    return this.prisma.business.update({ where: { id: businessId }, data: dto });
  }

  listTables(businessId: string) {
    return this.prisma.table.findMany({ where: { businessId }, orderBy: { createdAt: 'asc' } });
  }

  createTable(businessId: string, dto: TableDto) {
    return this.prisma.table.create({ data: { businessId, name: dto.name, qrToken: newToken() } });
  }

  private async ownedTable(businessId: string, id: string) {
    const t = await this.prisma.table.findFirst({ where: { id, businessId } });
    if (!t) throw new NotFoundException('Mesa no encontrada');
    return t;
  }

  async updateTable(businessId: string, id: string, dto: UpdateTableDto) {
    await this.ownedTable(businessId, id);
    const t = await this.prisma.table.update({ where: { id }, data: dto });
    this.rt.queueUpdated(businessId);
    return t;
  }

  /** Revoca el QR anterior (deja de funcionar) y genera uno nuevo. */
  async rotateQr(businessId: string, id: string) {
    await this.ownedTable(businessId, id);
    return this.prisma.table.update({ where: { id }, data: { qrToken: newToken() } });
  }

  listStaff(businessId: string) {
    return this.prisma.user.findMany({
      where: { businessId },
      select: { id: true, name: true, email: true, role: true, active: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  async createDj(businessId: string, dto: CreateStaffDto) {
    const email = dto.email.toLowerCase();
    if (await this.prisma.user.findUnique({ where: { email } })) throw new ConflictException('Ese correo ya esta registrado');
    const u = await this.prisma.user.create({
      data: { businessId, name: dto.name, email, passwordHash: await bcrypt.hash(dto.password, 10), role: 'DJ' },
    });
    return { id: u.id, name: u.name, email: u.email, role: u.role, active: u.active };
  }

  async setStaffActive(businessId: string, id: string, active: boolean) {
    const u = await this.prisma.user.findFirst({ where: { id, businessId, role: 'DJ' } });
    if (!u) throw new NotFoundException('Usuario no encontrado');
    await this.prisma.user.update({ where: { id }, data: { active } });
    return { ok: true };
  }

  history(businessId: string) {
    return this.prisma.songRequest.findMany({
      where: { businessId },
      orderBy: { requestedAt: 'desc' },
      take: 200,
      select: { id: true, title: true, status: true, requestedAt: true, rejectionReason: true, table: { select: { name: true } } },
    });
  }
}

@Controller('super')
@UseGuards(AuthGuard)
@Roles('SUPER_ADMIN')
class SuperController {
  constructor(private s: AdminService) {}
  @Get('businesses') list() { return this.s.listBusinesses(); }
  @Post('businesses') create(@Body() dto: CreateBusinessDto) { return this.s.createBusiness(dto); }
  @Patch('businesses/:id/status') status(@Param('id') id: string, @Body() b: StatusDto) { return this.s.setBusinessStatus(id, b.active); }
}

@Controller('admin')
@UseGuards(AuthGuard)
@Roles('ADMIN')
class AdminController {
  constructor(private s: AdminService) {}
  @Get('business') business(@CurrentUser() u: AuthUser) { return this.s.getBusiness(u.businessId!); }
  @Patch('business') update(@CurrentUser() u: AuthUser, @Body() dto: UpdateBusinessDto) { return this.s.updateBusiness(u.businessId!, dto); }
  @Get('tables') tables(@CurrentUser() u: AuthUser) { return this.s.listTables(u.businessId!); }
  @Post('tables') addTable(@CurrentUser() u: AuthUser, @Body() dto: TableDto) { return this.s.createTable(u.businessId!, dto); }
  @Patch('tables/:id') editTable(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: UpdateTableDto) { return this.s.updateTable(u.businessId!, id, dto); }
  @Post('tables/:id/rotate-qr') rotate(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.s.rotateQr(u.businessId!, id); }
  @Get('staff') staff(@CurrentUser() u: AuthUser) { return this.s.listStaff(u.businessId!); }
  @Post('staff') addDj(@CurrentUser() u: AuthUser, @Body() dto: CreateStaffDto) { return this.s.createDj(u.businessId!, dto); }
  @Patch('staff/:id/active') staffActive(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() b: StatusDto) { return this.s.setStaffActive(u.businessId!, id, b.active); }
  @Get('history') history(@CurrentUser() u: AuthUser) { return this.s.history(u.businessId!); }
}

@Module({ controllers: [SuperController, AdminController], providers: [AdminService] })
export class AdminModule {}
