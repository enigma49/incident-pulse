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

---

## Redis Caching Architecture

The platform incorporates tiered Redis caching for read-heavy operations with strict cache invalidation on any state-changing mutation:

### Cached Use Cases
| Resource | Cache Key | TTL | Description | Invalidation Triggers |
|----------|-----------|-----|-------------|-----------------------|
| **Operations Overview** | `dashboard:overview` | 30 seconds | Aggregated counts of open, critical, and mitigated incidents, severity distributions, and team workloads | Any incident creation, status change, severity change, or team assignment |
| **Incident Detail** | `incident:{incidentId}:detail` | 15 seconds | Composite incident document with correlated alerts, tasks, comments, and recent audit timeline | Incident status/severity updates, assignment, comment creation, task creation/toggle/deletion |

### Invalidation Strategy
- **Targeted Purging**: Mutations invoke `redisService.invalidateIncident(id)` which immediately evicts the incident's cached detail key and the global dashboard overview key.
- **Fail-soft Fallback Mode**: If Redis becomes temporarily unreachable or fails:
  1. The error is intercepted and logged (`[Redis] Connection warning: Gracefully falling back...`).
  2. The application falls back seamlessly to an in-memory TTL store backed by direct MongoDB queries.
  3. The core application remains 100% operational with zero downtime or uncaught process crashes.

---

## Realtime Collaboration Architecture

IncidentPulse features full-duplex WebSocket communication powered by **Socket.IO**:

### Socket.IO Rooms
- `dashboard`: Subscribed to by the operations overview and incident queue. Receives platform-wide alerts, new incidents, and high-level status changes.
- `incident:{id}`: Subscribed to when viewing a specific incident detail page. Delivers fine-grained collaboration events (status/severity changes, assignment updates, comments, checklist tasks, correlated alerts, AI investigation steps).

### Realtime Event Protocol
| Event Name | Room Scope | Payload | Description |
|------------|------------|---------|-------------|
| `incident:created` | `dashboard` | `Incident` | Emitted when a new incident is ingested or manually created |
| `incident:updated` | `dashboard`, `incident:{id}` | `Incident` | Emitted on metadata/description updates |
| `incident:status_changed` | `dashboard`, `incident:{id}` | `Incident` | Emitted when incident transitions state (`OPEN`, `INVESTIGATING`, `MITIGATED`, `RESOLVED`) |
| `incident:severity_changed` | `dashboard`, `incident:{id}` | `Incident` | Emitted on severity escalation or de-escalation (`P1`-`P4`) |
| `incident:assigned` | `dashboard`, `incident:{id}` | `Incident` (populated) | Emitted when owner or team assignment is updated |
| `comment:created` | `incident:{id}` | `Comment` (populated) | Emitted when a team member posts a collaboration note |
| `task:created` | `incident:{id}` | `Task` | Emitted when a mitigation checklist task is created |
| `task:updated` | `incident:{id}` | `Task` | Emitted when a mitigation checklist task is completed or modified |
| `task:deleted` | `incident:{id}` | `{ taskId }` | Emitted when a task is removed |
| `alert:associated` | `dashboard`, `incident:{id}` | `Alert` | Emitted when an alert is correlated to an incident |
| `ai:investigation_event` | `incident:{id}` | `{ type, data }` | Streams autonomous AI reasoning, tool calls, and hypothesis generation |

### Network Resilience & Reconnect Reconciliation
- **Authoritative REST Refetch**: Real-time events provide immediate optimistic UI feedback. However, during network drops or disconnects, missed socket events could create state drift.
- **Reconnect Epoch Listener**: The frontend tracks socket connection epochs. Upon any reconnect (`socket.on('connect')` after disconnect), the client automatically triggers an authoritative REST fetch (`GET /incidents/:id` or `GET /dashboard/overview`), ensuring 100% data consistency without manual refresh.



