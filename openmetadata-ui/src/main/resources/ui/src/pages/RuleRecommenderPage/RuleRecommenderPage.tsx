/*
 *  Copyright 2024 Collate.
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *  http://www.apache.org/licenses/LICENSE-2.0
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */

import {
  ArrowRightOutlined,
  CheckCircleOutlined,
  CheckOutlined,
  CloseCircleOutlined,
  CloseOutlined,
  DatabaseOutlined,
  EditOutlined,
  ExperimentOutlined,
  FieldTimeOutlined,
  LinkOutlined,
  ReloadOutlined,
  RocketOutlined,
  SafetyCertificateOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import {
  Alert,
  Badge,
  Button,
  Card,
  Col,
  Collapse,
  Descriptions,
  Empty,
  Form,
  Input,
  InputNumber,
  List,
  Modal,
  notification,
  Popover,
  Progress,
  Radio,
  Row,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ProfilerTabPath } from '../../components/Database/Profiler/ProfilerDashboard/profilerDashboard.interface';
import PageLayoutV1 from '../../components/PageLayoutV1/PageLayoutV1';
import { EntityTabs, EntityType } from '../../enums/entity.enum';
import {
  CandidateRule,
  BulkGenerationPreview,
  BulkGenerationRequest,
  CatalogOption,
  GenerationJobItem,
  GenerationJobItemStatus,
  GenerationJobSummary,
  GenerationScopeType,
  getRecommenderBaseUrl,
  NtGovernanceStatus,
  NtGovernanceSummary,
  NtTestDefinition,
  renderParameterizedSql,
  RuleEngine,
  ruleRecommenderAPI,
  setRecommenderBaseUrl,
  TableOption,
} from '../../services/ruleRecommenderAPI';
import { getEntityDetailsPath } from '../../utils/RouterUtils';
import './rule-recommender.style.less';

const { Text, Paragraph } = Typography;

type RangeParameterKeys = {
  min: string;
  max: string;
};

type BulkTableResult = {
  tableFqn: string;
  items: Partial<Record<RuleEngine, GenerationJobItem>>;
  generatedCount: number;
  status: GenerationJobItemStatus;
};

const TERMINAL_JOB_STATUSES = new Set(['SUCCESS', 'PARTIAL', 'FAILED']);

const RANGE_PARAMETER_KEYS: Record<string, RangeParameterKeys> = {
  columnValuesToBeBetween: { min: 'minValue', max: 'maxValue' },
  tableRowCountToBeBetween: { min: 'minValue', max: 'maxValue' },
  columnValueMeanToBeBetween: {
    min: 'minValueForMeanInCol',
    max: 'maxValueForMeanInCol',
  },
  columnValueMedianToBeBetween: {
    min: 'minValueForMedianInCol',
    max: 'maxValueForMedianInCol',
  },
  columnValueStdDevToBeBetween: {
    min: 'minValueForStdDevInCol',
    max: 'maxValueForStdDevInCol',
  },
  columnValueMinToBeBetween: {
    min: 'minValueForMinInCol',
    max: 'maxValueForMinInCol',
  },
  columnValueMaxToBeBetween: {
    min: 'minValueForMaxInCol',
    max: 'maxValueForMaxInCol',
  },
};

const LENGTH_BETWEEN_RULE_TYPES = new Set([
  'columnValueLengthsToBeBetween',
  'columnValuesLengthToBeBetween',
]);

const isLengthBetweenRule = (ruleType?: string) =>
  Boolean(ruleType && LENGTH_BETWEEN_RULE_TYPES.has(ruleType));

// Temporary FE-only suppression. The backend can keep generating this rule.
const HIDDEN_RULE_TYPES = new Set(['tableRowCountToBeBetween']);
const isRuleVisible = (rule: CandidateRule) =>
  !HIDDEN_RULE_TYPES.has(rule.rule_type);

const getRuleIdentity = (rule: CandidateRule) => {
  const columns = rule.target_columns?.length
    ? rule.target_columns
    : rule.column_name
    ? [rule.column_name]
    : [];

  return `${rule.rule_type}:${[...columns].sort().join(',')}`;
};

const isCustomSqlRule = (rule?: CandidateRule | null) =>
  Boolean(
    rule &&
      (rule.engine === 'ADVANCED' ||
        rule.rule_type === 'tableCustomSQLQuery' ||
        rule.sql_expression)
  );

const getRuleDisplaySql = (rule: CandidateRule): string =>
  renderParameterizedSql(
    rule.sql_expression || rule.sql || '',
    rule.parameters
  );

const EVIDENCE_LABELS: Record<string, string> = {
  llm_decision: 'LLM decision',
  null_count: 'Null values',
  null_ratio: 'Null ratio',
  null_percentage: 'Null percentage',
  non_null_count: 'Non-null values',
  distinct_count: 'Distinct values',
  distinct_ratio: 'Distinct ratio',
  duplicate_count: 'Duplicates',
  cardinality_ratio: 'Cardinality ratio',
  total_rows: 'Rows profiled',
  current_row_count: 'Current rows',
  sample_violations_count: 'Sample violations',
  min_observed: 'Observed minimum',
  max_observed: 'Observed maximum',
  min_length: 'Minimum length',
  max_length: 'Maximum length',
  expected_min: 'Expected minimum',
  expected_max: 'Expected maximum',
  expected_range: 'Expected range',
  observed_values: 'Observed values',
  allowed_values: 'Allowed values',
  is_primary_key: 'Primary key',
  detected_by: 'Detected by',
  pattern_source: 'Pattern source',
  requires_human_review: 'Human review',
  source_column_datatype: 'Source datatype',
  trend_status: 'Trend status',
  growth_buffer_pct: 'Growth buffer',
  current_mean: 'Current mean',
  mean_history: 'Mean history',
  current_median: 'Current median',
  median_history: 'Median history',
  current_stddev: 'Current standard deviation',
  stddev_history: 'Standard deviation history',
};

const getEvidenceLabel = (key: string) =>
  EVIDENCE_LABELS[key] ??
  key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());

const formatEvidenceNumber = (key: string, value: number) => {
  if (key.includes('ratio')) {
    return `${(value * 100).toFixed(1)}%`;
  }
  if (key.includes('percentage')) {
    return `${(value <= 1 ? value * 100 : value).toFixed(1)}%`;
  }
  if (key.endsWith('_pct')) {
    return `${value.toFixed(1)}%`;
  }

  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 4,
  }).format(value);
};

