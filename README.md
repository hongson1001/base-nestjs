# Base NestJS Backend

Khung base chuẩn cho NestJS backend. REST API, auth (session/JWT), RBAC, real-time WebSocket, file upload, MongoDB.

## Tech Stack

- **Framework:** NestJS 11 (Modular Monolith)
- **Database:** MongoDB + Mongoose ODM
- **Auth:** Session cookie hoặc JWT (configurable qua `AUTH_MODE`)
- **Real-time:** Socket.io (WebSocket) — tự động push mọi thay đổi
- **File Storage:** S3-compatible (MinIO dev / Cloudflare R2 prod)
- **Image Processing:** Sharp (resize, WebP convert)

## Cài đặt

```bash
yarn install
cp .env.example .env    # Chỉnh config phù hợp
```

## Lệnh thường dùng

```bash
yarn start:dev        # Dev watch mode
yarn build            # Build production
yarn start:prod       # Chạy production
yarn lint             # ESLint fix
yarn format           # Prettier format
yarn test             # Chạy test
```

## Cấu trúc dự án

```text
src/
├── main.ts                           # Bootstrap, global pipes/filters/interceptors
├── app.module.ts                     # Root module, global guards
│
├── common/                           # Shared infrastructure
│   ├── constants/                    # Error codes, roles, security constants
│   ├── decorators/                   # @Public, @RequirePermission, @CurrentPrincipal...
│   ├── guards/                       # AuthGuard, PermissionGuard, ThrottlerGuard
│   ├── interceptors/                 # Response envelope, audit log, realtime, image URL
│   ├── filters/                      # Global exception filter
│   ├── pipes/                        # ParseMongoId, file validation
│   ├── plugins/                      # Mongoose plugins (soft-delete, audit fields)
│   ├── repositories/                 # BaseRepository (pagination, soft-delete)
│   ├── schemas/                      # AuditLog, Counter
│   ├── services/                     # FileStorage (S3), PolicyService
│   ├── gateways/                     # WebSocket gateway (real-time)
│   ├── interfaces/                   # Principal interface
│   └── dto/                          # PaginationDto, QueryBaseDto
│
├── modules/                          # Feature modules
│   └── auth/                         # Auth module (login, register, JWT/session)
│
└── types/                            # Global TypeScript types
```

## Imports

Dùng relative path (không alias) để tránh cấu hình runtime resolution (`tsc-alias` / `tsconfig-paths`). Ví dụ: `import { AuthGuard } from '../common/guards/auth.guard.js'`.

## Auth Modes

Chọn qua env `AUTH_MODE`:

- **SESSION** (default) — Cookie `HttpOnly`, session lưu MongoDB
- **JWT** — AccessToken (15m) + RefreshToken (7d)

Cả 2 đều hội tụ về `Principal { userId, email, roles, permissions }`.

## Thêm module mới

```text
src/modules/{module-name}/
├── {module-name}.module.ts
├── {module-name}.controller.ts       # Validate DTO + gọi service
├── {module-name}.service.ts          # Business logic
├── {module-name}.repository.ts       # Extend BaseRepository
├── schemas/
├── dto/
└── constants/
```

Real-time tự hoạt động — không cần code thêm.

## Env Config

Xem `.env.example` để biết các biến cần thiết.
