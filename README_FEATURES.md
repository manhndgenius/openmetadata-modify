# Data Quality Rule Recommender - System Documentation

**Version:** 2.0  
**Last Updated:** 2026-10-13  
**Repository:** `dq-rule-recommender-openmetadata`

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Architecture](#2-architecture)
3. [Features](#3-features)
4. [API Endpoints](#4-api-endpoints)
5. [Database Schema](#5-database-schema)
6. [OpenMetadata Integration](#6-openmetadata-integration)
7. [Rule Engines](#7-rule-engines)
8. [Quick Start](#8-quick-start)
9. [Configuration](#9-configuration)
10. [Development Guide](#10-development-guide)

---

## 1. System Overview

### 1.1 Purpose

**Data Quality Rule Recommender** là hệ thống web application giúp:

- Khám phá schema và profiling của các bảng dữ liệu
- Tự động sinh đề xuất Data Quality (DQ) rules dựa trên nhiều phương pháp
- Hỗ trợ duyệt (Accept/Edit/Reject) và xuất bản rules lên OpenMetadata
- Theo dõi chất lượng dữ liệu (Data Observability)

### 1.2 Key Concepts

| Term | Description |
|------|-------------|
| **TableContext** | Object chứa schema, columns, profiling data của một table |
| **CandidateRule** | Rule được đề xuất, chưa được duyệt |
| **Basic Rule** | Rule heuristic-based: NOT NULL, UNIQUE, IN_SET, RANGE... |
| **Advanced Rule** | Rule LLM-generated: TEMPORAL, CROSS_COLUMN, CONDITIONAL_DEPENDENCY |
| **Statistical Rule** | Rule statistical-based: Mean, Median, StdDev, Min, Max |
| **NT Rule** | Governance rules (NT1-NT16): TableNaming, ColumnNaming, AuditColumns... |

---

## 2. Architecture

### 2.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Frontend (React)                         │
│  ┌──────────┐ ┌──────────────┐ ┌────────────┐ ┌──────────────┐  │
│  │ Schema   │ │ Recommendation│ │ Observab. │ │ Publish      │  │
│  │ Explorer │ │ Board        │ │ View      │ │ Bar          │  │
│  └──────────┘ └──────────────┘ └────────────┘ └──────────────┘  │
└───────────────────────────────┬─────────────────────────────────┘
                                │ REST API
┌───────────────────────────────┴─────────────────────────────────┐
│                         Backend (FastAPI)                       │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                    API Routes                            │   │
│  │  routes_datasource │ routes_recommendation │ routes_*  │   │
│  └──────────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                    Rule Engines                          │   │
│  │  BasicEngine │ AdvancedEngine │ StatisticalEngine │ NT │   │
│  └──────────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                    Integrations                          │   │
│  │  OpenMetadata Client │ SQL Mapper │ LLM Client          │   │
│  └──────────────────────────────────────────────────────────┘   │
└───────────────────────────────┬─────────────────────────────────┘
                                │
        ┌───────────────────────┼───────────────────────┐
        ▼                       ▼                       ▼
┌───────────────┐     ┌─────────────────┐     ┌─────────────────┐
│ OpenMetadata  │     │ LLM Provider    │     │ Application     │
│ (PostgreSQL)  │     │ (DeepSeek)      │     │ DB (SQLite)     │
└───────────────┘     └─────────────────┘     └─────────────────┘
```

### 2.2 Project Structure

```
dq-rule-recommender-openmetadata/
├── backend/
│   ├── main.py                    # FastAPI app entry point
│   ├── api/
│   │   └── router/
│   │       ├── routes_datasource.py      # Catalog APIs
│   │       ├── routes_context.py         # Table context
│   │       ├── routes_recommendation.py  # Generate rules
│   │       ├── routes_review.py           # Accept/Edit/Reject
│   │       ├── routes_evaluation.py       # Benchmark evaluation
│   │       ├── routes_advanced_rules.py   # Advanced LLM rules
│   │       ├── routes_statistical_rules.py# Statistical rules
│   │       └── routes_test_cases.py       # NT test cases
│   ├── contracts/
│   │   ├── table_context.py       # TableContext dataclass
│   │   ├── candidate_rule.py     # CandidateRule model
│   │   └── advanced_rule.py      # Advanced rule models
│   ├── engine/
│   │   ├── basic_engine.py       # Heuristic rules
│   │   ├── advanced_engine.py    # LLM-based rules
│   │   ├── advanced_llm/        # LLM generators
│   │   │   ├── temporal_generator.py
│   │   │   ├── cross_column_generator.py
│   │   │   └── conditional_dependency_generator.py
│   │   ├── statistical_rules/    # Statistical rules
│   │   │   ├── prefilter.py
│   │   │   ├── llm_reviewer.py
│   │   │   └── service.py
│   │   └── sql_mapper/           # SQL generation
│   │       ├── mapper.py
│   │       └── sql_renderer.py
│   ├── integrations/
│   │   └── openmetadata/         # OpenMetadata client
│   │       └── client.py
│   └── config/
│       └── settings.py
├── frontend/
│   └── src/
│       ├── components/
│       │   ├── schema/           # Schema viewer
│       │   ├── recommendation/  # Rule recommendation UI
│       │   ├── observability/     # Data observability
│       │   └── ...
│       ├── services/
│       │   └── openmetadataService.js
│       └── App.jsx
├── scripts/
│   ├── create_test_definitions.py    # Create NT definitions
│   └── update_nt_sql_expressions.py  # Update NT SQL
└── doc/
    └── README_FEATURES.md            # This file
```

---

## 3. Features

### 3.1 Basic Rules Engine

**Heuristic-based rules** được sinh tự động dựa trên:

- Column data type
- Null ratio
- Cardinality (distinct count)
- Naming patterns
- Sample values

**Supported Basic Rule Types:**

| Rule Type | Description | Example |
|-----------|-------------|---------|
| `NOT_NULL` | Column không được null | `email NOT NULL` |
| `IS_UNIQUE` | Giá trị duy nhất | `ssn IS UNIQUE` |
| `VALUE_IN_SET` | Giá trị thuộc danh sách cho phép | `status IN ('A','I')` |
| `VALUE_LENGTH_BETWEEN` | Độ dài giá trị | `zipcode LENGTH 5-10` |
| `ROW_COUNT_BETWEEN` | Số dòng trong khoảng | `COUNT 1000-10000` |
| `DISTINCT_RATIO` | Tỷ lệ distinct | `DISTINCT > 0.9` |

### 3.2 Advanced Rules Engine

**LLM-powered rules** phân tích semantic của dữ liệu:

| Rule Type | Description | Example |
|-----------|-------------|---------|
| `TEMPORAL` | Ràng buộc thời gian | `death_date >= birth_date` |
| `CROSS_COLUMN` | Ràng buộc liên cột | `end_date >= start_date` |
| `CONDITIONAL_DEPENDENCY` | Phụ thuộc có điều kiện | `if type='C' then qty>0` |
| `SEMANTIC_FORMAT` | Format semantic | `email format, phone format` |

### 3.3 Statistical Rules Engine

**Statistical monitoring rules** đề xuất bởi LLM:

| Rule Type | Metric | Use Case |
|-----------|--------|----------|
| `mean` | columnValueMeanToBeBetween | Average expense monitoring |
| `median` | columnValueMedianToBeBetween | Typical value tracking |
| `stddev` | columnValueStdDevToBeBetween | Variability detection |
| `min` | columnValueMinToBeBetween | Extreme low detection |
| `max` | columnValueMaxToBeBetween | Extreme high detection |

**Pipeline:**
```
TableContext + Profiling
        ↓
    Pre-filter (hard criteria)
        ↓
    LLM Review (business relevance)
        ↓
    Statistical Recommendations
```

### 3.4 NT Governance Rules

**15 Standard Governance Rules** cho data quality:

| ID | Name | Description |
|----|------|-------------|
| NT1 | TableNaming | Table name theo snake_case |
| NT2 | ColumnNaming | Column name theo snake_case |
| NT3 | BooleanNaming | Boolean columns bắt đầu `is_/has_/can_` |
| NT4 | AuditColumns | Có đủ audit columns |
| NT5 | DateTimeColumns | Datetime columns đúng type |
| NT6 | SoftDelete | Hỗ trợ soft delete |
| NT7 | TableComment | Có description |
| NT8 | PrimaryKeyStandard | PK đúng chuẩn |
| NT9 | PrimaryKeyMissing | Có Primary Key |
| NT10 | ColumnDescription | Columns có mô tả |
| NT11 | TableTooWide | Số columns ≤ 50 |
| NT12 | DomainOwner | Có Domain & Owner |
| NT13 | NullableRate | Tỷ lệ nullable ≤ 50% |
| NT14 | BusinessKey | Có business key |
| NT16 | DuplicateTable | Không trùng tên trong schema |

### 3.5 Data Observability

Theo dõi 5 chiều chất lượng dữ liệu (DAMA standards):

1. **Completeness** - Tỷ lệ null, missing data
2. **Uniqueness** - Tỷ lệ duplicate
3. **Validity** - Format, range, constraints
4. **Timeliness** - Freshness, độ trễ dữ liệu
5. **Consistency** - Cross-field, cross-table validation

---

## 4. API Endpoints

### 4.1 Catalog APIs

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/catalog/services` | List database services |
| GET | `/catalog/databases` | List databases |
| GET | `/catalog/schemas` | List schemas |
| GET | `/catalog/tables` | List tables in schema |
| GET | `/catalog/tables/{id}` | Get table detail |

### 4.2 Context APIs

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/context/{table_name}` | Get TableContext (schema + profiling) |
| GET | `/context/{table_name}/columns` | Get column details |
| GET | `/context/{table_name}/profile` | Get profiling data |

### 4.3 Recommendation APIs

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/recommendations/generate` | Generate Basic + Advanced rules |
| GET | `/advanced-rules/saved` | Get saved Advanced Rules |
| POST | `/advanced-rules/recommend` | Generate LLM-based rules |
| POST | `/rules/{id}/review` | Accept/Edit/Reject rule |
| POST | `/rules/publish` | Publish rules to OpenMetadata |

### 4.4 Statistical Rules APIs

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/recommendations/statistical/generate` | Generate statistical rules |

### 4.5 Test Cases APIs

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/tables/test-definitions` | List NT test definitions |
| POST | `/tables/{fqn}/test-cases/default` | Create default test cases |
| GET | `/tables/{fqn}/test-cases` | Get table's test cases |

### 4.6 Evaluation APIs

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/evaluation/summary` | Get benchmark evaluation |
| GET | `/evaluation/rules/{id}/history` | Rule evaluation history |

---

## 5. Database Schema

### 5.1 SQLite Application DB

```sql
-- Recommendation runs
CREATE TABLE recommendation_runs (
    id TEXT PRIMARY KEY,
    table_name TEXT NOT NULL,
    engine TEXT NOT NULL,  -- 'BASIC', 'ADVANCED', 'STATISTICAL'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    rules_count INTEGER
);

-- Candidate rules
CREATE TABLE candidate_rules (
    id TEXT PRIMARY KEY,
    run_id TEXT,
    column_name TEXT NOT NULL,
    rule_type TEXT NOT NULL,
    parameters TEXT,  -- JSON
    sql TEXT,
    confidence REAL,
    engine TEXT NOT NULL,
    status TEXT DEFAULT 'PENDING',  -- PENDING, ACCEPTED, REJECTED
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (run_id) REFERENCES recommendation_runs(id)
);

-- Review history
CREATE TABLE review_history (
    id TEXT PRIMARY KEY,
    rule_id TEXT NOT NULL,
    action TEXT NOT NULL,  -- ACCEPT, EDIT, REJECT
    old_parameters TEXT,
    new_parameters TEXT,
    reviewed_by TEXT,
    reviewed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (rule_id) REFERENCES candidate_rules(id)
);
```

---

## 6. OpenMetadata Integration

### 6.1 Connection

Cấu hình trong `backend/.env`:

```env
OM_API=https://c3-app-009.duckdns.org/api/v1
OM_TOKEN=<jwt_token>
```

### 6.2 Features

- **Table Context**: Lấy schema, columns, descriptions từ OpenMetadata
- **Profiling Data**: Lấy statistics (null_count, distinct_count, min/max...)
- **Publish Rules**: Xuất bản Test Cases lên OpenMetadata Data Quality
- **Test Definitions**: CRUD 15 NT governance rules

### 6.3 Test Case Payload

```json
{
  "name": "dq_default_NT1_TableNaming_abc123",
  "displayName": "NT1_TableNaming - patients",
  "testDefinition": "NT1_TableNaming",
  "entityLink": "<#E::table::healthcare_postgres.HealthCare.public.patients>",
  "parameterValues": [
    {"name": "sqlExpression", "value": "SELECT ..."},
    {"name": "strategy", "value": "ROWS"},
    {"name": "operator", "value": "<="},
    {"name": "threshold", "value": "0"}
  ]
}
```

---

## 7. Rule Engines

### 7.1 Basic Engine Flow

```
Input: TableContext (columns + profiling)
        ↓
Heuristic Analysis per Column:
  - Check data type → suggest appropriate rules
  - Check null ratio → NOT_NULL if low
  - Check cardinality → IS_UNIQUE if high
  - Check naming → semantic type detection
        ↓
Generate CandidateRules with:
  - rule_type
  - parameters
  - confidence score
  - sql predicate
        ↓
Output: List[CandidateRule]
```

### 7.2 Advanced Engine Flow

```
Input: TableContext
        ↓
LLM Analysis (prompt-based):
  - Analyze table description
  - Analyze column semantics
  - Identify cross-column relationships
  - Generate temporal/conditional rules
        ↓
SQL Generation:
  - Map rule to SQL predicate
  - Validate SQL syntax
        ↓
Output: List[CandidateRule] with SQL
```

### 7.3 Statistical Engine Flow

```
Input: TableContext + Profiling
        ↓
Pre-filter (hard criteria):
  - Numeric columns only
  - Exclude: PK, FK, low row_count
  - Exclude: constant columns (stddev=0)
        ↓
LLM Review (business relevance):
  - Group by column
  - Compact JSON input
  - DECISION: RECOMMEND / SKIP / UNCERTAIN
        ↓
Output: Statistical Recommendations
```

---

## 8. Quick Start

### 8.1 Prerequisites

- Python 3.11+
- Node.js 18+
- OpenMetadata server running

### 8.2 Backend Setup

```bash
cd backend

# Install dependencies
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env with your OM credentials

# Start server
uvicorn main:app --reload --port 8000
```

### 8.3 Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Start dev server
npm run dev
```

### 8.4 Access

- Frontend: http://localhost:5173
- Backend API: http://localhost:8000/api/v1
- API Docs: http://localhost:8000/docs

---

## 9. Configuration

### 9.1 Backend Environment (.env)

```env
# App
APP_ENV=development
API_PREFIX=/api/v1

# OpenMetadata
OM_API=https://your-om-server.com/api/v1
OM_TOKEN=your_jwt_token

# LLM
LLM_API=sk-your-api-key
LLM_BASE_URL=https://api.deepseek.com
LLM_MODEL=deepseek-v4-flash

# Heuristic Thresholds
UNIQUE_THRESHOLD=0.99
MAX_ALLOWED_CARDINALITY=20
MIN_ROW_COUNT_FOR_RULES=1
```

### 9.2 Frontend Config

```javascript
// frontend/src/services/openmetadataService.js
const API_BASE = 'http://localhost:8000/api/v1';
```

---

## 10. Development Guide

### 10.1 Adding a New Rule Type

1. **Define rule type** in `contracts/rule_type.py`:
```python
class RuleType(str, Enum):
    NEW_RULE = "new_rule"
```

2. **Implement generator** in `engine/basic_engine.py`:
```python
def _generate_new_rule(self, column: ColumnContext) -> Optional[CandidateRule]:
    # Logic here
    pass
```

3. **Add SQL mapper** in `engine/sql_mapper/mapper.py`:
```python
elif rule_type == RuleType.NEW_RULE:
    sql = f"SELECT * FROM {table} WHERE {predicate}"
```

### 10.2 Adding a New API Endpoint

1. **Create route file** in `backend/api/router/`:
```python
# routes_new_feature.py
from fastapi import APIRouter

router = APIRouter(prefix="/new-feature", tags=["new-feature"])

@router.get("/")
async def get_new_feature():
    return {"data": []}
```

2. **Register router** in `backend/main.py`:
```python
from backend.api.router.routes_new_feature import router as new_feature_router

app.include_router(new_feature_router)
```

### 10.3 Adding NT Test Definition

1. **Add SQL template** in `backend/engine/nt_sql_templates.py`:
```python
NT_SQL_TEMPLATES = {
    "NT17_NewRule": """
SELECT column_name
FROM information_schema.columns
WHERE ...
"""
}
```

2. **Update OpenMetadata**:
```bash
python scripts/update_nt_sql_expressions.py
```

### 10.4 Testing

```bash
# Backend tests
cd backend
pytest tests/ -v

# Run specific test
pytest tests/test_basic_engine.py -v

# Integration test
python scripts/test_statistical_pipeline.py --table patients --llm
```

---

## Appendix A: Glossary

| Term | Definition |
|------|------------|
| FQN | Fully Qualified Name (e.g., `database.schema.table`) |
| DQ | Data Quality |
| ETL | Extract, Transform, Load |
| LLM | Large Language Model |
| SQL | Structured Query Language |
| API | Application Programming Interface |
| CRUD | Create, Read, Update, Delete |

## Appendix B: Useful Commands

```bash
# Start backend
uvicorn backend.main:app --reload --port 8000

# Start frontend
cd frontend && npm run dev

# Run test pipeline
PYTHONPATH=backend python scripts/test_statistical_pipeline.py --table patients --llm

# Update NT definitions
python scripts/update_nt_sql_expressions.py

# Create test definitions
python scripts/create_test_definitions.py --dry-run
```

## Appendix C: Troubleshooting

### OpenMetadata Connection Failed
```bash
# Check OM server
curl https://your-om-server.com/api/v1/system/version

# Check token
# Verify OM_TOKEN in .env is valid
```

### LLM API Error
```bash
# Check API key
echo $LLM_API

# Test LLM connection
curl -X POST $LLM_BASE_URL/chat/completions \
  -H "Authorization: Bearer $LLM_API" \
  -d '{"model":"deepseek-v4-flash","messages":[{"role":"user","content":"hi"}]}'
```

### Frontend Not Loading
```bash
# Check API connection
curl http://localhost:8000/api/v1/health

# Check CORS settings in main.py
```

---

*Document generated: 2026-10-13*
