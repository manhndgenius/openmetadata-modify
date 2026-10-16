# Plan: Mở rộng Rule Recommender — Advanced, Statistical, NT Governance, Regex

**Mục tiêu:** Bổ sung 4 nhóm rule type còn thiếu trong FE đã ghép vào OpenMetadata, để đạt parity với backend `dq-rule-recommender-openmetadata`.

**Phạm vi:** Sửa 4 file. Không động đến backend, không động đến các file khác của OpenMetadata.

---

## Context

FE hiện tại (`RuleRecommenderPage.tsx` + `ruleRecommenderAPI.ts`) chỉ cover khoảng 30% backend. Đã có: BASIC rules (qua fallback + `/rules/recommend`), Review flow, Publish, Golden Dataset Benchmark. Còn thiếu:

- ❌ **Advanced LLM rules** (TEMPORAL, CROSS_COLUMN, CONDITIONAL_DEPENDENCY)
- ❌ **Statistical rules** (Mean, Median, StdDev, Min, Max)
- ❌ **NT Governance rules** (15 rules NT1-NT16)
- ❌ **Regex rules** (columnValuesToMatchRegex cho email/URL/phone)

Backend đã có sẵn tất cả. Chỉ cần FE gọi đúng endpoint + mapping đúng tên test definition + parameter name của OpenMetadata.

---

## Verified facts (từ exploration codebase)

| Fact | Source | Ý nghĩa |
|---|---|---|
| Statistical test dùng param name **đặc thù**: `minValueForMeanInCol`/`maxValueForMeanInCol`, `…ForMedianInCol`, `…ForStdDevInCol`, `…ForMinInCol`, `…ForMaxInCol` | `openmetadata-service/src/main/resources/json/data/tests/columnValue*ToBeBetween.json` | `publishRules` không thể dùng lại nhánh BASIC Between — phải remap |
| Basic Between dùng `minValue`/`maxValue` (không prefix) | `columnValuesToBeBetween.json` | Nhánh `publishRules` hiện tại đúng, giữ nguyên |
| `columnValuesToMatchRegex` yêu cầu param `regex` (STRING) | `columnValuesToMatchRegex.json` | Cần nhánh mới trong publish |
| `tableCustomSQLQuery` dùng `sqlExpression`, `strategy`, `threshold` (code hiện tại dùng `COUNT`) | `RuleRecommenderPage.tsx:254-260` | Advanced rules dùng `strategy: 'ROWS'` |
| `columnValueLengthsToBeBetween` (có `s`) là tên chuẩn OM | `columnValueLengthsToBeBetween.json` | Code hiện tại dùng đúng, giữ nguyên |
| Backend `/advanced-rules/recommend` trả `rules[]` (có `sql`, `violation_predicate`, `params`, `conditions`); `/recommendations/statistical/generate` trả `candidates[]` (có `target_columns[]`, `parameters`) | `FE_API_SPECIFICATION.md` §4.2, §4.5 | Cần 2 mapper khác nhau |
| `/tables/{fqn}/test-cases/default` là one-shot, trả summary (không cần rule objects) | `FE_API_SPECIFICATION.md` §6.2 | NT tab dùng flow hoàn toàn khác — 1 nút bấm, không Accept/Edit |
| Page hiện KHÔNG dùng `useTranslation` (tất cả string tiếng Anh hardcode) | grep | Mình sẽ thêm `useTranslation` cho các dòng MỚI sửa (không re-translate phần cũ) |

---

## Files thay đổi (4 file, không tạo file mới)

| Path | Thay đổi |
|---|---|
| `src/services/ruleRecommenderAPI.ts` | Thêm 7 method mới, mở rộng 2 method cũ |
| `src/pages/RuleRecommenderPage/RuleRecommenderPage.tsx` | Engine picker, NT tab, smart regex editor, mapping table mở rộng |
| `src/pages/RuleRecommenderPage/rule-recommender.style.less` | CSS cho NT governance card + regex editor |
| `src/locale/languages/en-us.json` | Thêm i18n keys mới |

---

## A. `ruleRecommenderAPI.ts` — chi tiết

### A.1. Interfaces mới (thêm sau `CandidateRule`)

