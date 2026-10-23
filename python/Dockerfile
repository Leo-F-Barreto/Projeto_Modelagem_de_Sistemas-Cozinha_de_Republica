FROM python:3.13-slim
WORKDIR /app/python
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
COPY python/pyproject.toml ./
COPY python/app ./app
COPY python/alembic.ini ./
COPY public /app/public
RUN pip install --no-cache-dir ".[postgres]"
EXPOSE 3000
CMD ["python", "-m", "app.main"]
