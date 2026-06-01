from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routes.filings import router

app = FastAPI(
    title="SEC 10-K Research Dashboard API",
    version="1.0.0",
    description="Search and analyze SEC 10-K filings"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router, prefix="/api")


@app.get("/")
async def root():
    return {"status": "ok", "message": "SEC 10-K Dashboard API"}


@app.get("/health")
async def health():
    return {"status": "healthy"}
