# ML workers: consumer.py (verdict, Gemini Decision) and boxes.py (every object, Gemini 4).
FROM python:3.12-slim
WORKDIR /app
COPY ml/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY ml/*.py ml/taxonomy.json ./
ENV PYTHONUNBUFFERED=1
CMD ["python", "consumer.py"]
