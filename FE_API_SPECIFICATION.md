# Backend API Specification cho Frontend Team

**Version:** 1.0  
**Base URL (Dev):** `http://localhost:8000/api/v1`  
**Base URL (Staging):** `https://<your-server>/api/v1`  
**Auth:** Không cần auth (internal backend)  
**CORS:** Đã enable `*`  
**Date:** 2026-10-13

---

## 1. Tổng quan

Backend cung cấp các API để:
- Lấy danh sách table, schema từ OpenMetadata
- Lấy profiling (statistics) của table
- Sinh Data Quality Rules (Basic + Advanced + Statistical + Regex)
- Review rules (Accept/Edit/Reject)
- Publish rules lên OpenMetadata
- Tạo NT Governance Test Cases

---

## 2. Cấu trúc Response chung

### 2.1 Error Response
```json
{
  "detail": "Error message"
}
```

### 2.2 Success Response
Trả về trực tiếp object/array, không có wrapper thống nhất.

---

## 3. Catalog APIs

### 3.1 Get Health
```http
GET /health
```
**Response:**
```json
{
  "status": "ok",
  "openmetadata_connected": true
}
```

### 3.2 Get Services
```http
GET /catalog/services
```
**Response:**
```json
{
  "services": [
    {
      "name": "healthcare_postgres",
      "fullyQualifiedName": "healthcare_postgres",
      "serviceType": "Postgres"
    }
  ]
}
```

### 3.3 Get Databases
```http
GET /catalog/databases?service=healthcare_postgres
```

**Response:**
```json
{
  "databases": [
    {
      "name": "HealthCare",
      "fullyQualifiedName": "healthcare_postgres.HealthCare"
    }
  ]
}
```

### 3.4 Get Schemas
```http
GET /catalog/schemas?databaseFqn=healthcare_postgres.HealthCare
```

**Response:**
```json
{
  "schemas": [
    {
      "name": "public",
      "fullyQualifiedName": "healthcare_postgres.HealthCare.public"
    }
  ]
}
```

### 3.5 Get Tables
```http
GET /catalog/tables?schemaFqn=healthcare_postgres.HealthCare.public
```

**Response:**
```json
{
  "tables": [
    {
      "name": "patients",
      "fullyQualifiedName": "healthcare_postgres.HealthCare.public.patients",
      "description": "Bảng hồ sơ bệnh nhân",
      "row_count": 8920,
      "columns_count": 15,
      "tier": "Tier 1"
    }
  ]
}
```

### 3.6 Get Table Detail
```http
GET /catalog/tables/{tableIdOrName}?refresh=false
```

**Response:** Xem `getTableContext` bên dưới.

### 3.7 Get Table Context (Schema + Profiling)
```http
GET /context/{tableName}?refresh=false
```

**Response:**
```json
{
  "table_name": "patients",
  "fully_qualified_name": "healthcare_postgres.HealthCare.public.patients",
  "database_name": "HealthCare",
  "schema_name": "public",
  "description": "Bảng hồ sơ bệnh nhân",
  "row_count": 8920,
  "columns": [
    {
      "name": "email",
      "data_type": "VARCHAR(255)",
      "description": "Email bệnh nhân",
      "nullable": false,
      "is_primary_key": false,
      "is_foreign_key": false,
      "profile": {
        "row_count": 8920,
        "null_count": 0,
        "null_ratio": 0.0,
        "distinct_count": 8920,
        "distinct_ratio": 1.0,
        "min_length": 8,
        "max_length": 45
      }
    }
  ]
}
```

### 3.8 Update Table Tier
```http
PUT /tables/{tableName}/tier
```

**Request Body:**
```json
{
  "tier": "Tier 1"  // null | "Tier 1" | "Tier 2" | "Tier 3" | "Tier 4" | "Tier 5"
}
```

**Response:**
```json
{
  "success": true,
  "tier": "Tier 1"
}
```

---

## 4. Recommendation APIs

### 4.1 Generate Rules (Basic + Advanced)
```http
POST /recommendations/generate
```

**Request Body:**
```json
{
  "table_name": "patients",
  "engines": ["BASIC", "ADVANCED"]
}
```

**Response:**
```json
{
  "table_name": "patients",
  "table_fqn": "healthcare_postgres.HealthCare.public.patients",
  "candidates": [
    {
      "id": "rule_abc123",
      "rule_type": "columnValuesToBeNotNull",
      "description": "Cột không được để trống",
      "target_columns": ["ssn"],
      "parameters": {},
      "engine": "BASIC",
      "confidence": 0.95,
      "reason": "...",
      "evidence": {},
      "validation_status": "VALID",
      "status": "DRAFT"
    }
  ],
  "total": 15
}
```