```typescript
export type RuleEngine = 'BASIC' | 'ADVANCED' | 'STATISTICAL';

export interface AdvancedRuleResponse {
  id: string;
  rule_type: 'TEMPORAL' | 'CROSS_COLUMN' | 'CONDITIONAL_DEPENDENCY';
  engine: 'ADVANCED';
  sql: string;
  violation_predicate?: string;
  params?: Record<string, unknown>;
  conditions?: Array<Record<string, unknown>>;
  confidence: number;
  reason: string;
}

export interface StatisticalCandidateResponse {
  id: string;
  rule_type:
    | 'columnValueMeanToBeBetween'
    | 'columnValueMedianToBeBetween'
    | 'columnValueStdDevToBeBetween'
    | 'columnValueMinToBeBetween'
    | 'columnValueMaxToBeBetween';
  target_columns: string[];
  engine: 'STATISTICAL';
  parameters: { minValue?: number; maxValue?: number };
  confidence: number;
  reason: string;
}

export interface NtGovernanceSummary {
  created_count: number;
  skipped_count: number;
  failed_count: number;
  test_cases: Array<{
    name: string;
    testDefinition: string;
    id: string;
    fullyQualifiedName: string;
    status: string;
  }>;
  skipped: Array<{ definition: string; reason: string }>;
  failed: Array<{ definition: string; reason: string }>;
}

export interface NtTestDefinition {
  name: string;
  fullyQualifiedName: string;
  displayName: string;
  description: string;
  sql?: string;
}

export const STATISTICAL_PARAM_NAMES: Record<
  StatisticalCandidateResponse['rule_type'],
  { min: string; max: string }
> = {
  columnValueMeanToBeBetween:    { min: 'minValueForMeanInCol',    max: 'maxValueForMeanInCol' },
  columnValueMedianToBeBetween:  { min: 'minValueForMedianInCol',  max: 'maxValueForMedianInCol' },
  columnValueStdDevToBeBetween:  { min: 'minValueForStdDevInCol',  max: 'maxValueForStdDevInCol' },
  columnValueMinToBeBetween:     { min: 'minValueForMinInCol',     max: 'maxValueForMinInCol' },
  columnValueMaxToBeBetween:     { min: 'minValueForMaxInCol',     max: 'maxValueForMaxInCol' },
};

export const ADVANCED_RULE_TYPES = new Set([
  'TEMPORAL', 'CROSS_COLUMN', 'CONDITIONAL_DEPENDENCY',
]);
```

### A.2. Mở rộng `generateRules(tableFqn, engines?)`

**Trước:** hardcode `engines: ['BASIC', 'ADVANCED']`.

**Sau:**
```typescript
async generateRules(
  tableFqn: string,
  engines: RuleEngine[] = ['BASIC']
): Promise<CandidateRule[]>
```

Truyền `engines` xuống backend. Thêm tolerant reader: thử `data.rules` → `data.candidates` → `Array.isArray(data) ? data : []`.

### A.3. Thêm `generateAdvancedRules`

Gọi `POST /advanced-rules/recommend` với `{ table_name, columns: [], min_confidence: 0.6 }`.

**Không có fallback** — nếu backend offline, throw exception để page hiển thị notification. (Không tự sinh advanced rule giả vì giá trị cốt lõi là SQL do LLM tạo.)

Map response → `CandidateRule[]`:
- `rule_type`: giữ nguyên
- `scope: 'table'`
- `sql_expression: r.sql`
- `engine: 'ADVANCED'`
- `parameters: r.params ?? {}`
- `column_name: null`

### A.4. Thêm `generateStatisticalRules`

Gọi `POST /recommendations/statistical/generate` với `{ table_name, use_llm: true }`.

Map response → `CandidateRule[]`:
- `rule_type`: giữ nguyên
- `scope: 'column'`
- `column_name: r.target_columns?.[0] ?? null`
- `engine: 'STATISTICAL'`
- `parameters: r.parameters` (giữ `minValue`/`maxValue`, không remap ở đây — remap xảy ra trong publish)

### A.5. Thêm 4 method cho NT Governance

```typescript
async getTestDefinitions(): Promise<NtTestDefinition[]>
  // GET /tables/test-definitions

async createDefaultTestCases(tableFqn: string): Promise<NtGovernanceSummary>
  // POST /tables/{encodedFqn}/test-cases/default

async getTableTestCases(tableFqn: string): Promise<unknown[]>
  // GET /tables/{encodedFqn}/test-cases

async deleteSavedAdvancedRules(): Promise<{ deleted: number }>
  // DELETE /advanced-rules/saved
```

