FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        libglib2.0-0 \
        libsm6 \
        libxext6 \
        libxrender1 \
        libx11-6 \
        libxcb1 \
        libgl1 \
    && rm -rf /var/lib/apt/lists/*

COPY apps/nl2gate-api/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

COPY apps/nl2gate-api/main.py /app/main.py
COPY apps/nl2gate-api/README.md /app/README.md
COPY projects /repo/projects
COPY normdocs /repo/normdocs
COPY standards /repo/standards
COPY mappings /repo/mappings
COPY tools /repo/tools
COPY docs/playbooks /repo/docs/playbooks

EXPOSE 8081

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8081"]
