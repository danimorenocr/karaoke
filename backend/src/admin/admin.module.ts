import { Body, ConflictException, Controller, Delete, ForbiddenException, Get, Injectable, Module, NotFoundException, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ArrayMaxSize, IsArray, IsBoolean, IsEmail, IsHexColor, IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { AuthGuard, AuthUser, CurrentUser, Roles } from '../auth/auth';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.gateway';
import { allowedExperiences, EXPERIENCE_IDS } from '../experiences';

const newToken = () => randomBytes(9).toString('base64url');
const slugify = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'bar';

class CreateBusinessDto {
  @IsString() @MinLength(2) @MaxLength(80) name: string;
  @IsString() @MinLength(2) adminName: string;
  @IsEmail() adminEmail: string;
  @IsString() @MinLength(8) adminPassword: string;
}
class ProviderDto {
  @IsIn(['YOUTUBE', 'GOOGLE']) provider: 'YOUTUBE' | 'GOOGLE';
}
class ExperiencesDto {
  @IsArray() @IsIn([...EXPERIENCE_IDS], { each: true }) ids: string[];
}
class PaymentDto {
  // Dias de acceso a sumar; 0 = sin vencimiento
  @IsInt() @Min(0) @Max(3650) days: number;
  // Valor recibido en COP; si no se envia se usa el precio mensual del plan
  @IsOptional() @IsInt() @Min(0) @Max(100_000_000) amount?: number;
}
class StatusDto {
  @IsBoolean() active: boolean;
}
class UpdateBusinessDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(80) name?: string;
  @IsOptional() @IsString() @MaxLength(1_500_000) @Matches(/^data:image\/(png|jpe?g|webp);base64,/) logoUrl?: string | null;
  @IsOptional() @IsHexColor() primaryColor?: string;
  // Imagen (data URL) o null para quitarla
  @IsOptional() @IsString() @MaxLength(3_000_000) @Matches(/^data:image\/(png|jpe?g|webp);base64,/) tvBanner?: string | null;
  @IsOptional() @IsInt() @Min(0) @Max(60) tvInterludeSec?: number;
  @IsOptional() @IsInt() @Min(1) @Max(20) maxPendingPerTable?: number;
  @IsOptional() @IsBoolean() autoApprove?: boolean;
  @IsOptional() @IsIn(['KARAOKE', 'ANY']) searchMode?: 'KARAOKE' | 'ANY';
}
class TableDto {
  @IsString() @MinLength(1) @MaxLength(40) name: string;
}
class BulkTablesDto {
  // Las mesas se llaman "<prefijo> <numero>", desde `from` y `count` seguidas
  @IsString() @MinLength(1) @MaxLength(30) prefix: string;
  @IsInt() @Min(0) @Max(9999) from: number;
  @IsInt() @Min(1) @Max(100) count: number;
}
class DeleteTablesDto {
  @IsArray() @IsString({ each: true }) @ArrayMaxSize(500) ids: string[];
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
class UpdateEmailDto {
  @IsEmail() email: string;
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

  async setBusinessStatus(id: string, active: boolean) {
    // Al reactivar a mano un negocio vencido se quita el vencimiento (si no, se suspenderia de nuevo)
    if (active) await this.prisma.business.updateMany({ where: { id, paidUntil: { lt: new Date() } }, data: { paidUntil: null } });
    return this.prisma.business.update({ where: { id }, data: { status: active ? 'ACTIVE' : 'SUSPENDED' } });
  }

  /** Registra un pago: activa el establecimiento y le da `days` dias mas (se suman a lo que le quede). 0 = sin vencimiento. */
  async registerPayment(id: string, days: number, amount?: number) {
    const b = await this.prisma.business.findUniqueOrThrow({ where: { id }, select: { paidUntil: true, plan: true } });
    const now = new Date();
    const from = b.paidUntil && b.paidUntil > now ? b.paidUntil : now;
    const paidUntil = days === 0 ? null : new Date(from.getTime() + days * 86_400_000);
    const price = b.plan === 'CUSTOM' ? 49900 : 39900;
    const [business] = await this.prisma.$transaction([
      this.prisma.business.update({ where: { id }, data: { status: 'ACTIVE', paidUntil } }),
      this.prisma.payment.create({ data: { businessId: id, plan: b.plan, amount: amount ?? price, days, paidUntil } }),
    ]);
    return business;
  }

  listPayments() {
    return this.prisma.payment.findMany({ orderBy: { createdAt: 'desc' }, take: 500, include: { business: { select: { name: true } } } });
  }

  /** Borra el establecimiento y, en cascada, usuarios, mesas, sesiones, pedidos, eventos y pagos. */
  async deleteBusiness(id: string) {
    const b = await this.prisma.business.findUnique({ where: { id }, select: { id: true } });
    if (!b) throw new NotFoundException('Establecimiento no encontrado');
    await this.prisma.business.delete({ where: { id } });
    return { ok: true };
  }

  setSearchProvider(id: string, provider: 'YOUTUBE' | 'GOOGLE') {
    return this.prisma.business.update({ where: { id }, data: { searchProvider: provider } });
  }