### A.6. Mở rộng `publishRules` — thêm 3 nhánh mới

**Trước nhánh catch-all `else if` (line 261), thêm:**

```typescript
} else if (rule.rule_type === 'columnValuesToMatchRegex') {
  const regex = rule.parameters?.regex;
  if (typeof regex === 'string' && regex.length > 0) {
    parameterValues.push({ name: 'regex', value: regex });
  }
} else if (rule.rule_type in STATISTICAL_PARAM_NAMES) {
  const paramNames = STATISTICAL_PARAM_NAMES[rule.rule_type as StatisticalCandidateResponse['rule_type']];
  if (rule.parameters?.minValue !== undefined) {
    parameterValues.push({ name: paramNames.min, value: String(rule.parameters.minValue) });
  }
  if (rule.parameters?.maxValue !== undefined) {
    parameterValues.push({ name: paramNames.max, value: String(rule.parameters.maxValue) });
  }
}
```

**Tại vòng lặp, thêm guard đầu mỗi rule:**
```typescript
if (rule.rule_type === 'columnValuesToMatchRegex' && !rule.parameters?.regex) {
  failures.push(`${rule.rule_type} (missing regex)`);
  continue;
}
```

**Override `testDefinition` trong payload (line 274-283):**
```typescript
const testDefinition = ADVANCED_RULE_TYPES.has(rule.rule_type)
  ? 'tableCustomSQLQuery'
  : rule.rule_type;

const payload = { ..., testDefinition, ... };
```

**Sửa nhánh `tableCustomSQLQuery` (line 254-260) để chọn strategy:**
```typescript
} else if (testDefinition === 'tableCustomSQLQuery') {
  parameterValues.push({
    name: 'sqlExpression',
    value: rule.sql_expression || rule.parameters?.sqlExpression || `SELECT COUNT(*) FROM ${tableName}`,
  });
  parameterValues.push({
    name: 'strategy',
    value: ADVANCED_RULE_TYPES.has(rule.rule_type) ? 'ROWS' : 'COUNT',
  });
  parameterValues.push({ name: 'threshold', value: '0' });
}
```

**Lý do chọn `ROWS` cho advanced:** `sql` của advanced rule là **violation predicate** (các row vi phạm). `ROWS` sẽ liệt kê chính xác row nào vi phạm. `COUNT` chỉ đếm tổng — ít thông tin hơn. (Backend `tableCustomSQLQuery` default vẫn là `COUNT` cho user-defined SQL.)

### A.7. Mở rộng `generateFallbackRules`

- **Branch `customers`:** thêm `rule-cust-6` regex email: `parameters: { regex: '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}$' }`, confidence 0.93.
- **Branch `orders`:** thêm regex rule cho `customer_id` với pattern UUID-style (chỉ khi có cột `customer_id`).
- **Thêm branch `products` (mới, đang thiếu):** row_count + id not-null/unique + length rule cho `product_name` + in-set cho `category` + regex cho `sku` (pattern `^[A-Z0-9-]{3,20}$`).
- **Branch generic:** KHÔNG thêm regex (không biết column name).

---

## B. `RuleRecommenderPage.tsx` — chi tiết

### B.1. Imports mới

```typescript
import { useTranslation } from 'react-i18next';
import { SafetyCertificateOutlined } from '@ant-design/icons';
import { Collapse, List } from 'antd';
import {
  CandidateRule,
  GoldenBenchmarkSummary,
  NtGovernanceSummary,
  NtTestDefinition,
  RuleEngine,
  ruleRecommenderAPI,
  TableOption,
  getRecommenderBaseUrl,
  setRecommenderBaseUrl,
} from '../../services/ruleRecommenderAPI';
```

Trong component:
```typescript
const { t } = useTranslation();
```

### B.2. State mới (thêm sau state hiện tại, ~line 100)

```typescript
const [generating, setGenerating] = useState(false);
const [ntLoading, setNtLoading] = useState(false);
const [ntDefinitions, setNtDefinitions] = useState<NtTestDefinition[]>([]);
const [ntResult, setNtResult] = useState<NtGovernanceSummary | null>(null);
const [existingTestCases, setExistingTestCases] = useState<unknown[]>([]);
const [loadingTestCases, setLoadingTestCases] = useState(false);
const [regexEditValue, setRegexEditValue] = useState<string>('');
const [selectedEngines, setSelectedEngines] = useState<RuleEngine[]>(['BASIC']);
```

