# OpenClaw Hackathon

A full-stack application built for the OpenClaw Hackathon, featuring a Next.js frontend and a Bun-based backend.

## Project Structure

This is a monorepo workspace containing:

- **frontend**: Next.js application with React 19 and Tailwind CSS
- **backend**: Bun-based TypeScript server
- **skills**: Custom skills directory (mounted in Docker)

## Prerequisites

- [Bun](https://bun.sh/) - JavaScript runtime and package manager
- Docker and Docker Compose (optional, for containerized deployment)

## Installation

Install all dependencies for the workspace:

```bash
bun install
```

## Development

### Run both frontend and backend

```bash
bun run dev
```

### Run individually

**Frontend only:**
```bash
bun run dev:frontend
```

**Backend only:**
```bash
bun run dev:backend
```

## Production

### Build

Build both frontend and backend:

```bash
bun run build
```

### Start

Start both services:

```bash
bun run start
```

**Frontend only:**
```bash
bun run start:frontend
```

**Backend only:**
```bash
bun run start:backend
```

## Docker Deployment

The project includes Docker Compose configuration for containerized deployment.

### Start services

```bash
docker-compose up
```

### Build and start

```bash
docker-compose up --build
```

### Services

- **Frontend**: Available at `http://localhost:3000`
- **Backend**: Available at `http://localhost:3001`

## Tech Stack

### Frontend
- Next.js 16.1.6
- React 19.2.3
- Tailwind CSS 4
- TypeScript 5

### Backend
- Bun runtime
- TypeScript 5
- OpenAI SDK 6.17.0

## License

Private project - All rights reserved
