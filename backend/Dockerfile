FROM oven/bun:1 AS base

RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-venv \
    && rm -rf /var/lib/apt/lists/*

RUN python3 -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

RUN pip install --no-cache-dir linkedin-api requests

WORKDIR /app

COPY package.json bun.lock* ./

RUN bun install --frozen-lockfile

COPY . .

RUN echo '#!/bin/bash\n/opt/venv/bin/python3 /app/skills/linkedin/scripts/lk.py "$@"' > /usr/local/bin/lk && \
    chmod +x /usr/local/bin/lk

EXPOSE 3001

CMD ["bun", "run", "start"]