### B.3. `useEffect` mới — load NT definitions on mount

```typescript
useEffect(() => {
  ruleRecommenderAPI.getTestDefinitions().then(setNtDefinitions).catch(() => {});
}, []);
```

### B.4. Helper `mergeById`

```typescript
const mergeById = (existing: CandidateRule[], incoming: CandidateRule[]): CandidateRule[] => {
  const byId = new Map(existing.map((r) => [r.id, r]));
  for (const r of incoming) {
    const prev = byId.get(r.id);
    byId.set(r.id, prev ? { ...r, status: prev.status } : r);
  }
  return Array.from(byId.values());
};
```

**Quyết định: Merge thay vì Replace.** Khi user chạy lại với engine khác, rule mới được thêm vào, không mất trạng thái Accept/Reject của rule cũ. Trùng id thì giữ status cũ.

### B.5. Thay nút "Run AI Recommendation" thành 3 Selector riêng biệt

**Trước (line 508-514):** 1 button `Run AI Recommendation` gọi `generateRules` (hardcode engines `['BASIC', 'ADVANCED']`).

**Sau:** 3 selector riêng biệt, mỗi cái cho 1 engine. Đặt cùng dòng trong `header-actions` (cùng chỗ với nút Publish):

```tsx
<Select
  mode="multiple"
  allowClear
  style={{ width: 280 }}
  placeholder={t('label.select-engines')}
  value={selectedEngines}
  onChange={setSelectedEngines}
  options={[
    { value: 'BASIC',       label: t('label.engine-basic') },
    { value: 'ADVANCED',    label: t('label.engine-advanced') },
    { value: 'STATISTICAL', label: t('label.engine-statistical') },
  ]}
/>
<Button
  type="primary"
  style={{ background: '#52c41a', borderColor: '#52c41a' }}
  loading={generating}
  onClick={handleGenerateWithEngines}
  disabled={selectedEngines.length === 0}
>
  {t('label.run-ai-recommendation')}
</Button>
```

**Bỏ** nút Dropdown cũ, **bỏ** 2 handler `handleGenerateAdvanced` và `handleGenerateStatistical` riêng — tất cả gộp vào `handleGenerateWithEngines`. Selector quyết định engine nào được chạy.

**State mới (thêm vào B.2):**
```typescript
const [selectedEngines, setSelectedEngines] = useState<RuleEngine[]>(['BASIC']);
```

**Handler gộp (thay thế 3 handler ở B.5 cũ):**
```typescript
const handleGenerateWithEngines = async () => {
  if (!selectedTableFqn || selectedEngines.length === 0) return;
  setGenerating(true);
  try {
    const results = await Promise.all([
      selectedEngines.includes('BASIC')
        ? ruleRecommenderAPI.generateRules(selectedTableFqn, ['BASIC'])
        : Promise.resolve([]),
      selectedEngines.includes('ADVANCED')
        ? ruleRecommenderAPI.generateAdvancedRules(selectedTableFqn).catch(() => [])
        : Promise.resolve([]),
      selectedEngines.includes('STATISTICAL')
        ? ruleRecommenderAPI.generateStatisticalRules(selectedTableFqn).catch(() => [])
        : Promise.resolve([]),
    ]);
    const merged = results.flat();
    setRules((prev) => mergeById(prev, merged));
    notification.success({
      message: t('label.recommendation-complete'),
      description: `Generated ${merged.length} candidate rules from [${selectedEngines.join(', ')}]`,
    });
  } catch (e) {
    notification.error({
      message: t('label.recommendation-failed'),
      description: String(e),
    });
  } finally {
    setGenerating(false);
  }
};
```

**Hành vi:**
- Selector cho phép chọn 1, 2, hoặc cả 3 engine.
- Mặc định chọn `['BASIC']` (giống behavior cũ).
- Nút "Run AI Recommendation" bị disabled nếu selector rỗng.
- Chạy song song 3 endpoint độc lập qua `Promise.all`. Endpoint nào lỗi (vd: backend không hỗ trợ) thì catch trả về `[]` — các engine khác vẫn chạy bình thường.
- Kết quả merge với rules hiện tại qua `mergeById` (giữ status Accept/Reject cũ).

**Layout header:**
```
[Selector: BASIC, ADVANCED, STATISTICAL]  [Run AI Recommendation]  [Publish (n)]
```