**Supported `rule_type` values:**

| Engine | Rule Type | Mô tả |
|--------|-----------|-------|
| BASIC | `columnValuesToBeNotNull` | Not null |
| BASIC | `columnValuesToBeUnique` | Unique |
| BASIC | `columnValuesToBeBetween` | Value between range |
| BASIC | `columnValuesToBeInSet` | Value in allowed set |
| BASIC | `columnValuesLengthToBeBetween` | String length between |
| BASIC | `columnValuesToMatchRegex` | Match regex (Email, URL, FirstName) |
| BASIC | `tableRowCountToBeBetween` | Row count between |
| ADVANCED | `TEMPORAL` | Date constraints |
| ADVANCED | `CROSS_COLUMN` | Cross-column rules |
| ADVANCED | `CONDITIONAL_DEPENDENCY` | If-then rules |
| STATISTICAL | `columnValueMeanToBeBetween` | Mean |
| STATISTICAL | `columnValueMedianToBeBetween` | Median |
| STATISTICAL | `columnValueStdDevToBeBetween` | StdDev |
| STATISTICAL | `columnValueMinToBeBetween` | Min |
| STATISTICAL | `columnValueMaxToBeBetween` | Max |

### 4.2 Generate Advanced Rules (LLM)
```http
POST /advanced-rules/recommend
```

**Request Body:**
```json
{
  "table_name": "patients",
  "columns": [
    {
      "name": "birth_date",
      "data_type": "DATE",
      "nullable": false,
      "description": "Ngày sinh",
      "profiling": {"row_count": 8920, "null_count": 0}
    }
  ],
  "min_confidence": 0.6
}
```

**Response:**
```json
{
  "table_name": "patients",
  "candidates": [...],
  "rules": [
    {
      "id": "TEMPORAL_adv_1",
      "rule_type": "TEMPORAL",
      "engine": "ADVANCED",
      "sql": "SELECT * FROM \"patients\" WHERE \"death_date\" < \"birth_date\"",
      "violation_predicate": "death_date < birth_date",
      "params": {},
      "conditions": [
        {"column": "death_date", "operator": "<", "value": "birth_date"}
      ],
      "confidence": 0.95,
      "reason": "Ngày mất không được trước ngày sinh"
    }
  ],
  "total_rules_generated": 3,
  "total_sql_mapped": 3,
  "total_sql_failed": 0
}
```

### 4.3 Get Saved Advanced Rules
```http
GET /advanced-rules/saved?table_name=patients
```

### 4.4 Delete Saved Advanced Rules
```http
DELETE /advanced-rules/saved
```

### 4.5 Generate Statistical Rules
```http
POST /recommendations/statistical/generate
```

**Request Body:**
```json
{
  "table_name": "patients",
  "use_llm": true
}
```

**Response:**
```json
{
  "table_name": "patients",
  "candidates": [
    {
      "id": "rule_xyz789",
      "rule_type": "columnValueMeanToBeBetween",
      "target_columns": ["base_cost"],
      "engine": "STATISTICAL",
      "parameters": {"minValue": 100, "maxValue": 10000},
      "confidence": 0.85,
      "reason": "Average cost monitoring"
    }
  ]
}
```

---

## 5. Review APIs

### 5.1 Review Rule (Accept/Edit/Reject)
```http
POST /rules/{ruleId}/review
```

**Request Body:**
```json
{
  "action": "ACCEPT",  // "ACCEPT" | "REJECT" | "EDIT"
  "edited_parameters": {}  // Chỉ cần khi action = "EDIT"
}
```

**Response:**
```json
{
  "success": true,
  "rule_id": "rule_abc123",
  "status": "ACCEPTED"
}
```

### 5.2 Publish Rules to OpenMetadata
```http
POST /rules/publish
```

**Request Body:**
```json
{
  "table_name": "patients",
  "table_fqn": "healthcare_postgres.HealthCare.public.patients",
  "tier": "Tier 1",
  "rules": [
    {
      "id": "rule_abc123",
      "rule_type": "columnValuesToBeNotNull",
      "target_columns": ["ssn"],
      "parameters": {},
      "engine": "BASIC"
    }
  ]
}
```

**Hoặc publish theo IDs:**
```json
{
  "table_name": "patients",
  "table_fqn": "healthcare_postgres.HealthCare.public.patients",
  "rule_ids": ["rule_abc123", "rule_def456"]
}
```

