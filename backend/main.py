from fastapi import BackgroundTasks, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from pathlib import Path
from dotenv import load_dotenv

import joblib
import numpy as np
import pandas as pd
import re
import os

from sklearn.pipeline import Pipeline
from sklearn.compose import ColumnTransformer
from sklearn.linear_model import Ridge
from sklearn.preprocessing import FunctionTransformer
from sklearn.base import BaseEstimator, TransformerMixin

load_dotenv()

from database import init_db, log_prediction

class FeatureEngineer(BaseEstimator, TransformerMixin):
    def __init__(self):
        pass

    def fit(self, X, y=None):
        return self

    def _storage_type(self, memory_str):
        memory_str = memory_str.lower()
        if 'ssd' in memory_str and 'hdd' in memory_str:
            return 'Hybrid'
        elif 'ssd' in memory_str:
            return 'SSD'
        elif 'hdd' in memory_str:
            return 'HDD'
        elif 'flash storage' in memory_str:
            return 'Flash Storage'
        else:
            return 'Unknown'

    def _extract_storage_size(self, memory_str):
        match = re.search(r'(\d+)(GB|TB)', memory_str)
        if match:
            size = int(match.group(1))
            unit = match.group(2)
            if unit == 'TB':
                size = size * 1024
            return size
        return None

    def _extract_resolution(self, text):
        text = text.lower()
        if 'x' in text:
            match = re.search(r'(\d+)x(\d+)', text)
            if match:
                return int(match.group(1)) * int(match.group(2))
        return None

    def _extract_cpu_speed(self, text):
        # Modified regex to capture both float and integer GHz values
        match = re.search(r'(\d+\.?\d*)GHz', text)
        if match:
            return float(match.group(1))
        return None

    def _extract_cpu_vendor(self, cpu_name):
        cpu_name = cpu_name.lower()
        if 'intel' in cpu_name:
            return 'Intel'
        elif 'amd' in cpu_name:
            return 'AMD'
        elif 'samsung' in cpu_name:
            return 'Samsung'
        else:
            return 'Other'

    def _extract_gpu_vendor(self, gpu_name):
        gpu_name = gpu_name.lower()
        if 'nvidia' in gpu_name:
            return 'Nvidia'
        elif 'amd' in gpu_name:
            return 'AMD'
        elif 'intel' in gpu_name:
            return 'Intel'
        else:
            return 'Other'

    def transform(self, df_input):
        # Use the input DataFrame (df_input) directly for transformations
        df_processed = df_input.copy()

        # Feature Engineering — Storage_Type
        df_processed['Storage_Type'] = df_processed['Memory'].apply(self._storage_type)

        # Feature Engineering — Storage_Size
        df_processed['Storage_Size_GB'] = df_processed['Memory'].apply(self._extract_storage_size)

        # Feature Engineering — Resolution_Pixels
        df_processed['Resolution_Pixels'] = df_processed['ScreenResolution'].apply(self._extract_resolution)

        # Feature Engineering — CPU_Speed_GHz
        df_processed['CPU_Speed_GHz'] = df_processed['Cpu'].apply(self._extract_cpu_speed)

        # Feature Engineering — CPU Vendor
        df_processed['CPU_Vendor'] = df_processed['Cpu'].apply(self._extract_cpu_vendor)

        # Feature Engineering — GPU Vendor
        df_processed['GPU_Vendor'] = df_processed['Gpu'].apply(self._extract_gpu_vendor)

        # Drop columns that are already represented by new features
        columns_to_drop = ['ScreenResolution', 'Cpu', 'Memory', 'Gpu', 'Product', 'laptop_ID']
        df_processed = df_processed.drop(columns=columns_to_drop, errors='ignore')

        # Removed: df_processed = df_processed.dropna(subset=['CPU_Speed_GHz'])
        # NaNs will now be handled by SimpleImputer in the ColumnTransformer

        return df_processed
    
import __main__
__main__.FeatureEngineer = FeatureEngineer

MODEL_PATH   = Path(__file__).parent / "best_ridge_model.joblib"
DATASET_PATH = Path(__file__).parent / "laptop_price.csv"

try:
    model_pipeline = joblib.load(MODEL_PATH)
    print("berhasil")
except Exception as e:
    print(f"Error loading model {e}")

model_pipeline = None
_metadata_cache = None