So với Dropdown (1 nút + menu ẩn), 3 selector rõ ràng hơn cho user, hiển thị được lựa chọn hiện tại, và cho phép chạy nhiều engine cùng lúc 1 lần bấm.

### B.6. Mở rộng tab "OpenMetadata Test Mapping" (line 804-812)

Thêm 9 dòng mới vào mảng `dataSource`:

| Recommender Rule Type | Scope | OpenMetadata Test Definition | Parameters Schema |
|---|---|---|---|
| `columnValuesToMatchRegex` | Column | `columnValuesToMatchRegex` | `{ regex: string }` |
| `columnValueMeanToBeBetween` | Column | `columnValueMeanToBeBetween` | `{ minValueForMeanInCol, maxValueForMeanInCol }` |
| `columnValueMedianToBeBetween` | Column | `columnValueMedianToBeBetween` | `{ minValueForMedianInCol, maxValueForMedianInCol }` |
| `columnValueStdDevToBeBetween` | Column | `columnValueStdDevToBeBetween` | `{ minValueForStdDevInCol, maxValueForStdDevInCol }` |
| `columnValueMinToBeBetween` | Column | `columnValueMinToBeBetween` | `{ minValueForMinInCol, maxValueForMinInCol }` |
| `columnValueMaxToBeBetween` | Column | `columnValueMaxToBeBetween` | `{ minValueForMaxInCol, maxValueForMaxInCol }` |
| `TEMPORAL` | Table | `tableCustomSQLQuery` | `{ sqlExpression, strategy: 'ROWS', threshold: 0 }` |
| `CROSS_COLUMN` | Table | `tableCustomSQLQuery` | `{ sqlExpression, strategy: 'ROWS', threshold: 0 }` |
| `CONDITIONAL_DEPENDENCY` | Table | `tableCustomSQLQuery` | `{ sqlExpression, strategy: 'ROWS', threshold: 0 }` |

Dưới table thêm `<Alert type="info">` với i18n key `label.advanced-rules-mapping-note`.

**Refactor:** Chuyển mảng 7 dòng cũ thành constant `MAPPING_ROWS` ở đầu file (ngoài component) để dễ bảo trì.

### B.7. Thêm tab mới "NT Governance" (sau tab "contract")

Cấu trúc:
```
[Alert giới thiệu 15 NT rules]
[Button: Create Default Test Cases] [Button: View Existing Test Cases]
[Card hiển thị Available NT Definitions (tags)]
[Card kết quả tạo: Created / Skipped / Failed counts + collapsible lists]
[Card hiển thị existing test cases]
```

