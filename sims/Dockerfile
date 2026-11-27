FROM python:3.13-alpine

RUN apk add --no-cache tzdata

WORKDIR /opt/sims
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# app/www is the built page, made by the release workflow (pnpm build:app).
COPY app ./app

ENV PYTHONUNBUFFERED=1
CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8099", "--no-access-log", "--proxy-headers", "--forwarded-allow-ips", "*", "--ws-max-size", "67108864"]
