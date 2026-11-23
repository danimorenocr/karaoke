# Graph Report - Karaoke  (2026-11-23)

## Corpus Check
- 109 files · ~62,090 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 17 file(s) not represented in the graph (top: .css 6, (none) 4, .example 2)

## Summary
- 987 nodes · 2403 edges · 51 communities (37 shown, 14 thin omitted)
- Extraction: 94% EXTRACTED · 6% INFERRED · 0% AMBIGUOUS · INFERRED: 134 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Community 0
- Community 1
- Community 2
- Community 3
- Community 4
- Community 5
- Community 6
- Community 7
- Community 8
- Community 9
- Community 10
- Community 11
- Community 12
- Community 13
- Community 14
- Community 15
- Community 16
- Community 17
- Community 18
- Community 19
- Community 20
- Community 21
- Community 22
- Community 23
- Community 24
- Community 25
- Community 26
- Community 27
- Community 28
- Community 29
- Community 30
- Community 32
- Community 33
- Community 34
- Community 35
- Community 36
- Community 37
- Community 38
- Community 39
- Community 40
- Community 41
- Community 42
- Community 43
- Community 44
- Community 45
- Community 46
- Community 48
- Community 49

## God Nodes (most connected - your core abstractions)
1. `QueueService` - 54 edges
2. `AuthUser` - 45 edges
3. `CurrentUser` - 45 edges
4. `AdminService` - 36 edges
5. `PrismaService` - 33 edges
6. `api()` - 32 edges
7. `react` - 28 edges
8. `YoutubeService` - 27 edges
9. `SuperController` - 23 edges
10. `biz()` - 23 edges

## Surprising Connections (you probably didn't know these)
- `generate()` --calls--> `api()`  [EXTRACTED]
  frontend/src/pages/Admin.tsx → frontend/src/lib/api.ts
- `SuperController` --references--> `Roles()`  [EXTRACTED]
  backend/src/admin/admin.module.ts → backend/src/auth/auth.ts
- `AdminController` --references--> `Roles()`  [EXTRACTED]
  backend/src/admin/admin.module.ts → backend/src/auth/auth.ts
- `DjController` --references--> `Roles()`  [EXTRACTED]
  backend/src/queue/queue.module.ts → backend/src/auth/auth.ts
- `PlayerController` --references--> `Roles()`  [EXTRACTED]
  backend/src/queue/queue.module.ts → backend/src/auth/auth.ts

## Import Cycles
- None detected.

## Communities (51 total, 14 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.07
Nodes (60): GOOGLE_CSE_ID, GoogleItem, GoogleSearch(), idFromLink(), loadScript(), parse(), ConfirmSheet(), fmt() (+52 more)

### Community 1 - "Community 1"
Cohesion: 0.07
Nodes (3): PublicController, QueueService, ytThumb()

### Community 2 - "Community 2"
Cohesion: 0.06
Nodes (48): dependencies, bcryptjs@^3.0.3, class-transformer@^0.5.1, class-validator@^0.15.1, dotenv@^18.0.9, @nestjs/common@^11.2.8, @nestjs/core@^11.2.8, @nestjs/jwt@^12.0.3 (+40 more)

### Community 3 - "Community 3"
Cohesion: 0.13
Nodes (21): BulkTablesDto, BusinessPlanDto, CreateBusinessDto, CreateStaffDto, DeleteTablesDto, ExperiencesDto, PaymentDto, PlanDto (+13 more)

### Community 4 - "Community 4"
Cohesion: 0.20
Nodes (5): AuthUser, CurrentUser, biz(), DjController, PlayerController

### Community 5 - "Community 5"
Cohesion: 0.07
Nodes (35): dependencies, qrcode@^1.5.4, react@^19.3.1, react-dom@^19.3.1, react-router-dom@^7.18.5, socket.io-client@^4.8.4, devDependencies, tailwindcss@^4.3.3 (+27 more)

### Community 6 - "Community 6"
Cohesion: 0.14
Nodes (15): Entry, LocalSong, FeatureId, PrismaModule, PublicModule, QueueModule, EventInput, StatsModule (+7 more)

### Community 7 - "Community 7"
Cohesion: 0.14
Nodes (30): Badge(), Card(), Empty(), NavItem, BarList(), HourChart(), Kpi(), pctText() (+22 more)

### Community 8 - "Community 8"
Cohesion: 0.12
Nodes (25): jspdf@^4.2.1, Headphones(), Leaves(), NeonNote(), Sparkle(), TableTheme, tableTheme(), Vinyl() (+17 more)

### Community 9 - "Community 9"
Cohesion: 0.11
Nodes (3): AdminService, newToken(), slugify()

### Community 10 - "Community 10"
Cohesion: 0.09
Nodes (9): @nestjs/websockets@^11.2.8, socket.io@^4.8.4, AuthGuard, RealtimeModule, MetricsService, Sample, SuperMetricsController, @nestjs/websockets (+1 more)

### Community 11 - "Community 11"
Cohesion: 0.12
Nodes (6): AgentService, norm(), PlansService, PrismaService, RealtimeService, EventsService

### Community 12 - "Community 12"
Cohesion: 0.13
Nodes (11): AdminStatsController, parseRange(), SuperStatsController, artistOf(), avg(), bump(), cleanTitle(), pct() (+3 more)

### Community 15 - "Community 15"
Cohesion: 0.16
Nodes (19): compact, DjSearch(), Props, Shell(), SongProgress(), Protected(), SkeletonList(), SkeletonRow() (+11 more)