Code skeleton:
```tsx
{
  key: 'nt-governance',
  label: <span><SafetyCertificateOutlined />{t('label.nt-governance')}</span>,
  children: (
    <div style={{ padding: '16px 0' }}>
      <Alert
        type="info"
        showIcon
        message={t('label.nt-governance-title')}
        description={t('label.nt-governance-description')}
        style={{ marginBottom: 16, borderRadius: 8 }}
      />
      <Space wrap style={{ marginBottom: 16 }}>
        <Button
          type="primary"
          icon={<RocketOutlined />}
          loading={ntLoading}
          onClick={handleCreateDefaultTestCases}
        >
          {t('label.create-default-test-cases')}
        </Button>
        <Button
          icon={<DatabaseOutlined />}
          loading={loadingTestCases}
          onClick={handleViewExistingTestCases}
        >
          {t('label.view-existing-test-cases')}
        </Button>
      </Space>

      {ntDefinitions.length > 0 && (
        <Card title={t('label.available-nt-definitions')} size="small" className="nt-governance-card">
          <Space wrap>
            {ntDefinitions.map((d) => <Tag key={d.name} color="geekblue">{d.name}</Tag>)}
          </Space>
        </Card>
      )}

      {ntResult && (
        <Card title={t('label.nt-creation-result')} size="small" className="nt-governance-card">
          <Row gutter={16} style={{ marginBottom: 12 }}>
            <Col><Tag color="success">{t('label.created')}: {ntResult.created_count}</Tag></Col>
            <Col><Tag color="warning">{t('label.skipped')}: {ntResult.skipped_count}</Tag></Col>
            <Col><Tag color="error">{t('label.failed')}: {ntResult.failed_count}</Tag></Col>
          </Row>
          <Collapse ghost>
            <Collapse.Panel header={`${t('label.created-test-cases')} (${ntResult.test_cases.length})`} key="created">
              <List size="small" dataSource={ntResult.test_cases}
                renderItem={(tc) => (
                  <List.Item>
                    <Text code>{tc.name}</Text> <Tag color="geekblue">{tc.testDefinition}</Tag>
                  </List.Item>
                )} />
            </Collapse.Panel>
            {ntResult.skipped.length > 0 && (
              <Collapse.Panel header={`${t('label.skipped-test-cases')} (${ntResult.skipped.length})`} key="skipped">
                <List size="small" dataSource={ntResult.skipped}
                  renderItem={(s) => (
                    <List.Item>
                      <Text code>{s.definition}</Text> <Text type="secondary">{s.reason}</Text>
                    </List.Item>
                  )} />
              </Collapse.Panel>
            )}
            {ntResult.failed.length > 0 && (
              <Collapse.Panel header={`${t('label.failed-test-cases')} (${ntResult.failed.length})`} key="failed">
                <List size="small" dataSource={ntResult.failed}
                  renderItem={(f) => (
                    <List.Item>
                      <Text code>{f.definition}</Text> <Text type="danger">{f.reason}</Text>
                    </List.Item>
                  )} />
              </Collapse.Panel>
            )}
          </Collapse>
        </Card>
      )}

      {existingTestCases.length > 0 && (
        <Card title={t('label.existing-test-cases')} size="small" className="nt-governance-card">
          <Table
            size="small"
            pagination={{ pageSize: 5 }}
            dataSource={existingTestCases.map((tc, idx) => {
              const item = tc as { name?: string; testDefinition?: string; description?: string };
              return { key: idx, name: item.name, testDefinition: item.testDefinition, description: item.description };
            })}
            columns={[
              { title: t('label.name'), dataIndex: 'name', key: 'name' },
              { title: t('label.test-definition'), dataIndex: 'testDefinition', key: 'testDefinition',
                render: (v) => <Tag color="geekblue">{v}</Tag> },
              { title: t('label.description'), dataIndex: 'description', key: 'description' },
            ]}
          />
        </Card>
      )}
    </div>
  ),
}
```

**2 handler mới:**
```typescript
const handleCreateDefaultTestCases = async () => {
  if (!selectedTableFqn) return;
  setNtLoading(true);
  try {
    const summary = await ruleRecommenderAPI.createDefaultTestCases(selectedTableFqn);
    setNtResult(summary);
    notification.success({
      message: t('label.nt-creation-success'),
      description: `${summary.created_count} created, ${summary.skipped_count} skipped, ${summary.failed_count} failed`,
    });
  } catch (e) {
    notification.error({
      message: t('label.nt-creation-failed'),
      description: String(e),
    });
  } finally {
    setNtLoading(false);
  }
};

const handleViewExistingTestCases = async () => {
  if (!selectedTableFqn) return;
  setLoadingTestCases(true);
  try {
    const cases = await ruleRecommenderAPI.getTableTestCases(selectedTableFqn);
    setExistingTestCases(cases);
  } finally {
    setLoadingTestCases(false);
  }
};
```

### B.8. Smart Edit Modal cho Regex Rule (optional nhưng khuyến khích)

Trong `EditRuleModal` (line 822-847), khi `editingRule?.rule_type === 'columnValuesToMatchRegex'`, thay textarea `parameters` bằng:
- 1 dropdown chọn pattern phổ biến (Email, URL, Phone, IPv4)
- 1 input cho custom regex

```tsx
{editingRule?.rule_type === 'columnValuesToMatchRegex' ? (
  <>
    <Form.Item label={t('label.regex-pattern')}>
      <Select
        showSearch
        style={{ width: '100%' }}
        value={regexEditValue}
        onChange={(v) => {
          setRegexEditValue(v);
          editForm.setFieldValue('parameters', JSON.stringify({ regex: v }));
        }}
        options={[
          { value: '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}$', label: 'Email' },
          { value: '^https?://[^\\s/$.?#].[^\\s]*$', label: 'URL' },
          { value: '^\\+?[0-9 .\\-]{7,15}$', label: 'Phone' },
          { value: '^[0-9]{1,3}\\.[0-9]{1,3}\\.[0-9]{1,3}\\.[0-9]{1,3}$', label: 'IPv4' },
        ]}
      />
    </Form.Item>
    <Form.Item label={t('label.custom-regex')}>
      <Input
        value={regexEditValue}
        onChange={(e) => {
          setRegexEditValue(e.target.value);
          editForm.setFieldValue('parameters', JSON.stringify({ regex: e.target.value }));
        }}
        placeholder="^[a-zA-Z0-9]+$"
      />
    </Form.Item>
  </>
) : (
  <Form.Item label={t('label.parameters-json')} name="parameters">
    <Input.TextArea rows={4} placeholder='{"minValue": 0, "maxValue": 100}' />
  </Form.Item>
)}
```

