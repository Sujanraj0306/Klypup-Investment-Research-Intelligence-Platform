FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PORT=8080 \
    # Skip Playwright Chromium install — saves ~400 MB so we fit in Render free
    # tier's 512 MB RAM / ~500 MB image cap. The web_scrape tool degrades
    # gracefully when Playwright isn't available. Set INSTALL_PLAYWRIGHT=1 at
    # build time to re-enable (e.g. on Cloud Run / paid Render tier).
    INSTALL_PLAYWRIGHT=0

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
      build-essential \
      curl \
      ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./
RUN pip install --upgrade pip && pip install -r requirements.txt

# Optional Playwright — opt-in via build arg so the base image stays small.
ARG INSTALL_PLAYWRIGHT=0
RUN if [ "$INSTALL_PLAYWRIGHT" = "1" ]; then \
      playwright install --with-deps chromium; \
    else \
      echo "Skipping Playwright (INSTALL_PLAYWRIGHT=0)"; \
    fi

# TextBlob corpora for sentiment analysis — tiny (~5 MB), always install.
RUN python -m textblob.download_corpora

COPY . .

# ChromaDB directory. On Render free tier the filesystem is ephemeral so
# RAG starts empty on every boot; the filings tool degrades gracefully.
# Run scripts/ingest_filings.py once per boot if you want live RAG.
RUN mkdir -p /app/chroma_db

EXPOSE 8080

# Render / Railway / Cloud Run all inject $PORT at runtime.
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT} --workers 1"]
