# ShiftSync

ShiftSync is a multi-location workforce scheduling platform. This monorepo contains both the NestJS API and the Next.js Frontend.

---

## Quick Start Guide

Follow these steps in order to set up your local development environment.

### 1. Prerequisites

Ensure you have the following installed:

- [Node.js](https://nodejs.org/) (v20+)
- [pnpm](https://pnpm.io/installation) (v10+)
- [Docker & Docker Desktop](https://www.docker.com/products/docker-desktop/)

### 2. Install Dependencies

Clone the repository and install all dependencies from the root:

```bash
pnpm install
```

### 3. Environment Variables

We use a single root `.env` file that is symlinked to individual apps for consistency.

1.  **Copy the template:**
    ```bash
    cp .env.example .env
    ```
2.  **Initialize symlinks:**
    ```bash
    pnpm run setup:env
    ```
3.  **Configure Core Variables:**
    - `DATABASE_URL`: Set your PostgreSQL connection string (defaults work with Docker).
    - `JWT_SECRET`: A secure key for authentication.
    - `NEXT_PUBLIC_API_URL`: Set to `http://localhost:3001/api/v1` for local development.

### 4. Infrastructure (Docker)

Start the required PostgreSQL and Redis services:

```bash
docker compose up -d
```

### 5. Database Setup (Prisma)

Once the database is running, initialize your schema and seed it with test data:

1.  **Run Migrations:**
    ```bash
    pnpm --filter api run db:migrate
    ```
2.  **Seed Data:**
    ```bash
    pnpm --filter api run db:seed
    ```

    - **Admin**: `admin@example.com` / `password123`
    - **Manager (Seattle)**: `manager.sea@example.com` / `password123`
    - **Manager (NY)**: `manager.ny@example.com` / `password123`
    - **Staff**: `alice@example.com` / `password123` or `bob@example.com` / `password123`
    - _Note: Additional accounts can be found in `apps/api/prisma/seed.ts`._

---

## Running the Applications

### Concurrent Development (Recommended)

Start both the API and Web applications simultaneously using Turborepo:

```bash
pnpm run dev
```

- **Frontend:** [http://localhost:3000](http://localhost:3000)
- **Backend API:** [http://localhost:3001/api/v1](http://localhost:3001/api/v1)
- **Swagger Docs:** [http://localhost:3001/api/v1](http://localhost:3001/api/v1)

### Individual Startup

If you need to run only one application:

- **API Only:** `pnpm --filter api run dev`
- **Web Only:** `pnpm --filter web run dev`

---

## Quality & Testing

### Run All Tests

```bash
pnpm run test
```

### Linting & Formatting

```bash
pnpm run lint
pnpm run format
```