  /** El super admin elige que disenos puede usar un establecimiento. */
  async setExperiences(id: string, ids: string[]) {
    const allowed = allowedExperiences(ids.length ? ids : ['classic']);
    // Si estan todos se guarda vacio (= todos, incluidos los que se agreguen despues)
    const stored = allowed.length === EXPERIENCE_IDS.length ? [] : allowed;
    const b = await this.prisma.business.update({ where: { id }, data: { allowedExperiences: stored } });
    // Las mesas que usaban un diseno retirado vuelven al clasico
    await this.prisma.table.updateMany({ where: { businessId: id, experienceId: { notIn: allowed } }, data: { experienceId: 'classic' } });
    this.rt.queueUpdated(id);
    return b;
  }

  listUsers(businessId: string) {
    return this.prisma.user.findMany({
      where: { businessId },
      select: { id: true, name: true, email: true, role: true, active: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  /** Cambia el correo de acceso de una cuenta. Contrasena, establecimiento, mesas y QR quedan igual; la sesion sigue activa. */
  async updateUserEmail(id: string, email: string) {
    const normalized = email.toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('Cuenta no encontrada');
    if (normalized !== user.email && (await this.prisma.user.findUnique({ where: { email: normalized } }))) {
      throw new ConflictException('Ese correo ya esta registrado');
    }
    const u = await this.prisma.user.update({ where: { id }, data: { email: normalized } });
    return { id: u.id, name: u.name, email: u.email, role: u.role, active: u.active };
  }

  // Toda consulta de abajo filtra por businessId (viene del JWT, nunca del cliente).
  getBusiness(businessId: string) {
    return this.prisma.business.findUniqueOrThrow({ where: { id: businessId } });
  }

  updateBusiness(businessId: string, dto: UpdateBusinessDto) {
    const data: any = { ...dto };
    if ('logoUrl' in dto) data.logoAt = dto.logoUrl ? new Date() : null;
    if ('tvBanner' in dto) data.tvBannerAt = dto.tvBanner ? new Date() : null;
    return this.prisma.business.update({ where: { id: businessId }, data });
  }

  listTables(businessId: string) {
    return this.prisma.table.findMany({ where: { businessId }, orderBy: { createdAt: 'asc' } });
  }

  createTable(businessId: string, dto: TableDto) {
    return this.prisma.table.create({ data: { businessId, name: dto.name, qrToken: newToken() } });
  }

  /** Crea varias mesas de una vez; omite las que ya existen con el mismo nombre. */
  async createTablesBulk(businessId: string, dto: BulkTablesDto) {
    const prefix = dto.prefix.trim();
    const names = Array.from({ length: dto.count }, (_, i) => `${prefix} ${dto.from + i}`.slice(0, 40));
    const existing = new Set((await this.prisma.table.findMany({ where: { businessId }, select: { name: true } })).map((t) => t.name.toLowerCase()));
    const fresh = names.filter((n) => !existing.has(n.toLowerCase()));
    if (existing.size + fresh.length > 500) throw new ConflictException('Un establecimiento puede tener hasta 500 mesas');
    if (fresh.length) await this.prisma.table.createMany({ data: fresh.map((name) => ({ businessId, name, qrToken: newToken() })) });
    return { created: fresh.length, skipped: names.length - fresh.length };
  }

  /** Borra mesas del establecimiento; sus pedidos se borran en cascada y sus QR dejan de funcionar. */
  async deleteTables(businessId: string, ids: string[]) {
    const r = await this.prisma.table.deleteMany({ where: { businessId, id: { in: ids } } });
    this.rt.queueUpdated(businessId);
    return { deleted: r.count };
  }

  private async ownedTable(businessId: string, id: string) {
    const t = await this.prisma.table.findFirst({ where: { id, businessId } });
    if (!t) throw new NotFoundException('Mesa no encontrada');
    return t;
  }

  async updateTable(businessId: string, id: string, dto: UpdateTableDto) {
    await this.ownedTable(businessId, id);
    if (dto.experienceId) {
      const biz = await this.prisma.business.findUniqueOrThrow({ where: { id: businessId }, select: { allowedExperiences: true } });
      if (!allowedExperiences(biz.allowedExperiences).includes(dto.experienceId)) throw new ForbiddenException('Ese diseno no esta habilitado para tu establecimiento');
    }
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
  @Get('businesses/:id/users') users(@Param('id') id: string) { return this.s.listUsers(id); }
  @Patch('users/:id/email') email(@Param('id') id: string, @Body() b: UpdateEmailDto) { return this.s.updateUserEmail(id, b.email); }
  @Post('businesses') create(@Body() dto: CreateBusinessDto) { return this.s.createBusiness(dto); }
  @Patch('businesses/:id/search-provider') provider(@Param('id') id: string, @Body() b: ProviderDto) { return this.s.setSearchProvider(id, b.provider); }
  @Patch('businesses/:id/experiences') experiences(@Param('id') id: string, @Body() b: ExperiencesDto) { return this.s.setExperiences(id, b.ids); }
  @Patch('businesses/:id/payment') payment(@Param('id') id: string, @Body() b: PaymentDto) { return this.s.registerPayment(id, b.days, b.amount); }
  @Get('payments') payments() { return this.s.listPayments(); }
  @Delete('businesses/:id') remove(@Param('id') id: string) { return this.s.deleteBusiness(id); }
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
  @Post('tables/delete') removeTables(@CurrentUser() u: AuthUser, @Body() dto: DeleteTablesDto) { return this.s.deleteTables(u.businessId!, dto.ids); }
  @Post('tables/bulk') addTablesBulk(@CurrentUser() u: AuthUser, @Body() dto: BulkTablesDto) { return this.s.createTablesBulk(u.businessId!, dto); }
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
