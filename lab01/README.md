# Lab 01 — URL Shortener

## Stack
| Layer | Tech |
|-------|------|
| Backend | Python 3.11 + FastAPI + SQLite |
| Frontend | TypeScript + Next.js 14 |
| Deploy Backend | Railway |
| Deploy Frontend | Vercel |

---

## Run locally

### Backend
```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
uvicorn main:app --reload
# API available at http://localhost:8000
```

### Frontend
```bash
cd frontend
npm install
cp .env.example .env.local
# Edit .env.local and set NEXT_PUBLIC_API_URL=http://localhost:8000
npm run dev
# App available at http://localhost:3000
```

---

## Deploy

### Backend → Railway
1. Push this repo to GitHub
2. Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub repo
3. Select the `lab01/backend` directory (root directory setting)
4. Add environment variable: `BASE_URL=https://<your-railway-url>`
5. Railway detects `railway.toml` and deploys automatically

### Frontend → Vercel
1. Go to [vercel.com](https://vercel.com) → New Project → Import Git repo
2. Set **Root Directory** to `lab01/frontend`
3. Add environment variable: `NEXT_PUBLIC_API_URL=https://<your-railway-url>`
4. Deploy

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/shorten` | Shorten a URL |
| GET | `/{short_code}` | Redirect to original URL |
| GET | `/health` | Health check |

### Example
```bash
curl -X POST http://localhost:8000/shorten \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.google.com/search?q=fastapi"}'
```
