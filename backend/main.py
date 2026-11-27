from contextlib import asynccontextmanager
from pathlib import Path
from dotenv import load_dotenv
from fastapi import BackgroundTasks, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

import __main__
import logging
import joblib
import numpy as np
import os
import pandas as pd
import re

from sklearn.base import BaseEstimator, TransformerMixin
from sklearn.compose import ColumnTransformer, TransformedTargetRegressor

load_dotenv()

from database import init_db, log_prediction


# ---------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------
logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
)
logger = logging.getLogger("laptop-price-api")


# ---------------------------------------------------------------------
# Custom transformer
# Keep this class available before joblib.load(), because the serialized
# pipeline may reference __main__.FeatureEngineer.
# ---------------------------------------------------------------------
class FeatureEngineer(BaseEstimator, TransformerMixin):
    def __init__(self):
        pass

    def fit(self, X, y=None):
        return self

    def _storage_type(self, memory_str):
        memory_str = str(memory_str).lower()
        if "ssd" in memory_str and "hdd" in memory_str:
            return "Hybrid"
        if "ssd" in memory_str:
            return "SSD"
        if "hdd" in memory_str:
            return "HDD"
        if "flash storage" in memory_str:
            return "Flash Storage"
        return "Unknown"

    def _extract_storage_size(self, memory_str):
        match = re.search(r"(\d+)\s*(GB|TB)", str(memory_str), flags=re.IGNORECASE)
        if not match:
            return None
        size = int(match.group(1))
        unit = match.group(2).upper()
        return size * 1024 if unit == "TB" else size

    def _extract_resolution(self, text):
        match = re.search(r"(\d+)\s*x\s*(\d+)", str(text), flags=re.IGNORECASE)
        if match:
            return int(match.group(1)) * int(match.group(2))
        return None

    def _extract_cpu_speed(self, text):
        match = re.search(r"(\d+\.?\d*)\s*GHz", str(text), flags=re.IGNORECASE)
        return float(match.group(1)) if match else None

    def _extract_cpu_vendor(self, cpu_name):
        cpu_name = str(cpu_name).lower()
        if "intel" in cpu_name:
            return "Intel"
        if "amd" in cpu_name:
            return "AMD"
        if "samsung" in cpu_name:
            return "Samsung"
        return "Other"

    def _extract_gpu_vendor(self, gpu_name):
        gpu_name = str(gpu_name).lower()
        if "nvidia" in gpu_name:
            return "Nvidia"
        if "amd" in gpu_name:
            return "AMD"
        if "intel" in gpu_name:
            return "Intel"
        return "Other"

    def transform(self, df_input):
        df_processed = df_input.copy()

        df_processed["Storage_Type"] = df_processed["Memory"].apply(
            self._storage_type
        )
        df_processed["Storage_Size_GB"] = df_processed["Memory"].apply(
            self._extract_storage_size
        )
        df_processed["Resolution_Pixels"] = df_processed["ScreenResolution"].apply(
            self._extract_resolution
        )
        df_processed["CPU_Speed_GHz"] = df_processed["Cpu"].apply(
            self._extract_cpu_speed
        )
        df_processed["CPU_Vendor"] = df_processed["Cpu"].apply(
            self._extract_cpu_vendor
        )
        df_processed["GPU_Vendor"] = df_processed["Gpu"].apply(
            self._extract_gpu_vendor
        )

        columns_to_drop = [
            "ScreenResolution",
            "Cpu",
            "Memory",
            "Gpu",
            "Product",
            "laptop_ID",
        ]
        return df_processed.drop(columns=columns_to_drop, errors="ignore")


# Compatibility for joblib models serialized with __main__.FeatureEngineer
__main__.FeatureEngineer = FeatureEngineer


# ---------------------------------------------------------------------
# Paths and runtime state
# ---------------------------------------------------------------------
BASE_DIR = Path(__file__).resolve().parent
MODEL_PATH = BASE_DIR / "best_ridge_model.joblib"
DATASET_PATH = BASE_DIR / "laptop_price.csv"

MODEL_RMSE = 328.90

