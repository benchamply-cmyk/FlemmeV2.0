FROM python:3.12-slim
WORKDIR /app
COPY pyproject.toml uv.lock ./
COPY src ./src
RUN pip install --no-cache-dir uv==0.12.24 && uv sync --frozen --no-dev && useradd --uid 10001 --create-home api && mkdir /data && chown api /data
USER api
ENV FLEMME_DATABASE_PATH=/data/qualification.sqlite3 PORT=8000
EXPOSE 8000
CMD ["sh", "-c", "exec /app/.venv/bin/uvicorn flemme_manager.main:app --host 0.0.0.0 --port ${PORT}"]
