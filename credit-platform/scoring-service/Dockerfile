FROM python:3.12-slim

WORKDIR /app

# system deps occasionally needed by catboost/shap wheels
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgomp1 && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

# The image uses whatever model lives in app/artifacts/model.joblib + feature_schema.json.
# Put your REAL catboost.joblib there before building (see README "Use your real model").
# Only for a model-less smoke test would you instead bake a stub, e.g.:
#   COPY train_stub_model.py .
#   RUN python train_stub_model.py
# That line is intentionally NOT here, so a real model is never overwritten at build.
RUN test -f app/artifacts/model.joblib || (echo "ERROR: app/artifacts/model.joblib missing. Copy your real catboost.joblib there first." && exit 1)

EXPOSE 8000
HEALTHCHECK --interval=10s --timeout=3s --retries=5 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')" || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