---

## C. `rule-recommender.style.less` — thêm

Append sau block `.confidence-badge` (line 188):

```less
.nt-governance-card {
  background: linear-gradient(135deg, #fafafa 0%, #f0f5ff 100%);
  border: 1px solid #d6e4ff;
  border-radius: 10px;
  margin-bottom: 16px;
}

.nt-result-list {
  max-height: 280px;
  overflow-y: auto;
  border: 1px solid #f0f0f0;
  border-radius: 6px;
  padding: 8px;
}

.engine-picker-dropdown.ant-dropdown-menu {
  min-width: 240px;
}

.regex-pattern-help {
  font-size: 12px;
  color: #8c8c8c;
  margin-top: 4px;
}
```

---

## D. `en-us.json` — i18n keys mới (24 keys)

Chèn giữa `rule-recommender` (line 1925) và `test-platform-plural` (line 1926):

```json
"run-ai-recommendation": "Run AI Recommendation",
"select-engines": "Select engines",
"engine-basic": "Basic",
"engine-advanced": "Advanced (LLM)",
"engine-statistical": "Statistical",
"recommendation-complete": "Recommendation Complete",
"recommendation-failed": "Recommendation Failed",
"nt-governance": "NT Governance",
"nt-governance-title": "NT Governance Test Cases",
"nt-governance-description": "Create the 15 standard governance test cases (NT1-NT16) covering TableNaming, ColumnNaming, AuditColumns, PrimaryKeyStandard, etc. Already-created cases will be skipped automatically.",
"create-default-test-cases": "Create Default Test Cases",
"view-existing-test-cases": "View Existing Test Cases",
"available-nt-definitions": "Available NT Definitions",
"nt-creation-result": "NT Test Cases Creation Result",
"created": "Created",
"skipped": "Skipped",
"failed": "Failed",
"created-test-cases": "Created test cases",
"skipped-test-cases": "Skipped test cases",
"failed-test-cases": "Failed test cases",
"existing-test-cases": "Existing test cases",
"nt-creation-success": "NT Test Cases created",
"nt-creation-failed": "NT Test Cases creation failed",
"advanced-rules-mapping-note": "Note: Advanced rules (TEMPORAL / CROSS_COLUMN / CONDITIONAL_DEPENDENCY) are published as 'tableCustomSQLQuery' test cases using the LLM-generated SQL predicate, with strategy ROWS and threshold 0.",
"regex-pattern": "Regex pattern",
"custom-regex": "Or enter a custom regex",
"parameters-json": "Parameters (JSON Object)",
"test-definition": "Test Definition",
"description": "Description",
"name": "Name",
```

**Lưu ý:** Migration `useTranslation` chỉ áp dụng cho **string mới thêm vào**. Không re-translate 30+ string cũ (cleanup riêng sau).

---

## E. Thứ tự thực hiện

| Bước | File | Phụ thuộc |
|---|---|---|
| 1 | `ruleRecommenderAPI.ts` — thêm interfaces (A.1) | — |
| 2 | `ruleRecommenderAPI.ts` — extend `publishRules` (A.6) | Bước 1 |
| 3 | `ruleRecommenderAPI.ts` — extend `generateRules` (A.2) | Bước 1 |
| 4 | `ruleRecommenderAPI.ts` — `generateAdvancedRules` (A.3) | Bước 1 |
| 5 | `ruleRecommenderAPI.ts` — `generateStatisticalRules` (A.4) | Bước 1 |
| 6 | `ruleRecommenderAPI.ts` — 4 NT method (A.5) | Bước 1 |
| 7 | `ruleRecommenderAPI.ts` — extend `generateFallbackRules` (A.7) | — |
| 8 | `en-us.json` — thêm 27 keys (D) | — |
| 9 | `RuleRecommenderPage.tsx` — imports + `useTranslation` (B.1) | Bước 8 |
| 10 | `RuleRecommenderPage.tsx` — state mới + `useEffect` + `mergeById` (B.2, B.3, B.4) | Bước 9 |
| 11 | `RuleRecommenderPage.tsx` — engine picker (B.5) | Bước 2-7, 9, 10 |
| 12 | `RuleRecommenderPage.tsx` — mapping table (B.6) | Bước 8, 9 |
| 13 | `RuleRecommenderPage.tsx` — NT tab (B.7) | Bước 6, 9, 10, 8 |
| 14 | `RuleRecommenderPage.tsx` — regex editor (B.8) | Bước 8, 9 |
| 15 | `rule-recommender.style.less` (C) | — |