model_pipeline = None
_metadata_cache = None
_model_error = None
_metadata_error = None
_db_ready = False


def _sorted_unique(series):
    values = series.dropna().unique().tolist()
    return sorted(values, key=lambda value: str(value))


def _load_model():
    global model_pipeline, _model_error

    try:
        if not MODEL_PATH.is_file():
            raise FileNotFoundError(f"Model file not found: {MODEL_PATH}")

        loaded_model = joblib.load(MODEL_PATH)
        if not hasattr(loaded_model, "predict"):
            raise TypeError("Loaded model does not expose a predict() method")

        # Assign only after successful loading and validation.
        model_pipeline = loaded_model
        _model_error = None
        logger.info("Model loaded successfully from %s", MODEL_PATH)

    except Exception as exc:
        model_pipeline = None
        _model_error = str(exc)
        logger.exception("Failed to load model")


def _load_metadata():
    global _metadata_cache, _metadata_error

    try:
        if not DATASET_PATH.is_file():
            raise FileNotFoundError(f"Dataset file not found: {DATASET_PATH}")

        df = pd.read_csv(DATASET_PATH, sep=";", encoding="latin-1")

        required_columns = ["Company", "TypeName", "Cpu", "Gpu", "OpSys"]
        missing_columns = [col for col in required_columns if col not in df.columns]
        if missing_columns:
            raise ValueError(
                f"Dataset is missing required columns: {', '.join(missing_columns)}"
            )

        by_company = {}
        for company, group in df.groupby("Company"):
            by_company[company] = {
                "TypeName": _sorted_unique(group["TypeName"]),
                "Cpu": _sorted_unique(group["Cpu"]),
                "Gpu": _sorted_unique(group["Gpu"]),
                "OpSys": _sorted_unique(group["OpSys"]),
            }

        _metadata_cache = {
            "Company": _sorted_unique(df["Company"]),
            "TypeName": _sorted_unique(df["TypeName"]),
            "Cpu": _sorted_unique(df["Cpu"]),
            "Gpu": _sorted_unique(df["Gpu"]),
            "OpSys": _sorted_unique(df["OpSys"]),
            "dependencies": {"by_company": by_company},
        }
        _metadata_error = None
        logger.info(
            "Metadata loaded successfully: %s rows, %s companies",
            len(df),
            len(by_company),
        )

    except Exception as exc:
        _metadata_cache = None
        _metadata_error = str(exc)
        logger.exception("Failed to load dataset / metadata")


# ---------------------------------------------------------------------
# CORS
# FRONTEND_URL should be the exact Vercel origin, without a path.
# Multiple origins can be comma-separated.
# ---------------------------------------------------------------------
ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]

frontend_urls = os.getenv("FRONTEND_URL", "")
for frontend_url in frontend_urls.split(","):
    clean_url = frontend_url.strip().rstrip("/")
    if clean_url and clean_url not in ALLOWED_ORIGINS:
        ALLOWED_ORIGINS.append(clean_url)

logger.info("CORS allowed origins: %s", ALLOWED_ORIGINS)


# ---------------------------------------------------------------------
# Application lifecycle
# ---------------------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    global _db_ready

    logger.info("Starting Laptop Price Estimator API")

    _load_model()
    _load_metadata()

    try:
        _db_ready = init_db()

        if not _db_ready:
            logger.warning(
                "Database unavailable. Prediction inference can still run."
            )

    except Exception:
        _db_ready = False
        logger.exception(
            "Database initialization failed; prediction may still work"
        )

    logger.info(
        "Startup summary | model_ready=%s | metadata_ready=%s | db_ready=%s",
        model_pipeline is not None,
        _metadata_cache is not None,
        _db_ready,
    )

    yield

    logger.info("Shutting down Laptop Price Estimator API")


app = FastAPI(
    title="Laptop Price API",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)


# ---------------------------------------------------------------------
# Request schema
# ---------------------------------------------------------------------
class LaptopInput(BaseModel):
    laptop_ID: int = 0
    Company: str
    Product: str
    TypeName: str
    Inches: float
    ScreenResolution: str
    Cpu: str
    Ram: int
    Memory: str
    Gpu: str
    OpSys: str
    Weight: float