**Response:**
```json
{
  "success": true,
  "published_count": 2,
  "failed_count": 0,
  "published_test_cases": [
    {
      "rule_id": "rule_abc123",
      "test_case_id": "uuid-here",
      "fullyQualifiedName": "healthcare_postgres.HealthCare.public.patients.dq_basic_abc123",
      "status": "SUCCESS"
    }
  ],
  "failed_test_cases": []
}
```

---

## 6. Test Cases APIs (NT Governance)

### 6.1 Get NT Test Definitions
```http
GET /tables/test-definitions
```

**Response:**
```json
{
  "total": 15,
  "data": [
    {
      "name": "NT1_TableNaming",
      "sql": "SELECT '{{ table_name }}' AS table_name WHERE ..."
    },
    {
      "name": "NT2_ColumnNaming",
      "sql": "SELECT column_name FROM information_schema.columns WHERE ..."
    }
  ]
}
```

### 6.2 Create Default Test Cases
```http
POST /tables/{tableFqn}/test-cases/default
```

**Example:** `POST /tables/healthcare_postgres.HealthCare.public.patients/test-cases/default`

**Response:**
```json
{
  "success": true,
  "table_fqn": "healthcare_postgres.HealthCare.public.patients",
  "table_name": "patients",
  "created_count": 11,
  "skipped_count": 4,
  "failed_count": 0,
  "test_cases": [
    {
      "name": "dq_default_NT1_TableNaming_abc123",
      "testDefinition": "NT1_TableNaming",
      "status": "CREATED",
      "id": "uuid-here",
      "fullyQualifiedName": "healthcare_postgres.HealthCare.public.patients.dq_default_NT1_TableNaming_abc123"
    }
  ],
  "skipped": [
    {
      "definition": "NT3_BooleanNaming",
      "reason": "No parameters defined on OpenMetadata"
    }
  ],
  "failed": []
}
```

### 6.3 Get Table's Test Cases
```http
GET /tables/{tableFqn}/test-cases
```

**Response:** OpenMetadata response format with `data` array of test cases.

---

## 7. Evaluation API

### 7.1 Get Evaluation Summary
```http
GET /evaluation/summary
```

**Response:**
```json
{
  "total_recommendations": 150,
  "accepted": 80,
  "rejected": 30,
  "pending": 40,
  "by_engine": {
    "BASIC": 100,
    "ADVANCED": 30,
    "STATISTICAL": 20
  }
}
```

---

## 8. OpenMetadata Connection (FE nên biết)

Backend kết nối đến OpenMetadata server thông qua:
- URL: `OM_API` (config trong backend)
- Token: `OM_TOKEN` (JWT)

**Tất cả các API trên đều proxy qua backend, FE không cần biết OpenMetadata credentials.**

---

## 9. Implementation Notes cho FE

### 9.1 CORS
Backend đã enable CORS cho tất cả origins.

### 9.2 Error Handling
- 200: Success
- 400: Bad Request (missing params)
- 404: Not Found (table, rule)
- 500: Server Error

### 9.3 Timeout
- Default: 10s cho OpenMetadata calls
- Generate rules: có thể mất 30-60s (gọi LLM)

### 9.4 Cache
- Table context: cache 3 phút
- Use `?refresh=true` để bypass cache

### 9.5 Suggested FE Service

```javascript
// frontend/src/services/openmetadataService.js
const API_BASE = 'http://localhost:8000/api/v1';

// Cấu trúc gọi API chuẩn
async function callAPI(endpoint, options = {}) {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || `HTTP ${res.status}`);
  }
  return res.json();
}

// Example usage
const tables = await callAPI('/catalog/tables?schemaFqn=healthcare_postgres.HealthCare.public');
const context = await callAPI('/context/patients');
const rules = await callAPI('/recommendations/generate', {
  method: 'POST',
  body: JSON.stringify({ table_name: 'patients', engines: ['BASIC'] })
});
```

---

## 10. Tính năng hiện có của FE (để tham khảo)

### 10.1 Các Component/View hiện tại

