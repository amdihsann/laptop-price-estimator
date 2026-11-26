# Laptop Price Estimator

![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![FastAPI](https://img.shields.io/badge/FastAPI-Python%203.11-009688?logo=fastapi&logoColor=white)
![Scikit-Learn](https://img.shields.io/badge/Scikit--Learn-Ridge%20Regression-F7931E?logo=scikitlearn&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Supabase-4169E1?logo=postgresql&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white)

**Laptop Price Estimator** is an end-to-end, full-stack machine learning web application that predicts laptop market prices based on hardware specifications. Built with a three-tier microservice architecture, the application pairs a responsive Next.js frontend with a containerized FastAPI inference engine and PostgreSQL telemetry logging.

---

## Live Deployment

* **Frontend Application (Vercel):** [https://laptop-price-estimator-rho.vercel.app](https://laptop-price-estimator-rho.vercel.app)
* **Backend API & Swagger Docs (SnapDeploy):** [https://laptop-price-estimator-254ea.containers.snapdeploy.app/docs](https://laptop-price-estimator-254ea.containers.snapdeploy.app/docs)

> **Note on Cold Starts:** The backend container runs on SnapDeploy's free tier and automatically enters sleep mode after 15 minutes of inactivity. On the first request after an idle period, the frontend automatically displays a progressive wake-up timer (~30–60 seconds) until the ML inference server is ready.

---

## Key Features

* **Machine Learning Price Valuation:** Predicts laptop market prices using a trained **Ridge Regression** pipeline (`RMSE: €328.90`), displaying both a point estimate and a confidence interval (**Floor** and **Ceiling** bounds).
* **Micro-XAI Feature Attribution:** Breaks down the top hardware contributors (`top_drivers`) driving each individual prediction, visualized with proportional contribution bars.
* **Smart Cascading Hardware Filters:** Dynamically filters compatible laptop types, processors (CPU), graphics cards (GPU), and operating systems based on the selected brand (`Company`).
* **Dual-Currency Formatting:** Displays predicted valuations and feature impacts in **Indonesian Rupiah (IDR)** alongside the baseline **Euro (EUR)** valuation.
* **Cold-Start Resilience:** Implements progressive server wake-up detection with an elapsed-time indicator and one-click retry handling for seamless free-tier cloud hosting.
* **Automated Prediction Logging:** Persists every inference request and its predicted output into a PostgreSQL database (`prediction_logs`) via SQLAlchemy.

---

## System Architecture

```text
┌───────────────────────────┐       HTTPS / JSON        ┌────────────────────────────────┐
│   Next.js 16 Frontend     │ ────────────────────────► │   FastAPI Backend (Docker)     │
│   (Hosted on Vercel)      │ ◄──────────────────────── │   (Hosted on SnapDeploy)       │
└───────────────────────────┘   Metadata & Predictions  │                                │
                                                        │  • Ridge Regression (.joblib)  │
                                                        │  • Dataset Metadata (.csv)     │
                                                        └───────────────┬────────────────┘
                                                                        │ SQLAlchemy / psycopg2
                                                                        ▼
                                                        ┌────────────────────────────────┐
                                                        │   PostgreSQL Database          │
                                                        │   (Supabase Session Pooler)    │
                                                        │   • Table: prediction_logs     │
                                                        └────────────────────────────────┘
```

---

## Tech Stack

| Layer | Technologies |
| :--- | :--- |
| **Frontend** | Next.js 16 (App Router), React 19, Tailwind CSS v4 |
| **Backend & ML** | Python 3.11, FastAPI, Uvicorn, Scikit-Learn, Pandas, Joblib |
| **Database & ORM** | PostgreSQL 15, SQLAlchemy, Psycopg2, Supabase |
| **DevOps & Hosting** | Docker, Docker Compose, Vercel, SnapDeploy |

---

## Project Structure

```text
laptop-price-estimator/
├── backend/
│   ├── Dockerfile                 # Production container image for FastAPI
│   ├── main.py                    # API routes, CORS middleware, ML inference & XAI logic
│   ├── database.py                # SQLAlchemy engine, session management & ORM models
│   ├── best_ridge_model.joblib    # Pre-trained Scikit-Learn Ridge Regression pipeline
│   ├── laptop_price.csv           # Reference dataset used for metadata & cascading rules
│   └── requirements.txt           # Python dependencies
├── frontend/
│   ├── Dockerfile                 # Production multi-stage Next.js container image
│   ├── next.config.mjs            # Next.js configuration
│   ├── package.json               # Node.js dependencies and scripts
│   └── src/
│       └── app/
│           ├── layout.js          # Root layout and metadata
│           └── page.js            # Main estimator UI, cascading filters & XAI analytics
├── docker-compose.yml             # Multi-container orchestration (Frontend, Backend, DB)
└── README.md
```

---

## Getting Started (Local Development)

### Prerequisites

* **Option 1 (Recommended):** [Docker Desktop](https://www.docker.com/products/docker-desktop/)
* **Option 2 (Manual):** Python 3.11+ and Node.js 20+

---

### Option 1: Run Full Stack with Docker Compose

1. **Clone the repository:**
   ```bash
   git clone https://github.com/amdihsann/laptop-price-estimator.git
   cd laptop-price-estimator
   ```

2. **Configure environment variables:**
   Create a `.env` file in the root directory (or configure `docker-compose.yml` defaults):
   ```env
   POSTGRES_USER=postgres
   POSTGRES_PASSWORD=postgres
   POSTGRES_DB=laptopdb
   ```

3. **Build and start all containers:**
   ```bash
   docker compose up --build
   ```

4. **Access the services:**
   * **Frontend:** `http://localhost:3000`
   * **Backend Swagger UI:** `http://localhost:8000/docs`
   * **PostgreSQL:** Internal container `db` on port `5432`

---

### Option 2: Run Manually Without Docker

#### 1. Start the Backend (FastAPI)
```bash
cd backend
python -m venv venv

# Activate virtual environment
# Windows (PowerShell):
.\venv\Scripts\Activate.ps1
# macOS / Linux:
source venv/bin/activate

pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

#### 2. Start the Frontend (Next.js)
Open a new terminal window:
```bash
cd frontend
npm install
npm run dev
```
Open `http://localhost:3000` in your browser.

---

## Environment Variables

| Variable | Service | Description | Example |
| :--- | :--- | :--- | :--- |
| `DATABASE_URL` | Backend | PostgreSQL connection string (`postgresql+psycopg2://...`). Use Supabase's IPv4 Session Pooler URI in cloud environments. | `postgresql+psycopg2://postgres:pass@host:5432/postgres` |
| `FRONTEND_URL` | Backend | Comma-separated list of allowed frontend origins for CORS. | `https://laptop-price-estimator-rho.vercel.app` |
| `NEXT_PUBLIC_API_URL` | Frontend | Public base URL of the FastAPI backend (no trailing slash). | `https://laptop-price-estimator-254ea.containers.snapdeploy.app` |

---

## API Reference

### `GET /metadata`
Returns unique hardware options (`Company`, `TypeName`, `Cpu`, `Gpu`, `OpSys`) and brand-specific dependency mappings for cascading dropdowns.

### `POST /predict`
Generates a laptop price prediction, confidence range, and top feature contributions, then logs the transaction to PostgreSQL.

**Sample Request Body:**
```json
{
  "laptop_ID": 0,
  "Company": "Apple",
  "Product": "MacBook Pro 14",
  "TypeName": "Ultrabook",
  "Inches": 14.2,
  "ScreenResolution": "3024x1964",
  "Cpu": "Intel Core i7 2.8GHz",
  "Ram": 16,
  "Memory": "512GB SSD",
  "Gpu": "Intel Iris Plus Graphics 655",
  "OpSys": "macOS",
  "Weight": 1.37
}
```

**Sample Response:**
```json
{
  "predicted_price": 1845.5,
  "lower_bound": 1516.6,
  "upper_bound": 2174.4,
  "top_drivers": [
    {
      "feature": "num__Ram",
      "contribution_eur": 412.3
    },
    {
      "feature": "cat__Company_Apple",
      "contribution_eur": 289.1
    }
  ]
}
```

---

## License

This project is open-source and available under the [MIT License](LICENSE).