# ---------------------------------------------------------------------
# Explainability helper
# ---------------------------------------------------------------------
def _get_top_drivers(
    pipeline,
    input_df: pd.DataFrame,
    predicted_price: float,
    top_n: int = 2,
):
    try:
        fe_step = None
        ct_step = None
        regressor_step = None

        for _, step in pipeline.steps:
            if hasattr(step, "transform") and hasattr(step, "_storage_type"):
                fe_step = step
            elif isinstance(step, ColumnTransformer):
                ct_step = step
            else:
                regressor_step = step

        if fe_step is None or ct_step is None or regressor_step is None:
            return []

        engineered_df = fe_step.transform(input_df)
        X_processed = ct_step.transform(engineered_df)

        if isinstance(regressor_step, TransformedTargetRegressor):
            ridge = regressor_step.regressor_
        else:
            ridge = regressor_step

        feature_names = ct_step.get_feature_names_out()
        coef = ridge.coef_

        if X_processed.shape[1] != len(coef):
            return []

        x_vec = np.asarray(X_processed[0]).ravel()
        log_contributions = coef * x_vec
        total_log = log_contributions.sum()

        if total_log == 0:
            return []

        price_contributions = predicted_price * (log_contributions / total_log)

        drivers = [
            {
                "feature": str(feature_names[i]),
                "contribution_eur": round(float(price_contributions[i]), 2),
            }
            for i in range(len(feature_names))
            if price_contributions[i] > 0
        ]
        drivers.sort(key=lambda item: item["contribution_eur"], reverse=True)
        return drivers[:top_n]

    except Exception:
        logger.exception("Could not calculate top drivers")
        return []


# ---------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------
@app.get("/")
async def root():
    return {
        "service": "Laptop Price Estimator API",
        "status": "running",
    }


@app.get("/health")
async def health_check():
    # Liveness: confirms that the application process is responding.
    return {"status": "alive"}


@app.get("/ready")
async def readiness_check():
    # Readiness: confirms that critical inference resources are available.
    if model_pipeline is None or _metadata_cache is None:
        raise HTTPException(
            status_code=503,
            detail={
                "status": "not_ready",
                "model_ready": model_pipeline is not None,
                "metadata_ready": _metadata_cache is not None,
                "model_error": _model_error,
                "metadata_error": _metadata_error,
            },
        )

    return {
        "status": "ready",
        "model_ready": True,
        "metadata_ready": True,
        "database_ready": _db_ready,
    }


@app.get("/metadata")
async def get_metadata():
    if _metadata_cache is None:
        raise HTTPException(
            status_code=503,
            detail=f"Metadata unavailable: {_metadata_error or 'dataset not loaded'}",
        )
    return _metadata_cache


@app.post("/predict")
async def predict_price(
    data: LaptopInput,
    background_tasks: BackgroundTasks,
):
    if model_pipeline is None:
        raise HTTPException(
            status_code=503,
            detail=f"Model unavailable: {_model_error or 'model not loaded'}",
        )

    try:
        input_data = pd.DataFrame([data.model_dump()])

        pred = model_pipeline.predict(input_data)
        predicted_price = float(pred[0])

        lower_bound = round(max(predicted_price - MODEL_RMSE, 0), 2)
        upper_bound = round(predicted_price + MODEL_RMSE, 2)

        top_drivers = _get_top_drivers(
            model_pipeline,
            input_data,
            predicted_price,
        )

        # Logging is asynchronous and should not delay the prediction response.
        background_tasks.add_task(
            log_prediction,
            input_params=data.model_dump(),
            predicted_price_eur=round(predicted_price, 2),
            lower_bound=lower_bound,
            upper_bound=upper_bound,
            top_drivers=top_drivers,
        )

        return {
            "status": "success",
            "predicted_price": round(predicted_price, 2),
            "lower_bound": lower_bound,
            "upper_bound": upper_bound,
            "top_drivers": top_drivers,
        }

    except Exception as exc:
        logger.exception("Prediction failed")
        raise HTTPException(
            status_code=500,
            detail=f"Internal model error: {str(exc)}",
        )
