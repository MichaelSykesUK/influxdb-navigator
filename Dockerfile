FROM python:3.13-slim AS base

# Install Java and required utilities (like procps for the 'ps' command)
RUN apt-get update && apt-get install -y openjdk-17-jre-headless procps

# Set JAVA_HOME environment variable for OpenJDK 17
ENV JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64

WORKDIR /app

# Copy backend files
COPY backend/ /app/backend/
COPY frontend/ /app/frontend/

RUN pip install --no-cache-dir -r /app/backend/requirements.txt

RUN useradd -m appuser
USER appuser

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=3s \
  CMD curl --fail http://localhost:8000/ || exit 1

# "--host", "0.0.0.0" implied by run
ENTRYPOINT ["fastapi", "run", "/app/backend/api.py", "--port", "8000"] 