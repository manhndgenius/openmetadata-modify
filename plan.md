# Security Fix Plan - dq-rule-recommender-openmetadata

## Context
Phòng security sẽ scan code trước khi merge. Cần fix các lỗi bảo mật cơ bản.

## Changes

### 1. Tạo `.env.example` (P0)
**File:** `dq-rule-recommender-openmetadata/backend/.env.example`

Template với placeholder values, không có secret thật:
```
# OpenMetadata
OM_API=https://your-openmetadata-server.com
OM_TOKEN=your-jwt-token-here

# LLM Provider
LLM_API=your-llm-api-key-here
LLM_MODEL=deepseek-v3

# Database
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_USER=postgres
POSTGRES_PASSWORD=  # REQUIRED - set actual password
POSTGRES_DB=dq_rules
```

### 2. Fix CORS (P0)
**File:** `backend/main.py`

```python
# THAY ĐỔI:
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],           # XÓA
    allow_credentials=True,        # XÓA
    allow_methods=["*"],
    allow_headers=["*"],
)

# THÀNH:
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",   # Dev
        "https://your-frontend-domain.com",  # Prod - THAY ĐỔI
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)
```

### 3. Fix hardcoded password defaults (P0)
**File:** `backend/config/settings.py`

```python
# THAY ĐỔI:
postgres_password: str = os.getenv("POSTGRES_PASSWORD", "postgres")

# THÀNH:
postgres_password: str = os.getenv("POSTGRES_PASSWORD", "")  # Không default
# Thêm validation:
if not postgres_password:
    raise ValueError("POSTGRES_PASSWORD environment variable is required")
```

### 4. Fix dev server binding (P1)
**File:** `backend/main.py`

```python
# THAY ĐỔI (line 59):
uvicorn.run("backend.main:app", host="0.0.0.0", port=8000, reload=True)

# THÀNH:
uvicorn.run("backend.main:app", host="127.0.0.1", port=8000, reload=settings.app_env == "development")
```

### 5. Cập nhật .gitignore (P1)
**File:** `dq-rule-recommender-openmetadata/.gitignore`

Thêm:
```
# Backend secrets
backend/.env
backend/.env.local
backend/.env.production
```

## Verification
1. `git status` - không có `.env` tracked
2. Chạy app, verify CORS error khi gọi từ origin khác
3. Verify app fail startup khi `POSTGRES_PASSWORD` không set
