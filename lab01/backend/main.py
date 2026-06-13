import os
import random
import string
import sqlite3
from contextlib import asynccontextmanager
from urllib.parse import urlparse

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, field_validator

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

DB_PATH = os.getenv("DB_PATH", "urls.db")
BASE_URL = os.getenv("BASE_URL", "http://localhost:8000")
CODE_LENGTH = 6


# ---------------------------------------------------------------------------
# DB helpers
# ---------------------------------------------------------------------------

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    with get_db() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS urls (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                short_code  TEXT    NOT NULL UNIQUE,
                original_url TEXT   NOT NULL UNIQUE,
                created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                clicks      INTEGER DEFAULT 0
            )
            """
        )
        conn.commit()


def generate_code() -> str:
    chars = string.ascii_letters + string.digits
    return "".join(random.choices(chars, k=CODE_LENGTH))


# ---------------------------------------------------------------------------
# Lifespan
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------

app = FastAPI(title="URL Shortener API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class ShortenRequest(BaseModel):
    url: str

    @field_validator("url")
    @classmethod
    def validate_url(cls, v: str) -> str:
        parsed = urlparse(v)
        if parsed.scheme not in ("http", "https"):
            raise ValueError("URL must start with http:// or https://")
        if not parsed.netloc:
            raise ValueError("URL must have a valid domain")
        return v


class ShortenResponse(BaseModel):
    short_code: str
    short_url: str
    original_url: str


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/shorten", response_model=ShortenResponse)
def shorten(body: ShortenRequest):
    with get_db() as conn:
        # Return existing code if URL already shortened
        row = conn.execute(
            "SELECT short_code FROM urls WHERE original_url = ?",
            (body.url,),
        ).fetchone()

        if row:
            short_code = row["short_code"]
        else:
            # Generate a unique code
            for _ in range(10):
                code = generate_code()
                exists = conn.execute(
                    "SELECT 1 FROM urls WHERE short_code = ?", (code,)
                ).fetchone()
                if not exists:
                    short_code = code
                    break
            else:
                raise HTTPException(status_code=500, detail="Could not generate unique code")

            conn.execute(
                "INSERT INTO urls (short_code, original_url) VALUES (?, ?)",
                (short_code, body.url),
            )
            conn.commit()

    return ShortenResponse(
        short_code=short_code,
        short_url=f"{BASE_URL}/{short_code}",
        original_url=body.url,
    )


@app.get("/{short_code}")
def redirect(short_code: str):
    from fastapi.responses import RedirectResponse

    with get_db() as conn:
        row = conn.execute(
            "SELECT original_url FROM urls WHERE short_code = ?",
            (short_code,),
        ).fetchone()

        if not row:
            raise HTTPException(status_code=404, detail="Short URL not found")

        conn.execute(
            "UPDATE urls SET clicks = clicks + 1 WHERE short_code = ?",
            (short_code,),
        )
        conn.commit()

    return RedirectResponse(url=row["original_url"], status_code=302)