try:
    _df = pd.read_csv(DATASET_PATH, sep=";", encoding="latin-1")

    def _sorted_unique(series):
        return sorted(series.dropna().unique().tolist())

    # Per-company dependency map
    by_company = {}
    for company, group in _df.groupby("Company"):
        by_company[company] = {
            "TypeName": _sorted_unique(group["TypeName"]),
            "Cpu":      _sorted_unique(group["Cpu"]),
            "Gpu":      _sorted_unique(group["Gpu"]),
            "OpSys":    _sorted_unique(group["OpSys"]),
        }

    _metadata_cache = {
        "Company":  _sorted_unique(_df["Company"]),
        "TypeName": _sorted_unique(_df["TypeName"]),
        "Cpu":      _sorted_unique(_df["Cpu"]),
        "Gpu":      _sorted_unique(_df["Gpu"]),
        "OpSys":    _sorted_unique(_df["OpSys"]),
        "dependencies": {"by_company": by_company},
    }
    print("metadata loaded")
except Exception as e:
    print(f"Error loading dataset {e}")

app = FastAPI(title="Laptop Price API")

@app.on_event("startup")
def on_startup():
    init_db()

ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]

_frontend_urls = os.environ.get("FRONTEND_URL", "")
if _frontend_urls:
    for url in _frontend_urls.split(","):
        clean_url = url.strip().rstrip("/")
        if clean_url:
            ALLOWED_ORIGINS.append(clean_url)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)


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


def _get_top_drivers(pipeline, input_df: pd.DataFrame, predicted_price: float, top_n: int = 2):
    """
    Introspect the sklearn pipeline to compute per-feature monetary contributions.
    Handles: Pipeline → FeatureEngineer → ColumnTransformer → (TransformedTargetRegressor | Ridge)
    Returns a list of {feature, contribution_eur} dicts sorted by descending contribution.
    """
    try:
        steps = {name: step for name, step in pipeline.steps}

        fe_step = None
        ct_step = None
        regressor_step = None
        for name, step in pipeline.steps:
            if hasattr(step, 'transform') and hasattr(step, '_storage_type'):
                fe_step = step
            elif isinstance(step, ColumnTransformer):
                ct_step = step
            else:
                regressor_step = step

        if fe_step is None or ct_step is None or regressor_step is None:
            return []

        engineered_df = fe_step.transform(input_df)

        X_processed = ct_step.transform(engineered_df)

        try:
            from sklearn.compose import TransformedTargetRegressor
            if isinstance(regressor_step, TransformedTargetRegressor):
                ridge = regressor_step.regressor_
            else:
                ridge = regressor_step
        except ImportError:
            ridge = regressor_step

        # 4. Extract feature names and coefficients
        feature_names = ct_step.get_feature_names_out()
        coef = ridge.coef_  # shape (n_features,)

        if X_processed.shape[1] != len(coef):
            return []

        x_vec = np.asarray(X_processed[0])
        log_contributions = coef * x_vec       
        total_log = log_contributions.sum()

        if total_log == 0:
            return []

        price_contributions = predicted_price * (log_contributions / total_log)

        drivers = [
            {"feature": str(feature_names[i]), "contribution_eur": round(float(price_contributions[i]), 2)}
            for i in range(len(feature_names))
            if price_contributions[i] > 0
        ]
        drivers.sort(key=lambda d: d["contribution_eur"], reverse=True)
        return drivers[:top_n]

    except Exception:
        return []


MODEL_RMSE = 328.90

@app.get("/")
def root():
    return {"service": "Laptop Price Estimator API", "status": "running"}

@app.get("/health")
def health_check():
    return {"status": "healthy"}

@app.post("/predict")
async def predic_price(data: LaptopInput, background_tasks: BackgroundTasks):
    try:
        input_data = pd.DataFrame([data.model_dump()])

        pred_log = model_pipeline.predict(input_data)
        real_price = float(pred_log[0])

        lower_bound = round(max(real_price - MODEL_RMSE, 0), 2)
        upper_bound = round(real_price + MODEL_RMSE, 2)

        top_drivers = _get_top_drivers(model_pipeline, input_data, real_price)

        background_tasks.add_task(
            log_prediction,
            input_params        = data.model_dump(),
            predicted_price_eur = round(real_price, 2),
            lower_bound         = lower_bound,
            upper_bound         = upper_bound,
            top_drivers         = top_drivers,
        )

        return {
            "status": "success",
            "predicted_price": round(real_price, 2),
            "lower_bound": lower_bound,
            "upper_bound": upper_bound,
            "top_drivers": top_drivers,
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"internal model error {str(e)}")


@app.get("/metadata")
async def get_metadata():
    if _metadata_cache is None:
        raise HTTPException(status_code=503, detail="Metadata not available: dataset failed to load")
    return _metadata_cache