const EvidenceValue = ({
  evidenceKey,
  value,
}: {
  evidenceKey: string;
  value: unknown;
}) => {
  if (value === null || value === undefined || value === '') {
    return <Text type="secondary">Not available</Text>;
  }

  if (typeof value === 'boolean') {
    return (
      <Tag color={value ? 'green' : 'default'}>{value ? 'Yes' : 'No'}</Tag>
    );
  }

  if (typeof value === 'number') {
    return <Text strong>{formatEvidenceNumber(evidenceKey, value)}</Text>;
  }

  if (Array.isArray(value)) {
    const isProfileHistory =
      evidenceKey.endsWith('_history') &&
      value.every(
        (item) =>
          typeof item === 'object' &&
          item !== null &&
          typeof (item as { timestamp?: unknown }).timestamp === 'number' &&
          typeof (item as { value?: unknown }).value === 'number'
      );

    if (isProfileHistory) {
      const metricName = getEvidenceLabel(evidenceKey.replace(/_history$/, ''));
      const chartData = (
        value as Array<{ timestamp: number; value: number }>
      ).map((point) => ({
        ...point,
        timestampMs:
          point.timestamp < 1_000_000_000_000
            ? point.timestamp * 1000
            : point.timestamp,
      }));

      return (
        <div className="evidence-history-chart">
          <ResponsiveContainer height={180} width="100%">
            <LineChart
              data={chartData}
              margin={{ bottom: 4, left: 0, right: 8, top: 8 }}
            >
              <CartesianGrid stroke="#eaecf0" strokeDasharray="3 3" />
              <XAxis
                dataKey="timestampMs"
                fontSize={10}
                tickFormatter={(timestamp) =>
                  new Date(timestamp).toLocaleDateString('vi-VN', {
                    day: '2-digit',
                    month: '2-digit',
                  })
                }
                tickLine={false}
              />
              <YAxis
                domain={['auto', 'auto']}
                fontSize={10}
                tickFormatter={(number) =>
                  new Intl.NumberFormat('en-US', {
                    maximumFractionDigits: 2,
                    notation: 'compact',
                  }).format(number)
                }
                tickLine={false}
                width={52}
              />
              <ChartTooltip
                formatter={(number) => [
                  formatEvidenceNumber(evidenceKey, Number(number)),
                  metricName,
                ]}
                labelFormatter={(timestamp) =>
                  new Date(Number(timestamp)).toLocaleString('vi-VN', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                }
              />
              <Line
                activeDot={{ r: 5 }}
                dataKey="value"
                dot={{ fill: '#1570ef', r: 3, strokeWidth: 0 }}
                name={metricName}
                stroke="#1570ef"
                strokeWidth={2}
                type="monotone"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      );
    }

    return (
      <Space wrap size={[4, 4]}>
        {value.length === 0 ? (
          <Text type="secondary">None</Text>
        ) : (
          value.map((item, index) => (
            <Tag key={`${evidenceKey}-${index}`} style={{ margin: 0 }}>
              {typeof item === 'object' ? String(index + 1) : String(item)}
            </Tag>
          ))
        )}
      </Space>
    );
  }

  if (typeof value === 'object') {
    return (
      <div className="evidence-nested-values">
        {Object.entries(value as Record<string, unknown>).map(
          ([key, nestedValue]) => (
            <div className="evidence-nested-row" key={key}>
              <Text type="secondary">{getEvidenceLabel(key)}</Text>
              <EvidenceValue evidenceKey={key} value={nestedValue} />
            </div>
          )
        )}
      </div>
    );
  }

  const stringValue = String(value);
  const color =
    evidenceKey === 'llm_decision'
      ? stringValue === 'RECOMMEND'
        ? 'green'
        : stringValue === 'SKIP'
        ? 'red'
        : 'orange'
      : undefined;

  return color ? (
    <Tag color={color} style={{ margin: 0 }}>
      {stringValue}
    </Tag>
  ) : (
    <Text>{stringValue}</Text>
  );
};

const EvidencePopover = ({
  evidence,
}: {
  evidence: Record<string, unknown>;
}) => {
  const entries = Object.entries(evidence).filter(
    ([, value]) => value !== undefined
  );

  return (
    <Popover
      content={
        <div className="evidence-popover-content">
          <div className="evidence-popover-intro">
            Profile signals used to support this recommendation.
          </div>
          <div className="evidence-list">
            {entries.map(([key, value]) => (
              <div
                className={`evidence-row ${
                  key.endsWith('_history') ? 'evidence-row-chart' : ''
                }`}
                key={key}
              >
                <Text className="evidence-label" type="secondary">
                  {getEvidenceLabel(key)}
                </Text>
                <div className="evidence-value">
                  <EvidenceValue evidenceKey={key} value={value} />
                </div>
              </div>
            ))}
          </div>
        </div>
      }
      placement="leftTop"
      title={
        <Space size={8}>
          <ExperimentOutlined className="evidence-title-icon" />
          <span>Recommendation evidence</span>
          <Tag color="blue">{entries.length} signals</Tag>
        </Space>
      }
      trigger="click"
    >
      <Button
        className="evidence-trigger"
        icon={<ExperimentOutlined />}
        size="small"
      >
        Evidence
      </Button>
    </Popover>
  );
};

export const RuleRecommenderPage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [loading, setLoading] = useState<boolean>(false);
  const [generating, setGenerating] = useState<boolean>(false);
  const [publishing, setPublishing] = useState<boolean>(false);
  const [backendHealth, setBackendHealth] = useState<{
    status: string;
    openmetadata_connected: boolean;
  }>({
    status: 'checking',
    openmetadata_connected: false,
  });

  const [tables, setTables] = useState<TableOption[]>([]);
  const [selectedTableFqn, setSelectedTableFqn] = useState<string>('');
  const [rules, setRules] = useState<CandidateRule[]>([]);
  const [generationScope, setGenerationScope] =
    useState<GenerationScopeType>('TABLE');
  const [catalogServices, setCatalogServices] = useState<CatalogOption[]>([]);
  const [catalogDatabases, setCatalogDatabases] = useState<CatalogOption[]>([]);
  const [catalogSchemas, setCatalogSchemas] = useState<CatalogOption[]>([]);
  const [selectedServiceFqn, setSelectedServiceFqn] = useState<string>('');
  const [selectedDatabaseFqn, setSelectedDatabaseFqn] = useState<string>('');
  const [selectedSchemaFqn, setSelectedSchemaFqn] = useState<string>('');
  const [catalogLoading, setCatalogLoading] = useState<boolean>(false);
  const [bulkPreview, setBulkPreview] = useState<BulkGenerationPreview | null>(
    null
  );
  const [bulkPreviewOpen, setBulkPreviewOpen] = useState<boolean>(false);
  const [bulkJob, setBulkJob] = useState<GenerationJobSummary | null>(null);
  const [bulkJobItems, setBulkJobItems] = useState<GenerationJobItem[]>([]);
  const [advancedTypes, setAdvancedTypes] = useState<string[]>([
    'CROSS_COLUMN',
    'TEMPORAL',
    'CONDITIONAL_DEPENDENCY',
  ]);

  // Engine picker
  const [selectedEngines, setSelectedEngines] = useState<RuleEngine[]>([
    'BASIC',
  ]);

  // NT Governance state
  const [ntLoading, setNtLoading] = useState<boolean>(false);
  const [ntStatusLoading, setNtStatusLoading] = useState<boolean>(false);
  const [ntStatusError, setNtStatusError] = useState<string>('');
  const [ntStatus, setNtStatus] = useState<NtGovernanceStatus | null>(null);
  const [ntDefinitions, setNtDefinitions] = useState<NtTestDefinition[]>([]);
  const [ntResult, setNtResult] = useState<NtGovernanceSummary | null>(null);
  const [existingTestCases, setExistingTestCases] = useState<unknown[]>([]);
  const [loadingTestCases, setLoadingTestCases] = useState<boolean>(false);
  const [regexEditValue, setRegexEditValue] = useState<string>('');

  // Filter states
  const [statusFilter, setStatusFilter] = useState<
    'ALL' | 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'APPLIED'
  >('ALL');
  const [scopeFilter, setScopeFilter] = useState<'ALL' | 'table' | 'column'>(
    'ALL'
  );
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Modals
  const [editingRule, setEditingRule] = useState<CandidateRule | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState<boolean>(false);
  const [isConfigModalOpen, setIsConfigModalOpen] = useState<boolean>(false);
  const [customApiUrl, setCustomApiUrl] = useState<string>(
    getRecommenderBaseUrl()
  );
  const [editForm] = Form.useForm();

  // Load initial tables and check health
  useEffect(() => {
    const initialize = async () => {
      setLoading(true);
      try {
        const health = await ruleRecommenderAPI.checkHealth();
        setBackendHealth(health);

        const openmetadataTables =
          await ruleRecommenderAPI.getOpenMetadataTables();
        if (openmetadataTables.length > 0) {
          setTables(openmetadataTables);
          setSelectedTableFqn(openmetadataTables[0].fullyQualifiedName);
        } else {
          // Fallback initial table options
          const defaultOptions: TableOption[] = [
            {
              name: 'customers',
              fullyQualifiedName:
                'sample_ecommerce_service.ecommerce_db.sales.customers',
              description: 'Customer contact and demographic profiles',
              columnsCount: 5,
              database: 'ecommerce_db',
              schema: 'sales',
            },
            {
              name: 'orders',
              fullyQualifiedName:
                'sample_ecommerce_service.ecommerce_db.sales.orders',
              description: 'Customer purchase orders and status',
              columnsCount: 5,
              database: 'ecommerce_db',
              schema: 'sales',
            },
            {
              name: 'products',
              fullyQualifiedName:
                'sample_ecommerce_service.ecommerce_db.sales.products',
              description: 'Catalog products, pricing and inventory',
              columnsCount: 5,
              database: 'ecommerce_db',
              schema: 'sales',
            },
          ];
          setTables(defaultOptions);
          setSelectedTableFqn(defaultOptions[0].fullyQualifiedName);
        }
      } finally {
        setLoading(false);
      }
    };

    initialize();
  }, []);

  useEffect(() => {
    const initializeCatalog = async () => {
      setCatalogLoading(true);
      try {
        const services = await ruleRecommenderAPI.getCatalogServices();
        setCatalogServices(services);
        const serviceFqn = services[0]?.fullyQualifiedName || '';
        setSelectedServiceFqn(serviceFqn);
        if (!serviceFqn) {
          return;
        }

        const databases = await ruleRecommenderAPI.getCatalogDatabases(
          serviceFqn
        );
        setCatalogDatabases(databases);
        const databaseFqn = databases[0]?.fullyQualifiedName || '';
        setSelectedDatabaseFqn(databaseFqn);
        if (!databaseFqn) {
          return;
        }

        const schemas = await ruleRecommenderAPI.getCatalogSchemas(databaseFqn);
        setCatalogSchemas(schemas);
        const schemaFqn = schemas[0]?.fullyQualifiedName || '';
        setSelectedSchemaFqn(schemaFqn);
        if (!schemaFqn) {
          return;
        }

        const catalogTables = await ruleRecommenderAPI.getCatalogTables(
          schemaFqn
        );
        if (catalogTables.length > 0) {
          setTables(catalogTables);
          setSelectedTableFqn((current) =>
            catalogTables.some((table) => table.fullyQualifiedName === current)
              ? current
              : catalogTables[0].fullyQualifiedName
          );
        }
      } catch (error) {
        notification.warning({
          message: 'Catalog hierarchy unavailable',
          description: String(error),
        });
      } finally {
        setCatalogLoading(false);
      }
    };

    initializeCatalog();
  }, []);

  const loadNtGovernanceStatus = useCallback(async () => {
    if (!selectedTableFqn) {
      setNtDefinitions([]);
      setNtStatus(null);

      return;
    }

    setNtStatusLoading(true);
    setNtStatusError('');
    try {
      const status = await ruleRecommenderAPI.getNtGovernanceStatus(
        selectedTableFqn
      );
      setNtStatus(status);
      setNtDefinitions(status.data);
    } catch (error) {
      setNtDefinitions([]);
      setNtStatus(null);
      setNtStatusError(String(error));
    } finally {
      setNtStatusLoading(false);
    }
  }, [selectedTableFqn]);

  // Re-read persisted NT status whenever the selected table changes.
  useEffect(() => {
    loadNtGovernanceStatus();
  }, [loadNtGovernanceStatus]);

  // Start with an empty result table. Rules are shown only after Generate.
  useEffect(() => {
    setRules([]);
  }, [selectedTableFqn]);

  // Merge rule lists by id; preserve review status from existing rules
  const mergeById = (
    existing: CandidateRule[],
    incoming: CandidateRule[]
  ): CandidateRule[] => {
    const byId = new Map(existing.map((r) => [r.id, r]));
    const idByIdentity = new Map(
      existing.map((rule) => [getRuleIdentity(rule), rule.id])
    );

    for (const r of incoming) {
      const previousId = idByIdentity.get(getRuleIdentity(r));
      const prev =
        byId.get(r.id) ?? (previousId ? byId.get(previousId) : undefined);

      if (previousId && previousId !== r.id) {
        byId.delete(previousId);
      }

      byId.set(
        r.id,
        prev && r.status !== 'APPLIED'
          ? { ...r, status: prev.status === 'APPLIED' ? r.status : prev.status }
          : r
      );
      idByIdentity.set(getRuleIdentity(r), r.id);
    }

    return Array.from(byId.values()).filter(isRuleVisible);
  };

  const handleServiceChange = async (serviceFqn: string) => {
    setSelectedServiceFqn(serviceFqn);
    setCatalogLoading(true);
    try {
      const databases = await ruleRecommenderAPI.getCatalogDatabases(
        serviceFqn
      );
      setCatalogDatabases(databases);
      const databaseFqn = databases[0]?.fullyQualifiedName || '';
      setSelectedDatabaseFqn(databaseFqn);
      const schemas = databaseFqn
        ? await ruleRecommenderAPI.getCatalogSchemas(databaseFqn)
        : [];
      setCatalogSchemas(schemas);
      const schemaFqn = schemas[0]?.fullyQualifiedName || '';
      setSelectedSchemaFqn(schemaFqn);
      const catalogTables = schemaFqn
        ? await ruleRecommenderAPI.getCatalogTables(schemaFqn)
        : [];
      setTables(catalogTables);
      setSelectedTableFqn(catalogTables[0]?.fullyQualifiedName || '');
    } catch (error) {
      notification.error({
        message: 'Cannot load catalog',
        description: String(error),
      });
    } finally {
      setCatalogLoading(false);
    }
  };

  const handleDatabaseChange = async (databaseFqn: string) => {
    setSelectedDatabaseFqn(databaseFqn);
    setCatalogLoading(true);
    try {
      const schemas = await ruleRecommenderAPI.getCatalogSchemas(databaseFqn);
      setCatalogSchemas(schemas);
      const schemaFqn = schemas[0]?.fullyQualifiedName || '';
      setSelectedSchemaFqn(schemaFqn);
      const catalogTables = schemaFqn
        ? await ruleRecommenderAPI.getCatalogTables(schemaFqn)
        : [];
      setTables(catalogTables);
      setSelectedTableFqn(catalogTables[0]?.fullyQualifiedName || '');
    } catch (error) {
      notification.error({
        message: 'Cannot load catalog',
        description: String(error),
      });
    } finally {
      setCatalogLoading(false);
    }
  };

  const handleSchemaChange = async (schemaFqn: string) => {
    setSelectedSchemaFqn(schemaFqn);
    setCatalogLoading(true);
    try {
      const catalogTables = await ruleRecommenderAPI.getCatalogTables(
        schemaFqn
      );
      setTables(catalogTables);
      setSelectedTableFqn(catalogTables[0]?.fullyQualifiedName || '');
    } catch (error) {
      notification.error({
        message: 'Cannot load tables',
        description: String(error),
      });
    } finally {
      setCatalogLoading(false);
    }
  };

  const bulkTargetFqn =
    generationScope === 'DATABASE'
      ? selectedDatabaseFqn
      : generationScope === 'SCHEMA'
      ? selectedSchemaFqn
      : selectedTableFqn;

  const buildBulkRequest = (): BulkGenerationRequest => ({
    scope: {
      type: generationScope,
      target_fqn: bulkTargetFqn,
    },
    engines: selectedEngines,
    options: {
      use_llm: true,
      min_confidence: 0.6,
      advanced_types: selectedEngines.includes('ADVANCED')
        ? advancedTypes
        : undefined,
      profile_history_limit: 4,
    },
    concurrency: {
      metadata: 4,
      basic: 8,
      statistical: 2,
      advanced: 2,
    },
  });

  const handlePreviewBulkGeneration = async () => {
    if (!bulkTargetFqn || selectedEngines.length === 0) {
      return;
    }
    setGenerating(true);
    try {
      const preview = await ruleRecommenderAPI.previewGenerationJob(
        buildBulkRequest()
      );
      setBulkPreview(preview);
      setBulkPreviewOpen(true);
    } catch (error) {
      notification.error({
        message: 'Bulk preview failed',
        description: String(error),
      });
    } finally {
      setGenerating(false);
    }
  };

  const handleConfirmBulkGeneration = async () => {
    setGenerating(true);
    try {
      const job = await ruleRecommenderAPI.startGenerationJob(
        buildBulkRequest()
      );
      setBulkPreviewOpen(false);
      setBulkJob(job);
      setBulkJobItems([]);
      notification.success({
        message: 'Bulk generation started',
        description: `${job.total_tables} tables, ${job.total_items} engine tasks`,
      });
    } catch (error) {
      setGenerating(false);
      notification.error({
        message: 'Cannot start bulk generation',
        description: String(error),
      });
    }
  };

  // Handle trigger generate recommendation across selected engines
  const handleGenerateRules = async () => {
    if (!bulkTargetFqn || selectedEngines.length === 0) {
      return;
    }
    if (generationScope !== 'TABLE') {
      await handlePreviewBulkGeneration();

      return;
    }
    setGenerating(true);
    try {
      const results = await Promise.all([
        selectedEngines.includes('BASIC')
          ? ruleRecommenderAPI.generateRules(selectedTableFqn, ['BASIC'])
          : Promise.resolve([] as CandidateRule[]),
        selectedEngines.includes('ADVANCED')
          ? ruleRecommenderAPI.generateAdvancedRules(selectedTableFqn)
          : Promise.resolve([] as CandidateRule[]),
        selectedEngines.includes('STATISTICAL')
          ? ruleRecommenderAPI.generateStatisticalRules(selectedTableFqn)
          : Promise.resolve([] as CandidateRule[]),
      ]);
      const merged = results.flat().filter(isRuleVisible);
      setRules((prev) => mergeById(prev, merged));
      notification.success({
        message: t('label.recommendation-complete'),
        description: `Generated ${
          merged.length
        } candidate rules from [${selectedEngines.join(
          ', '
        )}] for ${selectedTableFqn.split('.').pop()}`,
      });
    } catch (err) {
      notification.error({
        message: t('label.recommendation-failed'),
        description: String(err),
      });
    } finally {
      setGenerating(false);
    }
  };

  useEffect(() => {
    if (!bulkJob || TERMINAL_JOB_STATUSES.has(bulkJob.status)) {
      return;
    }
    let cancelled = false;
    const poll = async () => {
      try {
        const [summary, results] = await Promise.all([
          ruleRecommenderAPI.getGenerationJob(bulkJob.job_id),
          ruleRecommenderAPI.getGenerationJobResults(bulkJob.job_id),
        ]);
        if (cancelled) {
          return;
        }
        setBulkJob(summary);
        setBulkJobItems(results.items);
        if (TERMINAL_JOB_STATUSES.has(summary.status)) {
          setGenerating(false);
          notification[summary.status === 'FAILED' ? 'error' : 'success']({
            message: `Bulk job ${summary.status.toLowerCase()}`,
            description: `${summary.processed_items}/${summary.total_items} tasks processed, ${summary.failed_items} failed`,
          });

          return;
        }
        window.setTimeout(poll, 1500);
      } catch (error) {
        if (!cancelled) {
          setGenerating(false);
          notification.error({
            message: 'Cannot refresh bulk job',
            description: String(error),
          });
        }
      }
    };
    const timer = window.setTimeout(poll, 500);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [bulkJob?.job_id, bulkJob?.status]);

  // Create the 15 default NT governance test cases
  const handleCreateDefaultTestCases = async () => {
    if (!selectedTableFqn) {
      return;
    }
    setNtLoading(true);
    try {
      const summary = await ruleRecommenderAPI.createDefaultTestCases(
        selectedTableFqn
      );
      setNtResult(summary);
      await loadNtGovernanceStatus();
      notification.success({
        message: t('label.nt-creation-success'),
        description: `${summary.created_count} created, ${summary.skipped_count} skipped, ${summary.failed_count} failed`,
      });
    } catch (err) {
      notification.error({
        message: t('label.nt-creation-failed'),
        description: String(err),
      });
    } finally {
      setNtLoading(false);
    }
  };

  // Fetch existing test cases for the selected table
  const handleViewExistingTestCases = async () => {
    if (!selectedTableFqn) {
      return;
    }
    setLoadingTestCases(true);
    try {
      const cases = await ruleRecommenderAPI.getTableTestCases(
        selectedTableFqn
      );
      setExistingTestCases(cases);
    } finally {
      setLoadingTestCases(false);
    }
  };

  // Review single rule action
  const handleReviewRule = async (
    ruleId: string,
    action: 'ACCEPT' | 'REJECT'
  ) => {
    await ruleRecommenderAPI.reviewRule(ruleId, action);
    setRules((prev) =>
      prev.map((r) =>
        r.id === ruleId
          ? { ...r, status: action === 'ACCEPT' ? 'ACCEPTED' : 'REJECTED' }
          : r
      )
    );
    notification.info({
      message: action === 'ACCEPT' ? 'Rule Accepted' : 'Rule Rejected',
      description: `Rule ${ruleId} has been ${
        action === 'ACCEPT' ? 'accepted' : 'rejected'
      }.`,
    });
  };

  // Accept all pending rules
  const handleAcceptAll = () => {
    setRules((prev) =>
      prev.map((r) =>
        isRuleVisible(r) &&
        (r.status === 'PENDING' ||
          r.status === 'DRAFT' ||
          r.status === 'EDITED')
          ? { ...r, status: 'ACCEPTED' }
          : r
      )
    );
    notification.success({
      message: 'Batch Review',
      description:
        'All pending rules for this table have been marked as Accepted.',
    });
  };

  // Publish accepted rules to OpenMetadata
  const handlePublish = async () => {
    const acceptedRules = rules.filter(
      (r) => isRuleVisible(r) && r.status === 'ACCEPTED'
    );
    if (acceptedRules.length === 0) {
      notification.warning({
        message: 'No Accepted Rules',
        description:
          'Please accept at least one rule before publishing to OpenMetadata.',
      });

      return;
    }

    setPublishing(true);
    try {
      const res = await ruleRecommenderAPI.publishRules(
        selectedTableFqn,
        acceptedRules
      );

      const tableDataQualityUrl = getEntityDetailsPath(
        EntityType.TABLE,
        selectedTableFqn,
        EntityTabs.PROFILER,
        ProfilerTabPath.DATA_QUALITY
      );

      notification.success({
        message: 'Publish Thành Công!',
        description: (
          <div>
            <p style={{ margin: 0 }}>
              Đã đồng bộ <b>{res.publishedCount}</b> rule thành test cases trong
              OpenMetadata cho bảng{' '}
              <b>{selectedTable?.name || selectedTableFqn}</b>.
            </p>
            <div style={{ marginTop: 10 }}>
              <Button
                icon={<ArrowRightOutlined />}
                size="small"
                type="primary"
                onClick={() => navigate(tableDataQualityUrl)}
              >
                Xem trong Bảng ({selectedTable?.name || 'Table'})
              </Button>
            </div>
          </div>
        ),
        duration: 10,
      });
    } catch {
      notification.error({
        message: 'Publish Failed',
        description: 'Error publishing test cases to OpenMetadata.',
      });
    } finally {
      setPublishing(false);
    }
  };

  // Open edit rule modal
  const openEditRuleModal = (rule: CandidateRule) => {
    setEditingRule(rule);
    const rangeKeys = RANGE_PARAMETER_KEYS[rule.rule_type];
    const initialRegex =
      rule.rule_type === 'columnValuesToMatchRegex' &&
      typeof rule.parameters?.regex === 'string'
        ? rule.parameters.regex
        : '';
    setRegexEditValue(initialRegex);
    editForm.setFieldsValue({
      reason: rule.reason,
      sql_expression: getRuleDisplaySql(rule),
      rangeMin: rangeKeys ? rule.parameters?.[rangeKeys.min] : undefined,
      rangeMax: rangeKeys ? rule.parameters?.[rangeKeys.max] : undefined,
      minLength: rule.parameters?.minLength,
      maxLength: rule.parameters?.maxLength,
      parameters: JSON.stringify(rule.parameters || {}, null, 2),
    });
    setIsEditModalOpen(true);
  };

  // Save edited rule
  const handleSaveEditedRule = () => {
    editForm.validateFields().then((values) => {
      if (!editingRule) {
        return;
      }

      let parsedParams = { ...(editingRule.parameters || {}) };
      const rangeKeys = RANGE_PARAMETER_KEYS[editingRule.rule_type];

      if (rangeKeys) {
        parsedParams = {
          ...parsedParams,
          [rangeKeys.min]: values.rangeMin,
          [rangeKeys.max]: values.rangeMax,
        };
      } else if (isLengthBetweenRule(editingRule.rule_type)) {
        parsedParams = {
          ...parsedParams,
          minLength: values.minLength,
          maxLength: values.maxLength,
        };
      } else if (editingRule.rule_type === 'columnValuesToMatchRegex') {
        parsedParams = { ...parsedParams, regex: regexEditValue };
      } else if (!isCustomSqlRule(editingRule)) {
        try {
          parsedParams = JSON.parse(values.parameters || '{}');
        } catch {
          notification.error({
            message: 'Invalid Parameters',
            description: 'Parameters must be valid JSON.',
          });

          return;
        }
      }

      const editedSql = isCustomSqlRule(editingRule)
        ? values.sql_expression?.trim()
        : editingRule.sql_expression;

      setRules((prev) =>
        prev.map((r) =>
          r.id === editingRule.id
            ? {
                ...r,
                reason: values.reason,
                sql_expression: editedSql,
                ...(isCustomSqlRule(editingRule) ? { sql: editedSql } : {}),
                parameters: parsedParams,
                edited_parameters: parsedParams,
                status: 'EDITED',
              }
            : r
        )
      );

      setIsEditModalOpen(false);
      setEditingRule(null);
      notification.success({
        message: 'Rule Updated',
        description: 'Parameters saved and rule marked as Edited.',
      });
    });
  };

  // Filtered rules
  const filteredRules = useMemo(() => {
    return rules.filter((r) => {
      if (!isRuleVisible(r)) {
        return false;
      }
      if (statusFilter !== 'ALL' && r.status !== statusFilter) {
        return false;
      }
      if (scopeFilter !== 'ALL' && r.scope !== scopeFilter) {
        return false;
      }
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesRule = r.rule_type.toLowerCase().includes(query);
        const matchesCol = (r.column_name || '').toLowerCase().includes(query);
        const matchesReason = (r.reason || '').toLowerCase().includes(query);
        if (!matchesRule && !matchesCol && !matchesReason) {
          return false;
        }
      }

      return true;
    });
  }, [rules, statusFilter, scopeFilter, searchQuery]);

  // Statistics
  // DRAFT is treated as "pending review" — both are pre-review states.
  const stats = useMemo(() => {
    const visibleRules = rules.filter(isRuleVisible);
    const total = visibleRules.length;
    const pending = visibleRules.filter(
      (r) =>
        r.status === 'DRAFT' || r.status === 'PENDING' || r.status === 'EDITED'
    ).length;
    const accepted = visibleRules.filter((r) => r.status === 'ACCEPTED').length;
    const rejected = visibleRules.filter((r) => r.status === 'REJECTED').length;
    const applied = visibleRules.filter((r) => r.status === 'APPLIED').length;
    const avgConfidence =
      total > 0
        ? (visibleRules.reduce((acc, curr) => acc + curr.confidence, 0) /
            total) *
          100
        : 0;

    return {
      total,
      pending,
      accepted,
      rejected,
      applied,
      avgConfidence: Math.round(avgConfidence),
    };
  }, [rules]);

  const selectedTable = useMemo(() => {
    return tables.find((t) => t.fullyQualifiedName === selectedTableFqn);
  }, [tables, selectedTableFqn]);

  const bulkTableResults = useMemo<BulkTableResult[]>(() => {
    const grouped = new Map<string, BulkTableResult>();
    const statusRank: Record<GenerationJobItemStatus, number> = {
      FAILED: 6,
      PARTIAL: 5,
      RUNNING: 4,
      PENDING: 3,
      SUCCESS: 2,
      SKIPPED: 1,
    };
    for (const item of bulkJobItems) {
      const current = grouped.get(item.table_fqn) ?? {
        tableFqn: item.table_fqn,
        items: {},
        generatedCount: 0,
        status: 'SKIPPED' as GenerationJobItemStatus,
      };
      current.items[item.engine] = item;
      current.generatedCount += item.generated_count;
      if (statusRank[item.status] > statusRank[current.status]) {
        current.status = item.status;
      }
      grouped.set(item.table_fqn, current);
    }

    return Array.from(grouped.values()).sort((left, right) =>
      left.tableFqn.localeCompare(right.tableFqn)
    );
  }, [bulkJobItems]);

  const handleOpenBulkTable = async (tableFqn: string) => {
    setGenerationScope('TABLE');
    setSelectedTableFqn(tableFqn);
    setLoading(true);
    try {
      const tableRules = await ruleRecommenderAPI.getRules(tableFqn);
      setRules(tableRules.filter(isRuleVisible));
    } finally {
      setLoading(false);
    }
  };

  const handleRetryBulkTable = async (record: BulkTableResult) => {
    if (!bulkJob) {
      return;
    }
    const retryEngines = Object.values(record.items)
      .filter(
        (item): item is GenerationJobItem =>
          item !== undefined &&
          (item.status === 'FAILED' || item.status === 'PARTIAL')
      )
      .map((item) => item.engine);
    if (retryEngines.length === 0) {
      return;
    }
    setGenerating(true);
    try {
      const retryJob = await ruleRecommenderAPI.retryGenerationJob(
        bulkJob.job_id,
        [record.tableFqn],
        retryEngines
      );
      setBulkJob(retryJob);
      setBulkJobItems([]);
    } catch (error) {
      setGenerating(false);
      notification.error({
        message: 'Retry failed',
        description: String(error),
      });
    }
  };

  const renderBulkEngineStatus = (item: GenerationJobItem | undefined) => {
    if (!item) {
      return <Text type="secondary">—</Text>;
    }
    const colors: Record<GenerationJobItemStatus, string> = {
      PENDING: 'default',
      RUNNING: 'processing',
      SUCCESS: 'success',
      PARTIAL: 'warning',
      FAILED: 'error',
      SKIPPED: 'default',
    };

    return (
      <Tooltip
        title={
          item.errors[0]?.message ||
          `${item.generated_count} generated, ${item.existing_count} existing`
        }
      >
        <Tag color={colors[item.status]}>
          {item.status}{' '}
          {item.generated_count > 0 ? `(${item.generated_count})` : ''}
        </Tag>
      </Tooltip>
    );
  };

  const bulkColumns: ColumnsType<BulkTableResult> = [
    {
      title: 'Table',
      dataIndex: 'tableFqn',
      key: 'tableFqn',
      ellipsis: true,
      render: (value: string) => (
        <Text ellipsis={{ tooltip: value }}>{value}</Text>
      ),
    },
    {
      title: 'Basic',
      key: 'basic',
      width: 145,
      render: (_, record) => renderBulkEngineStatus(record.items.BASIC),
    },
    {
      title: 'Statistical',
      key: 'statistical',
      width: 145,
      render: (_, record) => renderBulkEngineStatus(record.items.STATISTICAL),
    },
    {
      title: 'Advanced',
      key: 'advanced',
      width: 145,
      render: (_, record) => renderBulkEngineStatus(record.items.ADVANCED),
    },
    {
      title: 'Rules',
      dataIndex: 'generatedCount',
      key: 'generatedCount',
      width: 80,
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 170,
      render: (_, record) => (
        <Space>
          <Button
            size="small"
            onClick={() => handleOpenBulkTable(record.tableFqn)}
          >
            View rules
          </Button>
          {(record.status === 'FAILED' || record.status === 'PARTIAL') && (
            <Button
              icon={<ReloadOutlined />}
              size="small"
              onClick={() => handleRetryBulkTable(record)}
            >
              Retry
            </Button>
          )}
        </Space>
      ),
    },
  ];

  // Table Columns definition
  const columns: ColumnsType<CandidateRule> = [
    {
      title: 'Rule Type',
      key: 'rule_type',
      width: 230,
      render: (_, record) => {
        const isTable = record.scope === 'table';
        const engine = record.engine || 'BASIC';
        const engineColor =
          engine === 'ADVANCED'
            ? 'magenta'
            : engine === 'STATISTICAL'
            ? 'cyan'
            : 'geekblue';

        return (
          <div className="rule-name-cell">
            <span className="rule-type-code">{record.rule_type}</span>
            <Space wrap orientation="horizontal" size={4}>
              <Tag color={engineColor}>{engine}</Tag>
              {isTable ? <Tag color="purple">TABLE LEVEL</Tag> : null}
              {record.validation_status === 'WARNING' && (
                <Tooltip title={record.validation_message || ''}>
                  <Tag color="warning" icon={<FieldTimeOutlined />}>
                    WARN
                  </Tag>
                </Tooltip>
              )}
            </Space>
          </div>
        );
      },
    },
    {
      title: 'Column',
      key: 'target_columns',
      width: 150,
      render: (_, record) => {
        const columnsList =
          record.target_columns && record.target_columns.length > 0
            ? record.target_columns
            : record.column_name
            ? [record.column_name]
            : [];

        return columnsList.length > 0 ? (
          <div className="rule-column-list">
            {columnsList.map((column, index) => (
              <Tooltip key={`${column}-${index}`} title={column}>
                <div className="rule-column-cell">{column}</div>
              </Tooltip>
            ))}
          </div>
        ) : (
          <Text type="secondary">—</Text>
        );
      },
    },
    {
      title: 'Parameters / SQL',
      key: 'parameters',
      width: 320,
      render: (_, record) => {
        const params = record.parameters || {};
        const ruleType = record.rule_type;
        const highlightBox = {
          background: '#e6f4ff',
          border: '1px solid #91caff',
          padding: '6px 10px',
          borderRadius: 6,
        } as const;

        const ParamTile = ({
          label,
          value,
        }: {
          label: string;
          value: unknown;
        }) => (
          <div className="rule-parameter-tile">
            <Text className="rule-parameter-label" type="secondary">
              {label}
            </Text>
            <Text code className="rule-parameter-value">
              {value === undefined || value === null || value === ''
                ? '—'
                : String(value)}
            </Text>
          </div>
        );

        // Numeric range: columnValuesToBeBetween, tableRowCountToBeBetween,
        // and the 5 statistical Mean/Median/StdDev/Min/Max rules.
        const rangeKeys = RANGE_PARAMETER_KEYS[ruleType];

        if (rangeKeys) {
          const { min: minKey, max: maxKey } = rangeKeys;
          const minVal = params[minKey];
          const maxVal = params[maxKey];
          const label =
            ruleType === 'tableRowCountToBeBetween' ? 'rowCount' : 'value';

          return (
            <div style={highlightBox}>
              <Text
                strong
                style={{ fontSize: 12, display: 'block', marginBottom: 4 }}
              >
                {label} range
              </Text>
              <div className="rule-parameter-grid">
                <ParamTile label="Min" value={minVal} />
                <ParamTile label="Max" value={maxVal} />
              </div>
            </div>
          );
        }

        // Length range.
        if (isLengthBetweenRule(ruleType)) {
          return (
            <div style={highlightBox}>
              <Text
                strong
                style={{ fontSize: 12, display: 'block', marginBottom: 4 }}
              >
                length range
              </Text>
              <div className="rule-parameter-grid">
                <ParamTile label="Min length" value={params.minLength} />
                <ParamTile label="Max length" value={params.maxLength} />
              </div>
            </div>
          );
        }

        // Allowed set.
        if (ruleType === 'columnValuesToBeInSet') {
          const allowedValues = Array.isArray(params.allowedValues)
            ? params.allowedValues
            : [];

          return (
            <div style={highlightBox}>
              <Text
                strong
                style={{ fontSize: 12, display: 'block', marginBottom: 4 }}
              >
                allowed values ({allowedValues.length})
              </Text>
              {allowedValues.length === 0 ? (
                <Text italic style={{ fontSize: 12 }} type="secondary">
                  (empty set)
                </Text>
              ) : (
                <Space wrap size={4}>
                  {allowedValues.map((v, i) => (
                    <Tag color="blue" key={i} style={{ margin: 0 }}>
                      {String(v)}
                    </Tag>
                  ))}
                </Space>
              )}
            </div>
          );
        }

        // Regex pattern.
        if (
          ruleType === 'columnValuesToMatchRegex' &&
          typeof params.regex === 'string'
        ) {
          return (
            <Tooltip title={params.regex}>
              <div style={highlightBox}>
                <Text code style={{ fontSize: 12, wordBreak: 'break-all' }}>
                  {params.regex.length > 40
                    ? `${params.regex.slice(0, 40)}…`
                    : params.regex}
                </Text>
              </div>
            </Tooltip>
          );
        }

        // Custom SQL — fall through to sql_expression block.
        if (record.sql_expression) {
          const displaySql = getRuleDisplaySql(record);

          return (
            <div
              style={{
                background: '#f5f5f5',
                padding: '6px 10px',
                borderRadius: 6,
              }}
            >
              <Text code style={{ fontSize: 12 }}>
                {displaySql}
              </Text>
            </div>
          );
        }

        if (Object.keys(params).length > 0) {
          return (
            <div
              style={{
                background: '#f5f5f5',
                padding: '6px 10px',
                borderRadius: 6,
              }}
            >
              <Text code style={{ fontSize: 12 }}>
                {JSON.stringify(params)}
              </Text>
            </div>
          );
        }

        return (
          <Text italic type="secondary">
            No extra parameters
          </Text>
        );
      },
    },
    {
      title: 'Reason',
      dataIndex: 'reason',
      key: 'reason',
      width: 360,
      render: (text: string, record) => (
        <div className="rule-reason-cell">
          <Paragraph
            ellipsis={{
              rows: 3,
              expandable: true,
              symbol: 'more',
              tooltip: text,
            }}
            style={{ margin: 0, fontSize: 13, lineHeight: 1.5 }}
          >
            {text || (
              <Text italic type="secondary">
                No reason provided
              </Text>
            )}
          </Paragraph>
          {record.evidence && Object.keys(record.evidence).length > 0 && (
            <EvidencePopover evidence={record.evidence} />
          )}
        </div>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 130,
      render: (status: string) => {
        switch (status) {
          case 'ACCEPTED':
            return (
              <Tag color="success" icon={<CheckCircleOutlined />}>
                ACCEPTED
              </Tag>
            );
          case 'REJECTED':
            return (
              <Tag color="error" icon={<CloseCircleOutlined />}>
                REJECTED
              </Tag>
            );
          case 'EDITED':
            return (
              <Tag color="processing" icon={<EditOutlined />}>
                EDITED
              </Tag>
            );
          case 'APPLIED':
            return (
              <Tag color="success" icon={<SafetyCertificateOutlined />}>
                APPLIED
              </Tag>
            );
          case 'PENDING':
            return (
              <Tag color="warning" icon={<FieldTimeOutlined />}>
                PENDING
              </Tag>
            );
          default:
            return (
              <Tag color="default" icon={<FieldTimeOutlined />}>
                DRAFT
              </Tag>
            );
        }
      },
    },
    {
      title: 'Review Action',
      key: 'action',
      width: 140,
      render: (_, record) =>
        record.status === 'APPLIED' ? (
          <Text type="secondary">Already applied</Text>
        ) : (
          <Space size={6}>
            <Tooltip title="Accept rule">
              <Button
                icon={<CheckOutlined />}
                size="small"
                style={{
                  borderColor:
                    record.status === 'ACCEPTED' ? undefined : '#52c41a',
                  color: record.status === 'ACCEPTED' ? undefined : '#52c41a',
                }}
                type={record.status === 'ACCEPTED' ? 'primary' : 'default'}
                onClick={() => handleReviewRule(record.id, 'ACCEPT')}
              />
            </Tooltip>
            <Tooltip title="Reject rule">
              <Button
                danger
                icon={<CloseOutlined />}
                size="small"
                type={record.status === 'REJECTED' ? 'primary' : 'default'}
                onClick={() => handleReviewRule(record.id, 'REJECT')}
              />
            </Tooltip>
            <Tooltip title="Edit parameters">
              <Button
                icon={<EditOutlined />}
                size="small"
                onClick={() => openEditRuleModal(record)}
              />
            </Tooltip>
          </Space>
        ),
    },
  ];

  return (
    <PageLayoutV1 pageTitle="Data Quality Rule Recommender">
      <div className="rule-recommender-container">
        {/* Banner Header */}
        <div className="header-banner">
          <div className="header-info">
            <div className="header-title-row">
              <h2>Data Quality Rule Recommender</h2>
            </div>
            <p>
              Automated data quality rule suggestion engine with Golden Dataset
              benchmarks & OpenMetadata live sync.
            </p>
          </div>

          <div className="header-actions">
            <div className="status-pill">
              <span
                className={`status-dot ${
                  backendHealth.status === 'ok' ||
                  backendHealth.status === 'online'
                    ? 'online'
                    : 'offline'
                }`}
              />
              <span>
                Backend API:{' '}
                {backendHealth.status === 'ok' ||
                backendHealth.status === 'online'
                  ? 'Connected'
                  : 'Offline (Mock Mode)'}
              </span>
            </div>
            <Tooltip title="Configure Rule Recommender API Endpoint">
              <Button
                icon={<SettingOutlined />}
                onClick={() => setIsConfigModalOpen(true)}
              />
            </Tooltip>
            <Select
              allowClear
              mode="multiple"
              options={[
                { value: 'BASIC', label: t('label.engine-basic') },
                { value: 'ADVANCED', label: t('label.engine-advanced') },
                { value: 'STATISTICAL', label: t('label.engine-statistical') },
              ]}
              placeholder={t('label.select-engines')}
              style={{ width: 280 }}
              value={selectedEngines}
              onChange={setSelectedEngines}
            />
            <Button
              disabled={selectedEngines.length === 0 || !bulkTargetFqn}
              loading={generating}
              style={{ background: '#52c41a', borderColor: '#52c41a' }}
              type="primary"
              onClick={handleGenerateRules}
            >
              {t('label.run-ai-recommendation')}
            </Button>
            <Button
              disabled={stats.accepted === 0}
              loading={publishing}
              type="primary"
              onClick={handlePublish}
            >
              Publish ({stats.accepted})
            </Button>
          </div>
        </div>

        <Card
          style={{ borderRadius: 12, marginBottom: 20 }}
          title="Generation scope"
        >
          <Row gutter={[16, 16]}>
            <Col lg={6} md={12} xs={24}>
              <Text strong style={{ display: 'block', marginBottom: 6 }}>
                Scope
              </Text>
              <Radio.Group
                buttonStyle="solid"
                optionType="button"
                options={[
                  { label: 'Table', value: 'TABLE' },
                  { label: 'Schema', value: 'SCHEMA' },
                  { label: 'Database', value: 'DATABASE' },
                ]}
                value={generationScope}
                onChange={(event) =>
                  setGenerationScope(event.target.value as GenerationScopeType)
                }
              />
            </Col>
            <Col lg={6} md={12} xs={24}>
              <Text strong style={{ display: 'block', marginBottom: 6 }}>
                Service
              </Text>
              <Select
                showSearch
                loading={catalogLoading}
                options={catalogServices.map((item) => ({
                  value: item.fullyQualifiedName,
                  label: item.name,
                }))}
                style={{ width: '100%' }}
                value={selectedServiceFqn || undefined}
                onChange={handleServiceChange}
              />
            </Col>
            <Col lg={6} md={12} xs={24}>
              <Text strong style={{ display: 'block', marginBottom: 6 }}>
                Database
              </Text>
              <Select
                showSearch
                loading={catalogLoading}
                options={catalogDatabases.map((item) => ({
                  value: item.fullyQualifiedName,
                  label: item.name,
                }))}
                style={{ width: '100%' }}
                value={selectedDatabaseFqn || undefined}
                onChange={handleDatabaseChange}
              />
            </Col>
            {generationScope !== 'DATABASE' && (
              <Col lg={6} md={12} xs={24}>
                <Text strong style={{ display: 'block', marginBottom: 6 }}>
                  Schema
                </Text>
                <Select
                  showSearch
                  loading={catalogLoading}
                  options={catalogSchemas.map((item) => ({
                    value: item.fullyQualifiedName,
                    label: item.name,
                  }))}
                  style={{ width: '100%' }}
                  value={selectedSchemaFqn || undefined}
                  onChange={handleSchemaChange}
                />
              </Col>
            )}
          </Row>
          {selectedEngines.includes('ADVANCED') && (
            <div style={{ marginTop: 16 }}>
              <Text strong style={{ display: 'block', marginBottom: 6 }}>
                Advanced rule types
              </Text>
              <Select
                mode="multiple"
                options={[
                  { label: 'Temporal', value: 'TEMPORAL' },
                  { label: 'Cross-column', value: 'CROSS_COLUMN' },
                  {
                    label: 'Conditional dependency',
                    value: 'CONDITIONAL_DEPENDENCY',
                  },
                ]}
                style={{ maxWidth: 640, width: '100%' }}
                value={advancedTypes}
                onChange={setAdvancedTypes}
              />
            </div>
          )}
          <Alert
            showIcon
            message={
              generationScope === 'TABLE'
                ? 'This run targets one table and returns rules immediately.'
                : `This run creates a background job for every table in the selected ${generationScope.toLowerCase()}.`
            }
            style={{ marginTop: 16 }}
            type={generationScope === 'TABLE' ? 'info' : 'warning'}
          />
        </Card>

        {/* Table Selector Card */}
        {generationScope === 'TABLE' && (
          <Card style={{ borderRadius: 12, marginBottom: 20 }}>
            <Row align="middle" gutter={[20, 16]}>
              <Col md={10} xs={24}>
                <Text
                  strong
                  style={{ fontSize: 14, display: 'block', marginBottom: 6 }}
                >
                  <DatabaseOutlined style={{ marginRight: 6 }} />
                  Target Data Asset (Table)
                </Text>
                <Select
                  showSearch
                  filterOption={(input, option) =>
                    (option?.label ?? '')
                      .toString()
                      .toLowerCase()
                      .includes(input.toLowerCase())
                  }
                  options={tables.map((t) => ({
                    value: t.fullyQualifiedName,
                    label: `${t.name} (${t.fullyQualifiedName})`,
                  }))}
                  placeholder="Select a table to analyze"
                  style={{ width: '100%' }}
                  value={selectedTableFqn}
                  onChange={setSelectedTableFqn}
                />
                {selectedTableFqn && (
                  <div style={{ marginTop: 8 }}>
                    <Button
                      icon={<LinkOutlined />}
                      size="small"
                      style={{ padding: 0, fontSize: 13 }}
                      type="link"
                      onClick={() =>
                        navigate(
                          getEntityDetailsPath(
                            EntityType.TABLE,
                            selectedTableFqn,
                            EntityTabs.PROFILER,
                            ProfilerTabPath.DATA_QUALITY
                          )
                        )
                      }
                    >
                      Xem Data Quality của bảng (
                      {selectedTable?.name || selectedTableFqn.split('.').pop()}
                      )
                    </Button>
                  </div>
                )}
              </Col>
              <Col md={14} xs={24}>
                {selectedTable && (
                  <Descriptions column={{ xs: 1, sm: 2, md: 3 }} size="small">
                    <Descriptions.Item label="Schema">
                      <Tag color="cyan">
                        {selectedTable.schema || 'default'}
                      </Tag>
                    </Descriptions.Item>
                    <Descriptions.Item label="Database">
                      <Tag color="geekblue">
                        {selectedTable.database || 'default'}
                      </Tag>
                    </Descriptions.Item>
                    <Descriptions.Item label="Columns">
                      <Badge
                        count={selectedTable.columnsCount || 5}
                        style={{ backgroundColor: '#108ee9' }}
                      />
                    </Descriptions.Item>
                    <Descriptions.Item label="Description" span={3}>
                      <Text
                        ellipsis={{ tooltip: selectedTable.description }}
                        type="secondary"
                      >
                        {selectedTable.description || 'No description provided'}
                      </Text>
                    </Descriptions.Item>
                  </Descriptions>
                )}
              </Col>
            </Row>
          </Card>
        )}

        {bulkJob && (
          <Card
            extra={
              <Tag color={bulkJob.status === 'FAILED' ? 'error' : 'processing'}>
                {bulkJob.status}
              </Tag>
            }
            style={{ borderRadius: 12, marginBottom: 20 }}
            title={`Bulk generation job ${bulkJob.job_id}`}
          >
            <Progress
              percent={
                bulkJob.total_items > 0
                  ? Math.round(
                      (bulkJob.processed_items / bulkJob.total_items) * 100
                    )
                  : 0
              }
              status={bulkJob.status === 'FAILED' ? 'exception' : undefined}
            />
            <Descriptions column={{ xs: 2, md: 4 }} size="small">
              <Descriptions.Item label="Processed">
                {bulkJob.processed_items}/{bulkJob.total_items}
              </Descriptions.Item>
              <Descriptions.Item label="Successful">
                {bulkJob.successful_items}
              </Descriptions.Item>
              <Descriptions.Item label="Partial">
                {bulkJob.partial_items}
              </Descriptions.Item>
              <Descriptions.Item label="Failed">
                {bulkJob.failed_items}
              </Descriptions.Item>
            </Descriptions>
            <Table
              columns={bulkColumns}
              dataSource={bulkTableResults}
              locale={{ emptyText: 'Waiting for job results...' }}
              pagination={{ pageSize: 10, showSizeChanger: true }}
              rowKey="tableFqn"
              scroll={{ x: 900 }}
              size="small"
            />
          </Card>
        )}

        {/* Metric KPI cards */}
        <Row gutter={[16, 16]}>
          <Col lg={4} sm={8} xs={12}>
            <div className="stat-card">
              <span className="stat-label">Total Rules</span>
              <span className="stat-value primary">{stats.total}</span>
            </div>
          </Col>
          <Col lg={4} sm={8} xs={12}>
            <div className="stat-card">
              <span className="stat-label">Pending Review</span>
              <span className="stat-value warning">{stats.pending}</span>
            </div>
          </Col>
          <Col lg={4} sm={8} xs={12}>
            <div className="stat-card">
              <span className="stat-label">Already Applied</span>
              <span className="stat-value success">{stats.applied}</span>
            </div>
          </Col>
          <Col lg={4} sm={8} xs={12}>
            <div className="stat-card">
              <span className="stat-label">Accepted</span>
              <span className="stat-value success">{stats.accepted}</span>
            </div>
          </Col>
          <Col lg={4} sm={8} xs={12}>
            <div className="stat-card">
              <span className="stat-label">Rejected</span>
              <span className="stat-value danger">{stats.rejected}</span>
            </div>
          </Col>
        </Row>

        {/* Tabs Container */}
        <div className="main-content-card">
          <Tabs
            defaultActiveKey="recommendations"
            items={[
              {
                key: 'recommendations',
                label: (
                  <span>
                    <ExperimentOutlined />
                    Candidate Rules ({filteredRules.length})
                  </span>
                ),
                children: (
                  <>
                    {/* Toolbar */}
                    <div className="toolbar-row">
                      <Space wrap size={12}>
                        <Input.Search
                          allowClear
                          placeholder="Search rule or column..."
                          style={{ width: 260 }}
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                        />
                        <Radio.Group
                          buttonStyle="solid"
                          value={statusFilter}
                          onChange={(e) => setStatusFilter(e.target.value)}
                        >
                          <Radio.Button value="ALL">
                            All ({stats.total})
                          </Radio.Button>
                          <Radio.Button value="PENDING">
                            Pending ({stats.pending})
                          </Radio.Button>
                          <Radio.Button value="ACCEPTED">
                            Accepted ({stats.accepted})
                          </Radio.Button>
                          <Radio.Button value="APPLIED">
                            Applied ({stats.applied})
                          </Radio.Button>
                          <Radio.Button value="REJECTED">
                            Rejected ({stats.rejected})
                          </Radio.Button>
                        </Radio.Group>
                        <Select
                          options={[
                            { value: 'ALL', label: 'All Scopes' },
                            { value: 'column', label: 'Column Rules' },
                            { value: 'table', label: 'Table Rules' },
                          ]}
                          style={{ width: 140 }}
                          value={scopeFilter}
                          onChange={setScopeFilter}
                        />
                      </Space>

                      <Space>
                        <Button
                          disabled={stats.pending === 0}
                          icon={<CheckOutlined />}
                          onClick={handleAcceptAll}
                        >
                          Accept All Pending
                        </Button>
                        <Button
                          icon={<ReloadOutlined />}
                          onClick={() => {
                            if (selectedTableFqn) {
                              ruleRecommenderAPI
                                .getRules(selectedTableFqn)
                                .then(setRules);
                            }
                          }}
                        >
                          Refresh
                        </Button>
                      </Space>
                    </div>

                    {/* Table View */}
                    <Table
                      columns={columns}
                      dataSource={filteredRules}
                      loading={loading || generating}
                      locale={{
                        emptyText: (
                          <Empty
                            description={
                              <span>
                                No candidate rules found. Click{' '}
                                <b>Run AI Recommendation</b> to generate.
                              </span>
                            }
                          />
                        ),
                      }}
                      pagination={{ pageSize: 8, showSizeChanger: true }}
                      rowKey="id"
                    />
                  </>
                ),
              },
              {
                key: 'nt-governance',
                label: (
                  <span>
                    <SafetyCertificateOutlined />
                    {t('label.nt-governance')}
                  </span>
                ),
                children: (
                  <div style={{ padding: '16px 0' }}>
                    <Alert
                      showIcon
                      description={t('label.nt-governance-description')}
                      message={t('label.nt-governance-title')}
                      style={{ marginBottom: 16, borderRadius: 8 }}
                      type="info"
                    />
                    <Space wrap style={{ marginBottom: 16 }}>
                      <Button
                        icon={<RocketOutlined />}
                        loading={ntLoading}
                        type="primary"
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

                    {ntStatusError && (
                      <Alert
                        showIcon
                        description={ntStatusError}
                        message="Unable to load NT rule status"
                        style={{ marginBottom: 16 }}
                        type="error"
                      />
                    )}

                    <Card
                      className="nt-governance-card"
                      extra={
                        ntStatus && (
                          <Space size={6}>
                            <Tag color="success">
                              {ntStatus.applied_count} APPLIED
                            </Tag>
                            <Tag>{ntStatus.not_applied_count} NOT APPLIED</Tag>
                          </Space>
                        )
                      }
                      size="small"
                      title={t('label.available-nt-definitions')}
                    >
                      <Table
                        columns={[
                          {
                            title: t('label.name'),
                            dataIndex: 'displayName',
                            key: 'displayName',
                            render: (value, record) => (
                              <div>
                                <Text strong>{value || record.name}</Text>
                                {value && value !== record.name && (
                                  <div>
                                    <Text code type="secondary">
                                      {record.name}
                                    </Text>
                                  </div>
                                )}
                              </div>
                            ),
                          },
                          {
                            title: t('label.description'),
                            dataIndex: 'description',
                            key: 'description',
                            ellipsis: true,
                          },
                          {
                            title: t('label.status'),
                            dataIndex: 'status',
                            key: 'status',
                            width: 130,
                            render: (status) =>
                              status === 'APPLIED' ? (
                                <Tag
                                  color="success"
                                  icon={<CheckCircleOutlined />}
                                >
                                  APPLIED
                                </Tag>
                              ) : (
                                <Tag>NOT APPLIED</Tag>
                              ),
                          },
                        ]}
                        dataSource={ntDefinitions}
                        loading={ntStatusLoading}
                        locale={{
                          emptyText: ntStatusError
                            ? 'Status unavailable'
                            : 'No NT definitions found',
                        }}
                        pagination={false}
                        rowKey="name"
                        size="small"
                      />
                    </Card>

                    {ntResult && (
                      <Card
                        className="nt-governance-card"
                        size="small"
                        title={t('label.nt-creation-result')}
                      >
                        <Row gutter={16} style={{ marginBottom: 12 }}>
                          <Col>
                            <Tag color="success">
                              {t('label.created')}: {ntResult.created_count}
                            </Tag>
                          </Col>
                          <Col>
                            <Tag color="warning">
                              {t('label.skipped')}: {ntResult.skipped_count}
                            </Tag>
                          </Col>
                          <Col>
                            <Tag color="error">
                              {t('label.failed')}: {ntResult.failed_count}
                            </Tag>
                          </Col>
                        </Row>
                        <Collapse ghost>
                          <Collapse.Panel
                            header={`${t('label.created-test-cases')} (${
                              ntResult.test_cases.length
                            })`}
                            key="created"
                          >
                            <List
                              dataSource={ntResult.test_cases}
                              renderItem={(tc) => (
                                <List.Item>
                                  <Text code>{tc.name}</Text>{' '}
                                  <Tag color="geekblue">
                                    {tc.testDefinition}
                                  </Tag>
                                </List.Item>
                              )}
                              size="small"
                            />
                          </Collapse.Panel>
                          {ntResult.skipped.length > 0 && (
                            <Collapse.Panel
                              header={`${t('label.skipped-test-cases')} (${
                                ntResult.skipped.length
                              })`}
                              key="skipped"
                            >
                              <List
                                dataSource={ntResult.skipped}
                                renderItem={(s) => (
                                  <List.Item>
                                    <Text code>{s.definition}</Text>{' '}
                                    <Text type="secondary">{s.reason}</Text>
                                  </List.Item>
                                )}
                                size="small"
                              />
                            </Collapse.Panel>
                          )}
                          {ntResult.failed.length > 0 && (
                            <Collapse.Panel
                              header={`${t('label.failed-test-cases')} (${
                                ntResult.failed.length
                              })`}
                              key="failed"
                            >
                              <List
                                dataSource={ntResult.failed}
                                renderItem={(f) => (
                                  <List.Item>
                                    <Text code>{f.definition}</Text>{' '}
                                    <Text type="danger">{f.reason}</Text>
                                  </List.Item>
                                )}
                                size="small"
                              />
                            </Collapse.Panel>
                          )}
                        </Collapse>
                      </Card>
                    )}

                    {existingTestCases.length > 0 && (
                      <Card
                        className="nt-governance-card"
                        size="small"
                        style={{ marginTop: 16 }}
                        title={t('label.existing-test-cases')}
                      >
                        <Table
                          columns={[
                            {
                              title: t('label.name'),
                              dataIndex: 'name',
                              key: 'name',
                            },
                            {
                              title: t('label.test-definition'),
                              dataIndex: 'testDefinition',
                              key: 'testDefinition',
                              render: (v) => <Tag color="geekblue">{v}</Tag>,
                            },
                            {
                              title: t('label.description'),
                              dataIndex: 'description',
                              key: 'description',
                            },
                          ]}
                          dataSource={existingTestCases.map((tc, idx) => {
                            const item = tc as {
                              name?: string;
                              testDefinition?: string;
                              description?: string;
                            };

                            return {
                              key: idx,
                              name: item.name,
                              testDefinition: item.testDefinition,
                              description: item.description,
                            };
                          })}
                          pagination={{ pageSize: 5 }}
                          size="small"
                        />
                      </Card>
                    )}
                  </div>
                ),
              },
            ]}
          />
        </div>

        <Modal
          destroyOnClose
          cancelButtonProps={{ disabled: generating }}
          confirmLoading={generating}
          okText={`Run on ${bulkPreview?.total_tables ?? 0} tables`}
          open={bulkPreviewOpen}
          title="Confirm bulk rule generation"
          width={720}
          onCancel={() => setBulkPreviewOpen(false)}
          onOk={handleConfirmBulkGeneration}
        >
          {bulkPreview && (
            <Space direction="vertical" size={16} style={{ width: '100%' }}>
              <Alert
                showIcon
                description="The job runs in the background. Individual table failures do not stop the remaining tables, and failed items can be retried from the result table."
                message={`This job will process ${bulkPreview.total_tables} tables and ${bulkPreview.total_items} engine tasks.`}
                type="warning"
              />
              <Descriptions bordered column={2} size="small">
                <Descriptions.Item label="Scope">
                  {bulkPreview.scope.type}
                </Descriptions.Item>
                <Descriptions.Item label="Target">
                  <Text copyable>{bulkPreview.scope.target_fqn}</Text>
                </Descriptions.Item>
                <Descriptions.Item label="Tables">
                  {bulkPreview.total_tables}
                </Descriptions.Item>
                <Descriptions.Item label="Engine tasks">
                  {bulkPreview.total_items}
                </Descriptions.Item>
                <Descriptions.Item label="Estimated LLM calls" span={2}>
                  <Space wrap>
                    {Object.entries(bulkPreview.estimated_llm_calls).map(
                      ([engine, count]) => (
                        <Tag color="purple" key={engine}>
                          {engine}: {count}
                        </Tag>
                      )
                    )}
                  </Space>
                </Descriptions.Item>
              </Descriptions>
              <Collapse
                items={[
                  {
                    key: 'tables',
                    label: `Tables in this run (${bulkPreview.total_tables})`,
                    children: (
                      <List
                        bordered
                        dataSource={bulkPreview.tables}
                        pagination={
                          bulkPreview.tables.length > 10
                            ? { pageSize: 10, size: 'small' }
                            : false
                        }
                        renderItem={(tableFqn) => (
                          <List.Item>
                            <Text copyable>{tableFqn}</Text>
                          </List.Item>
                        )}
                        size="small"
                      />
                    ),
                  },
                ]}
              />
            </Space>
          )}
        </Modal>

        {/* Edit Rule Modal */}
        <Modal
          destroyOnClose
          open={isEditModalOpen}
          title={`Edit Rule: ${editingRule?.rule_type}`}
          onCancel={() => {
            setIsEditModalOpen(false);
            setEditingRule(null);
          }}
          onOk={handleSaveEditedRule}
        >
          <Form form={editForm} layout="vertical">
            <Form.Item label="Inferred Rationale / Reason" name="reason">
              <Input.TextArea rows={3} />
            </Form.Item>
            {isCustomSqlRule(editingRule) && (
              <Form.Item
                extra="Edit the SQL used to identify rows that violate this rule."
                label="SQL expression"
                name="sql_expression"
                rules={[
                  {
                    required: true,
                    whitespace: true,
                    message: 'Enter the SQL expression.',
                  },
                ]}
              >
                <Input.TextArea
                  autoSize={{ minRows: 7, maxRows: 16 }}
                  className="rule-sql-editor"
                  placeholder="SELECT * FROM ... WHERE ..."
                  spellCheck={false}
                />
              </Form.Item>
            )}
            {editingRule && RANGE_PARAMETER_KEYS[editingRule.rule_type] ? (
              <div className="rule-range-editor">
                <Text strong className="rule-range-editor-title">
                  Allowed value range
                </Text>
                <Text
                  className="rule-range-editor-description"
                  type="secondary"
                >
                  Values outside this inclusive range will fail the test.
                </Text>
                <Row gutter={12}>
                  <Col span={12}>
                    <Form.Item
                      dependencies={['rangeMax']}
                      label="Minimum value"
                      name="rangeMin"
                      rules={[
                        { required: true, message: 'Enter a minimum value.' },
                        ({ getFieldValue }) => ({
                          validator(_, value) {
                            const maximum = getFieldValue('rangeMax');

                            return value === undefined ||
                              maximum === undefined ||
                              value <= maximum
                              ? Promise.resolve()
                              : Promise.reject(
                                  new Error('Minimum must not exceed maximum.')
                                );
                          },
                        }),
                      ]}
                    >
                      <InputNumber className="w-full" placeholder="Minimum" />
                    </Form.Item>
                  </Col>
                  <Col span={12}>
                    <Form.Item
                      dependencies={['rangeMin']}
                      label="Maximum value"
                      name="rangeMax"
                      rules={[
                        { required: true, message: 'Enter a maximum value.' },
                        ({ getFieldValue }) => ({
                          validator(_, value) {
                            const minimum = getFieldValue('rangeMin');

                            return value === undefined ||
                              minimum === undefined ||
                              value >= minimum
                              ? Promise.resolve()
                              : Promise.reject(
                                  new Error(
                                    'Maximum must not be below minimum.'
                                  )
                                );
                          },
                        }),
                      ]}
                    >
                      <InputNumber className="w-full" placeholder="Maximum" />
                    </Form.Item>
                  </Col>
                </Row>
              </div>
            ) : isLengthBetweenRule(editingRule?.rule_type) ? (
              <div className="rule-range-editor">
                <Text strong className="rule-range-editor-title">
                  Allowed length range
                </Text>
                <Text
                  className="rule-range-editor-description"
                  type="secondary"
                >
                  Set the minimum and maximum number of characters, including
                  both limits.
                </Text>
                <Row gutter={12}>
                  <Col span={12}>
                    <Form.Item
                      dependencies={['maxLength']}
                      label="Minimum length"
                      name="minLength"
                      rules={[
                        { required: true, message: 'Enter a minimum length.' },
                        ({ getFieldValue }) => ({
                          validator(_, value) {
                            const maximum = getFieldValue('maxLength');

                            return value === undefined ||
                              maximum === undefined ||
                              value <= maximum
                              ? Promise.resolve()
                              : Promise.reject(
                                  new Error('Minimum must not exceed maximum.')
                                );
                          },
                        }),
                      ]}
                    >
                      <InputNumber
                        className="w-full"
                        min={0}
                        placeholder="Minimum"
                        precision={0}
                      />
                    </Form.Item>
                  </Col>
                  <Col span={12}>
                    <Form.Item
                      dependencies={['minLength']}
                      label="Maximum length"
                      name="maxLength"
                      rules={[
                        { required: true, message: 'Enter a maximum length.' },
                        ({ getFieldValue }) => ({
                          validator(_, value) {
                            const minimum = getFieldValue('minLength');

                            return value === undefined ||
                              minimum === undefined ||
                              value >= minimum
                              ? Promise.resolve()
                              : Promise.reject(
                                  new Error(
                                    'Maximum must not be below minimum.'
                                  )
                                );
                          },
                        }),
                      ]}
                    >
                      <InputNumber
                        className="w-full"
                        min={0}
                        placeholder="Maximum"
                        precision={0}
                      />
                    </Form.Item>
                  </Col>
                </Row>
              </div>
            ) : editingRule?.rule_type === 'columnValuesToMatchRegex' ? (
              <>
                <Form.Item label={t('label.regex-pattern')}>
                  <Select
                    showSearch
                    options={[
                      {
                        value:
                          '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}$',
                        label: 'Email',
                      },
                      { value: '^https?://[^\\s/$.?#].[^\\s]*$', label: 'URL' },
                      { value: '^\\+?[0-9 .\\-]{7,15}$', label: 'Phone' },
                      {
                        value:
                          '^[0-9]{1,3}\\.[0-9]{1,3}\\.[0-9]{1,3}\\.[0-9]{1,3}$',
                        label: 'IPv4',
                      },
                    ]}
                    style={{ width: '100%' }}
                    value={regexEditValue}
                    onChange={(v) => {
                      setRegexEditValue(v);
                      editForm.setFieldValue(
                        'parameters',
                        JSON.stringify({ regex: v })
                      );
                    }}
                  />
                </Form.Item>
                <Form.Item label={t('label.custom-regex')}>
                  <Input
                    placeholder="^[a-zA-Z0-9]+$"
                    value={regexEditValue}
                    onChange={(e) => {
                      const v = e.target.value;
                      setRegexEditValue(v);
                      editForm.setFieldValue(
                        'parameters',
                        JSON.stringify({ regex: v })
                      );
                    }}
                  />
                </Form.Item>
              </>
            ) : !isCustomSqlRule(editingRule) ? (
              <Form.Item label={t('label.parameters-json')} name="parameters">
                <Input.TextArea
                  placeholder='{"minValue": 0, "maxValue": 100}'
                  rows={4}
                />
              </Form.Item>
            ) : null}
          </Form>
        </Modal>

        {/* Config API Base URL Modal */}
        <Modal
          open={isConfigModalOpen}
          title="Rule Recommender API Settings"
          onCancel={() => setIsConfigModalOpen(false)}
          onOk={() => {
            setRecommenderBaseUrl(customApiUrl);
            setIsConfigModalOpen(false);
            ruleRecommenderAPI.checkHealth().then(setBackendHealth);
            notification.success({
              message: 'Settings Updated',
              description: `API Base URL set to ${customApiUrl}`,
            });
          }}
        >
          <p>
            Configure the FastAPI Rule Recommender backend endpoint. Defaults to{' '}
            <code>http://localhost:8000/api/v1</code>.
          </p>
          <Input
            placeholder="http://localhost:8000/api/v1"
            value={customApiUrl}
            onChange={(e) => setCustomApiUrl(e.target.value)}
          />
          <div style={{ marginTop: 12 }}>
            <Button
              size="small"
              onClick={() => {
                setCustomApiUrl('http://localhost:8000/api/v1');
              }}
            >
              Reset to Default (localhost:8000)
            </Button>
          </div>
        </Modal>
      </div>
    </PageLayoutV1>
  );
};

export default RuleRecommenderPage;
