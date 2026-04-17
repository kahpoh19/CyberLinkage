FROM python:3.11-slim

WORKDIR /app

COPY backend/requirements.txt ./backend-requirements.txt
COPY ai/requirements.txt ./ai-requirements.txt
RUN pip install --no-cache-dir -r backend-requirements.txt -r ai-requirements.txt

COPY backend/ .
COPY ai/ /app/ai/
COPY knowledge/data /app/knowledge/data

ENV KNOWLEDGE_DATA_DIR=/app/knowledge/data

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
