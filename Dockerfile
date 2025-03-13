FROM python:3.13-slim AS base

WORKDIR /app

# Copy backend files, excluding credentials
COPY backend/*.py /app/backend/
COPY backend/requirements.txt /app/backend/
COPY frontend/ /app/frontend/

RUN pip install --no-cache-dir -r /app/backend/requirements.txt

RUN useradd -m appuser
USER appuser

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=3s \
  CMD curl --fail http://localhost:8000/ || exit 1

ENTRYPOINT ["fastapi", "run", "/app/backend/api.py", "--host", "0.0.0.0", "--port", "8000"]