---

## F. Verification

### Compile gate

```bash
cd openmetadata-ui/src/main/resources/ui
yarn tsc --noEmit
yarn lint
```

### Manual test matrix (cần backend on)

1. **Basic regression** — chọn bảng, chọn `Basic` trong selector, click "Run AI Recommendation" → danh sách BASIC rules hiển thị, Accept 1 rule, click Publish → tab Profiler của bảng có test case.
2. **Advanced** — chọn thêm `Advanced (LLM)` vào selector, click "Run" → TEMPORAL/CROSS_COLUMN/CONDITIONAL_DEPENDENCY hiển thị với SQL trong cột Logic. Accept + Publish → test case có `testDefinition: 'tableCustomSQLQuery'`, `strategy: 'ROWS'`.
3. **Statistical** — chọn `Statistical` trong selector, click "Run" → 5 rule types hiển thị. Publish 1 rule → test case có params `minValueForMeanInCol` / `maxValueForMeanInCol` (không phải `minValue`).
4. **Multi-engine** — chọn cả 3 engine trong selector, click "Run" → chạy song song qua `Promise.all`, kết quả gộp lại. Verify cả 3 loại rule đều có mặt.
5. **Regex** — bảng có cột email, chọn `Basic` trong selector → có rule `columnValuesToMatchRegex`. Edit modal hiển thị dropdown + custom input. Publish → test case có param `regex`.
6. **Merge policy** — chạy với Basic, sau đó chạy thêm Advanced, danh sách gộp lại, rule cũ giữ status Accept/Reject.
7. **NT Governance** — tab NT Governance, click "Create Default Test Cases" → result card hiển thị created/skipped/failed counts, mở Profiler kiểm tra.
8. **View Existing** — tab NT Governance, click "View Existing Test Cases" → table hiển thị.
9. **Mapping tab** — mở tab "OpenMetadata Test Mapping" → 15+ dòng mapping hiển thị đúng.
10. **Selector disabled** — bỏ chọn hết tất cả engine trong selector → nút "Run AI Recommendation" bị disabled.

---

## G. Open decisions (tự quyết, không hỏi lại)

| Decision | Lý do |
|---|---|
| **Engine picker = Multi-Select (1 selector cho 3 engine)** | Yêu cầu user: tạo 3 selector rõ ràng. Dùng `Select mode="multiple"` hiển thị được lựa chọn hiện tại, user chọn 1/2/3 engine rồi bấm 1 nút "Run AI Recommendation". Mỗi engine chạy qua endpoint riêng trong `Promise.all`, fail độc lập |
| **Merge thay vì Replace** khi re-run | User đã review rule, không nên mất công sức |
| **Advanced dùng `strategy: 'ROWS'`** | SQL của advanced là violation predicate — ROWS liệt kê được row vi phạm |
| **Statistical param remap ở FE** (không phải backend) | Theo `FE_API_SPECIFICATION.md` §4.5, backend trả `{minValue, maxValue}` — remap trong `publishRules` |
| **Không retrofit `any` cũ** (chỉ dùng type mới cho code mới) | CLAUDE.md yêu cầu no-`any` nhưng retrofit 7 chỗ `any` cũ là cleanup riêng |
| **Không re-translate string cũ** | Scope giữ focus — migration i18n tổng là PR riêng |
| **Tạo constant `MAPPING_ROWS` ở ngoài component** | Tránh recreate mảng mỗi render |

---

## H. Tóm tắt thay đổi

- **4 file sửa**, **0 file tạo mới**
- **~250-300 dòng** mới trong `ruleRecommenderAPI.ts`
- **~250-300 dòng** mới trong `RuleRecommenderPage.tsx`
- **~30 dòng CSS** trong `rule-recommender.style.less`
- **24 i18n keys** mới trong `en-us.json`
