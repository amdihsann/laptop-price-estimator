from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from pathlib import Path

import joblib
import pandas as pd
import re


from sklearn.base import BaseEstimator, TransformerMixin

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

model_pipeline = None

MODEL_PATH = Path(__file__).parent / "best_ridge_model.joblib"

try:
    model_pipeline = joblib.load(MODEL_PATH)
    print("berhasil")
except Exception as e:
    print(f"Error loading model {e}")

app = FastAPI(title="Laptop Price API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], #saat di deploy nanti ganti dengan url domain
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"]
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


@app.post("/predict")
async def predic_price(data: LaptopInput):
    try:
        input_data = pd.DataFrame([data.model_dump()])

        pred_log = model_pipeline.predict(input_data)

        real_price = float(pred_log[0])

        return {
            "status": "success",
            "predicted_price": real_price
        }
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"internal model error {str(e)}")