### Community 16 - "Community 16"
Cohesion: 0.15
Nodes (7): isoToSeconds(), isRisky(), MusicProvider, normalize(), parseVideoId(), playableHere(), YoutubeService

### Community 17 - "Community 17"
Cohesion: 0.18
Nodes (4): AuthController, otpHash(), slugify(), Mailer

### Community 18 - "Community 18"
Cohesion: 0.21
Nodes (14): ACCENT, Brand(), IconName, ICONS, LEGAL, auth, LINKS, ROLE_LABEL (+6 more)

### Community 20 - "Community 20"
Cohesion: 0.11
Nodes (18): container_name, environment, healthcheck, image, ports, restart, volumes, POSTGRES_DB (+10 more)

### Community 21 - "Community 21"
Cohesion: 0.22
Nodes (17): cop(), DEFAULT_PLANS, PAY_HOLDER, PAY_METHODS, Plan, PlanId, usePlans(), waLink() (+9 more)

### Community 22 - "Community 22"
Cohesion: 0.15
Nodes (18): WA_CONTACT, C, Check(), Cta(), Eyebrow(), FAQ, FEAT_ICON, FEATURES (+10 more)

### Community 23 - "Community 23"
Cohesion: 0.11
Nodes (17): compilerOptions, allowSyntheticDefaultImports, baseUrl, declaration, emitDecoratorMetadata, esModuleInterop, experimentalDecorators, forceConsistentCasingInFileNames (+9 more)

### Community 24 - "Community 24"
Cohesion: 0.14
Nodes (16): dependencies, socket.io-client@^4.8.4, description, devDependencies, esbuild@^0.28.2, postject@^1.0.0-alpha.6, socket.io-client, name (+8 more)

### Community 25 - "Community 25"
Cohesion: 0.20
Nodes (9): createAgent(), connect(), sync(), watch(), AUDIO, idFor(), IGNORE, MIME (+1 more)

### Community 26 - "Community 26"
Cohesion: 0.24
Nodes (6): AutoDjDto, DjAddDto, HeartbeatDto, ReasonDto, ReorderDto, RequestRefDto

### Community 27 - "Community 27"
Cohesion: 0.23
Nodes (13): loadYouTubeApi(), Tv(), endHold(), enginePause(), enginePlay(), onSongEnded(), report(), start() (+5 more)

### Community 28 - "Community 28"
Cohesion: 0.14
Nodes (11): blob, bundle, dist, exe, files, root, seaCfg, sedPath (+3 more)

### Community 29 - "Community 29"
Cohesion: 0.23
Nodes (9): saveConfig(), pickFolder(), agent, cfg, readJson(), send(), server, serveVideo() (+1 more)

### Community 30 - "Community 30"
Cohesion: 0.29
Nodes (4): CreateRequestDto, FeedbackDto, ScanDto, VoteDto

### Community 32 - "Community 32"
Cohesion: 0.17
Nodes (11): AUTO_DJ_GENRES, BIZ_LITE, BizLite, FINISHED, GENRE_QUERIES, HOLDING, Memo, NewRequestInput (+3 more)

### Community 33 - "Community 33"
Cohesion: 0.35
Nodes (11): Btn(), Dialog(), Field(), Icon(), ExperiencePicker(), TableDetails(), TableName(), TablesView() (+3 more)

### Community 34 - "Community 34"
Cohesion: 0.17
Nodes (11): compilerOptions, jsx, lib, module, moduleResolution, noEmit, skipLibCheck, strict (+3 more)

### Community 35 - "Community 35"
Cohesion: 0.20
Nodes (10): scripts, build, db:local:migrate, db:local:reset, dev, dev:local, prisma:deploy, prisma:migrate (+2 more)

### Community 36 - "Community 36"
Cohesion: 0.20
Nodes (9): build, buildCommand, builder, deploy, healthcheckPath, healthcheckTimeout, restartPolicyType, startCommand (+1 more)

### Community 37 - "Community 37"
Cohesion: 0.31
Nodes (6): call(), created, login(), makeBar(), SA, suffix

### Community 39 - "Community 39"
Cohesion: 0.39
Nodes (4): ForgotDto, LoginDto, RegisterDto, ResetDto

### Community 41 - "Community 41"
Cohesion: 0.29
Nodes (5): configPath, defaults, dir, file, loadConfig()

### Community 42 - "Community 42"
Cohesion: 0.33
Nodes (5): collection, compilerOptions, deleteOutDir, $schema, sourceRoot

## Knowledge Gaps
- **14 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `@nestjs/common` connect `Community 6` to `Community 32`, `Community 2`, `Community 3`, `Community 10`, `Community 12`?**
  _High betweenness centrality (0.073) - this node is a cross-community bridge._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.07106293285155074 - nodes in this community are weakly interconnected._
- **Why does `AuthUser` connect `Community 4` to `Community 3`, `Community 6`, `Community 38`, `Community 12`, `Community 13`, `Community 19`, `Community 31`?**
  _High betweenness centrality (0.064) - this node is a cross-community bridge._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.06912280701754386 - nodes in this community are weakly interconnected._
- **Why does `CurrentUser` connect `Community 4` to `Community 3`, `Community 6`, `Community 38`, `Community 12`, `Community 13`, `Community 19`, `Community 31`?**
  _High betweenness centrality (0.064) - this node is a cross-community bridge._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.05725490196078432 - nodes in this community are weakly interconnected._
- **Should `Community 3` be split into smaller, more focused modules?**
  _Cohesion score 0.12802275960170698 - nodes in this community are weakly interconnected._