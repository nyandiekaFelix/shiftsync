## Prerequisites

- [Node.js](https://nodejs.org/) (v20+)
- [pnpm](https://pnpm.io/installation) (v10+)
- [Docker & Docker Desktop](https://www.docker.com/products/docker-desktop/)

---

## Environment Variables

This project uses a centralized `.env` file at the root for local development.

1.  **Copy the template:**
    ```bash
    cp .env.example .env
    ```
2.  **How it's loaded:**
    - **API:** Uses `@nestjs/config` and is configured to look for `../../.env`.
    - **Web:** Uses `dotenv` within `next.config.ts` to inject root variables during local dev.

---

## Getting Started

### 1. Clone the repository and install dependencies

```bash
pnpm install
```

### 2. Start Infrastructure (PostgreSQL & Redis)

Ensure Docker Desktop is running, then start the containers:

```bash
docker compose up -d
```

### 3. Run Development Servers

Start both the NestJS API and Next.js Frontend concurrently:

```bash
pnpm run dev
```

- **Frontend:** [http://localhost:3000](http://localhost:3000)
- **Backend API:** [http://localhost:3001](http://localhost:3001)
- **Swagger Documentation:** [http://localhost:3001/api](http://localhost:3001/api)

---

## Quality & Testing

### Run Tests
```bash
# Run all tests (API + Web)
pnpm run test

# Run only Frontend tests
cd apps/web && pnpm run test

# Run only Backend tests
cd apps/api && pnpm run test
```

### Linting & Formatting
```bash
pnpm run lint
pnpm run format
```