| Component | Path | Mô tả |
|-----------|------|-------|
| `Header` | `components/layout/Header.jsx` | Header navigation |
| `TableContextPanel` | `components/context-panel/TableContextPanel.jsx` | Hiển thị table context |
| `RecommendationBoard` | `components/recommendation/RecommendationBoard.jsx` | Bảng rules đề xuất |
| `RuleCard` | `components/recommendation/RuleCard.jsx` | Card cho mỗi rule |
| `ActionToolbar` | `components/recommendation/ActionToolbar.jsx` | Toolbar actions |
| `ColumnRuleBrowser` | `components/recommendation/ColumnRuleBrowser.jsx` | Browse rules theo cột |
| `FilterTabs` | `components/recommendation/FilterTabs.jsx` | Filter rules |
| `PublishBar` | `components/recommendation/PublishBar.jsx` | Publish rules bar |
| `ObservabilityView` | `components/observability/ObservabilityView.jsx` | Data observability view |
| `SchemaView` | `components/schema/SchemaView.jsx` | Schema viewer |
| `ProfilerDetailView` | `components/profiler/ProfilerDetailView.jsx` | Profiler details |
| `SampleDataView` | `components/sample-data/SampleDataView.jsx` | Sample data |
| `LineageView` | `components/lineage/LineageView.jsx` | Data lineage |
| `ActivityFeedView` | `components/activity-feed/ActivityFeedView.jsx` | Activity feed |
| `EditRuleModal` | `components/modals/EditRuleModal.jsx` | Edit rule modal |
| `EditTierModal` | `components/modals/EditTierModal.jsx` | Edit tier modal |
| `VersionHistoryModal` | `components/modals/VersionHistoryModal.jsx` | Version history |
| `PublishSuccessModal` | `components/modals/PublishSuccessModal.jsx` | Publish success |

### 10.2 Mock Data

Có sẵn `frontend/src/services/mockData.js` chứa:
- `HEALTHCARE_TABLE_DESCRIPTIONS` - mô tả 18 healthcare tables
- Mock data để test khi backend offline

### 10.3 Service File

`frontend/src/services/openmetadataService.js` đã có sẵn các method:

```javascript
openmetadataService = {
  // Catalog
  checkHealth(),
  getServices(),
  getDatabases(service),
  getSchemas(databaseFqn),
  getTables(schemaFqn, refresh),
  getTableDetail(tableIdOrName, refresh),
  getTableContext(tableName, refresh),
  
  // Recommendations
  generateRules(tableName, engines),
  generateAdvancedRules(tableName, columns, minConfidence),
  getSavedAdvancedRules(tableName),
  deleteSavedAdvancedRules(),
  
  // Review
  reviewRule(ruleId, action, editedParameters),
  publishRules(tableName, tableFqn, rulesOrIds, tier),
  updateTableTier(tableName, tier),
  
  // Evaluation
  getEvaluationSummary(),
}
```

**Lưu ý:** Các method trên hiện đã trỏ đến `localhost:8000/api/v1`. Cần update URL khi deploy.

---

## 11. Tổng kết - Tính năng cần biết

### 11.1 Rule Types cần hiển thị trên UI

| Engine | Count | Rule Types |
|--------|-------|------------|
| BASIC | 6 | NOT_NULL, UNIQUE, BETWEEN, IN_SET, LENGTH, REGEX |
| BASIC | 1 | ROW_COUNT (table-level) |
| ADVANCED | 3 | TEMPORAL, CROSS_COLUMN, CONDITIONAL_DEPENDENCY |
| STATISTICAL | 5 | MEAN, MEDIAN, STDDEV, MIN, MAX |

### 11.2 Workflows cần support

1. **Generate Rules Flow:**
   ```
   Chọn table → Generate Rules → Hiển thị candidates
   ```

2. **Review Flow:**
   ```
   Candidates → Accept/Edit/Reject → Review History
   ```

3. **Publish Flow:**
   ```
   Accepted Rules → Publish → OpenMetadata Test Cases
   ```

4. **Tier Flow:**
   ```
   Table → Set Tier (1-5) → OpenMetadata
   ```

5. **NT Test Cases Flow:**
   ```
   Table → Tạo Default Test Cases → OpenMetadata
   ```

### 11.3 Data Format quan trọng

**CandidateRule object:**
```typescript
interface CandidateRule {
  id: string;
  rule_type: string;
  description?: string;
  target_columns: string[];
  parameters: Record<string, any>;
  engine: "BASIC" | "ADVANCED";
  confidence: number;  // 0-1
  reason: string;
  evidence: Record<string, any>;
  validation_status: "VALID" | "WARNING" | "INVALID";
  status: "DRAFT" | "ACCEPTED" | "EDITED" | "REJECTED";
  
  // Advanced only
  sql?: string;
  violation_predicate?: string;
  params?: Record<string, any>;
  conditions?: Array<Record<string, any>>;
}
```

---

## 12. Quick Test Endpoints

```bash
# Health check
curl http://localhost:8000/api/v1/health

# Get tables
curl http://localhost:8000/api/v1/catalog/tables?schemaFqn=healthcare_postgres.HealthCare.public

# Generate rules
curl -X POST http://localhost:8000/api/v1/recommendations/generate \
  -H "Content-Type: application/json" \
  -d '{"table_name":"patients","engines":["BASIC"]}'
```

---

**Liên hệ:** Nếu cần thêm API hoặc có thắc mắc, vui lòng ping backend team.
