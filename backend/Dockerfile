FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Install python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Railway injects $PORT at runtime; fallback to 8000 for local Docker
ENV PORT=8000

EXPOSE $PORT

CMD uvicorn app.main:app --host 0.0.0.0 --port $PORT
