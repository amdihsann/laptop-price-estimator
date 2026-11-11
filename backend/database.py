import os
from datetime import datetime, timezone

from sqlalchemy import create_engine, Column, Integer, Float, DateTime, JSON
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from dotenv import load_dotenv

load_dotenv()

_raw_url = os.getenv("DATABASE_URL", "")

# Normalise to the psycopg2 driver dialect so SQLAlchemy never falls back to psycopg v3
if _raw_url.startswith("postgres://"):
    _raw_url = _raw_url.replace("postgres://", "postgresql+psycopg2://", 1)
elif _raw_url.startswith("postgresql://"):
    _raw_url = _raw_url.replace("postgresql://", "postgresql+psycopg2://", 1)

DATABASE_URL = _raw_url


class Base(DeclarativeBase):
    pass


class PredictionLog(Base):
    __tablename__ = "prediction_logs"

    id                  = Column(Integer, primary_key=True, index=True)
    timestamp           = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    input_params        = Column(JSON, nullable=False)
    predicted_price_eur = Column(Float, nullable=False)
    lower_bound         = Column(Float, nullable=False)
    upper_bound         = Column(Float, nullable=False)
    top_drivers         = Column(JSON, nullable=True)


# Engine and session are None when DATABASE_URL is not configured.
engine         = None
SessionLocal   = None

if DATABASE_URL:
    engine       = create_engine(DATABASE_URL, pool_pre_ping=True)
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def init_db() -> None:
    """Create tables if the database is configured. Safe to call at startup."""
    if engine is None:
        print("DATABASE_URL not set — prediction logging disabled.")
        return
    try:
        Base.metadata.create_all(bind=engine)
        print("Database tables ready.")
    except Exception as exc:
        print(f"Database init error (logging will be disabled): {exc}")


def log_prediction(
    input_params: dict,
    predicted_price_eur: float,
    lower_bound: float,
    upper_bound: float,
    top_drivers: list,
) -> None:
    """Insert one prediction log row. Swallows all errors so it never crashes the API."""
    if SessionLocal is None:
        return
    try:
        with SessionLocal() as session:
            record = PredictionLog(
                input_params        = input_params,
                predicted_price_eur = predicted_price_eur,
                lower_bound         = lower_bound,
                upper_bound         = upper_bound,
                top_drivers         = top_drivers,
            )
            session.add(record)
            session.commit()
    except Exception as exc:
        print(f"Prediction logging error (response unaffected): {exc}")
