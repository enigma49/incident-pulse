# AI Incident & Operations Management Platform

An enterprise-grade, real-time AI Incident & Operations Management Platform built with NestJS, Next.js 14, MongoDB, Redis, Socket.IO, BullMQ, and OpenRouter AI.

---

## Architecture Overview

- **Frontend**: Next.js 14 (App Router), TypeScript, Tailwind CSS, shadcn/ui patterns, Socket.IO Client.
- **Backend**: NestJS, TypeScript, Mongoose (MongoDB 7), Redis (ioredis), Socket.IO, BullMQ, JWT + bcrypt.
- **AI Engine**: OpenRouter (OpenAI-compatible SDK) with strict Zod structured outputs, bounded tool-calling loop, grounded context retrieval, and mandatory human-in-the-loop approval.
- **Infrastructure**: Multi-stage Dockerfiles and Docker Compose orchestration for reproducible, self-contained local environments.

---

## Tech Stack

| Component | Technology | Description |
|-----------|------------|-------------|
| Backend API | NestJS 10+ / Express | Modular domain services, guards, interceptors, and DTO validation |
| Frontend | Next.js 14 App Router | Server & client components, responsive enterprise UI |
| Primary Database | MongoDB 7 / Mongoose | Document storage, indexed querying, aggregation pipelines |
| Cache & Queue Broker | Redis 7 / ioredis | Tiered caching with invalidation, BullMQ asynchronous job broker |
| Real-time Engine | Socket.IO | Bi-directional incident and dashboard updates with reconnect sync |
| Background Workers | BullMQ | Asynchronous AI investigations, retry with exponential backoff |
| AI Integration | OpenRouter API + Zod | Schema-enforced findings and recommendations with human approval |

---

## Demo Credentials

The platform comes pre-seeded with realistic operational data and standardized demo accounts:

| Role | Email | Password | Permissions |
|------|-------|----------|-------------|
| **Administrator** | `admin@example.com` | `Admin123!` | Full system access, team/user management, incident operations, approval |
| **Lead Operator** | `operator@example.com` | `Operator123!` | Incident operations, alerts, comments, tasks, AI investigations |
| **Operator 2** | `sarah.chen@example.com` | `Operator123!` | Incident operations, triage & investigation |
| **Operator 3** | `alex.rivera@example.com` | `Operator123!` | Incident operations, triage & investigation |
| **Operator 4** | `david.kim@example.com` | `Operator123!` | Incident operations, triage & investigation |

---

## Quickstart with Docker Compose

### Prerequisites
- Docker Engine 24+ & Docker Compose v2+

### 1. Configure Environment
```bash
cp .env.example .env
```

### 2. Launch Services
```bash
docker compose up --build
```
Services exposed:
- **Frontend**: `http://localhost:3000`
- **Backend API**: `http://localhost:4000`
- **Backend Healthcheck**: `http://localhost:4000/health`
- **MongoDB**: `localhost:27017`
- **Redis**: `localhost:6379`

---

## Local Development (Without Docker)

### Backend
```bash
cd backend
npm install
npm run start:dev
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

---

## Key Modules & Features

1. **Authentication & RBAC**: JWT Bearer auth with Refresh Tokens, `@Roles()` decorator and role guards (`ADMIN`, `OPERATOR`).
2. **Operations Dashboard**: Aggregated incident metrics, severity breakdown, active workloads, and recent activity.
3. **Incident Queue**: Filterable, sortable, paginated incident management powered by MongoDB native database queries.
4. **Alert Correlation Engine**: Deterministic correlation mapping incoming alerts to existing active incidents or spawning new ones.
5. **Real-time Collaboration**: Socket.IO incident and dashboard rooms with automatic client reconnect reconciliation.
6. **AI Investigation Workflow**: BullMQ asynchronous processing, grounded context gathering via controlled tools, Zod-validated findings, and human-in-the-loop approval.

