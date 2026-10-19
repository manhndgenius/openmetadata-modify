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
  ReloadOutlined,
  SafetyCertificateOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import {
  Alert,
  Button,
  Card,
  Col,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  notification,
  Popover,
  Radio,
  Row,
  Select,
  Space,
  Table,
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
  getRecommenderBaseUrl,
  NtGovernanceStatus,
  NtTestDefinition,
  renderParameterizedSql,
  ruleRecommenderAPI,
  setRecommenderBaseUrl,
  TableOption,
} from '../../services/ruleRecommenderAPI';
import { getEntityDetailsPath } from '../../utils/RouterUtils';
import BatchOperationsPanel from './BatchOperationsPanel';
import NTRuleConfigModal from './NtGovernance/NTRuleConfigModal';
import { useNtRuleConfigModal } from './NtGovernance/useNtRuleConfigModal';
import './rule-recommender.style.less';

const { Text, Paragraph } = Typography;

type RangeParameterKeys = {
  min: string;
  max: string;
};

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
  const [ruleTableFilter, setRuleTableFilter] = useState<string>('ALL');

  // Controlled pagination state
  const [rulesCurrentPage, setRulesCurrentPage] = useState<number>(1);
  const [rulesPageSize, setRulesPageSize] = useState<number>(10);
  const [ntCurrentPage, setNtCurrentPage] = useState<number>(1);
  const [ntPageSize, setNtPageSize] = useState<number>(10);

  const [rules, setRules] = useState<CandidateRule[]>([]);

  // NT Governance state
  const [ntStatusLoading, setNtStatusLoading] = useState<boolean>(false);
  const [ntStatusError, setNtStatusError] = useState<string>('');
  const [ntStatus, setNtStatus] = useState<NtGovernanceStatus | null>(null);
  const [ntDefinitions, setNtDefinitions] = useState<NtTestDefinition[]>([]);
  const [existingTestCases, setExistingTestCases] = useState<unknown[]>([]);
  const [loadingTestCases, setLoadingTestCases] = useState<boolean>(false);
  const [regexEditValue, setRegexEditValue] = useState<string>('');

  // NT Rule Config Modal
  const ntRuleConfigModal = useNtRuleConfigModal();

  // Top-level tabs: 'rules' vs 'nt-governance'
  const [activeTab, setActiveTab] = useState<'rules' | 'nt-governance'>(
    'rules'
  );

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
      if (ruleTableFilter !== 'ALL' && r.table_name !== ruleTableFilter) {
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
  }, [rules, statusFilter, scopeFilter, ruleTableFilter, searchQuery]);

  const ruleTables = useMemo(() => {
    return Array.from(new Set(rules.map((r) => r.table_name).filter(Boolean)));
  }, [rules]);

  // Reset pagination to page 1 whenever filters change
  useEffect(() => {
    setRulesCurrentPage(1);
  }, [statusFilter, scopeFilter, ruleTableFilter, searchQuery]);

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


  // Table Columns definition
  const columns: ColumnsType<CandidateRule> = [
    ...(ruleTables.length > 1
      ? [
          {
            title: 'Table',
            dataIndex: 'table_name',
            key: 'table_name',
            width: 140,
            render: (tableName: string) => (
              <Tag color="geekblue" style={{ fontWeight: 600 }}>
                {tableName || selectedTable?.name || 'table'}
              </Tag>
            ),
          },
        ]
      : []),
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
            {record.rule_type !== 'columnValuesToBeNotNull' &&
              record.rule_type !== 'columnValuesToBeUnique' && (
                <Tooltip title="Edit parameters">
                  <Button
                    icon={<EditOutlined />}
                    size="small"
                    onClick={() => openEditRuleModal(record)}
                  />
                </Tooltip>
              )}
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
            {activeTab === 'rules' && (
              <Button
                disabled={stats.accepted === 0}
                loading={publishing}
                type="primary"
                onClick={handlePublish}
              >
                Publish ({stats.accepted})
              </Button>
            )}
          </div>
        </div>

        {/* Top-level Tabs: Rules | NT Governance */}
        <div className="top-level-tabs">
          <div
            className={`top-tab ${activeTab === 'rules' ? 'active' : ''}`}
            onClick={() => setActiveTab('rules')}
          >
            <ExperimentOutlined />
            <span>Rule Recommender</span>
          </div>
          <div
            className={`top-tab ${
              activeTab === 'nt-governance' ? 'active' : ''
            }`}
            onClick={() => setActiveTab('nt-governance')}
          >
            <SafetyCertificateOutlined />
            <span>NT Governance</span>
          </div>
        </div>

        {/* ===================== TAB: RULES ===================== */}
        {activeTab === 'rules' && (
          <>
            <BatchOperationsPanel
              onCandidateComplete={async (tableFqns) => {
                const uniqueFqns = Array.from(new Set(tableFqns));
                if (uniqueFqns.length === 0) {
                  return;
                }
                setSelectedTableFqn(uniqueFqns[0]);
                const generatedRules = await Promise.all(
                  uniqueFqns.map((fqn) => ruleRecommenderAPI.getRules(fqn))
                );
                setRules(generatedRules.flat().filter(isRuleVisible));
              }}
              onNtComplete={async (tableFqns) => {
                if (tableFqns.includes(selectedTableFqn)) {
                  await loadNtGovernanceStatus();
                }
              }}
              onOpenTable={async (tableFqn) => {
                setSelectedTableFqn(tableFqn);
                setLoading(true);
                try {
                  setRules(
                    (await ruleRecommenderAPI.getRules(tableFqn)).filter(
                      isRuleVisible
                    )
                  );
                } finally {
                  setLoading(false);
                }
              }}
            />

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

            <div className="main-content-card">
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
                    getPopupContainer={(triggerNode) =>
                      triggerNode.parentElement || document.body
                    }
                    options={[
                      { value: 'ALL', label: 'All Scopes' },
                      { value: 'column', label: 'Column Rules' },
                      { value: 'table', label: 'Table Rules' },
                    ]}
                    style={{ width: 140 }}
                    value={scopeFilter}
                    onChange={setScopeFilter}
                  />
                  {ruleTables.length > 1 && (
                    <Select
                      getPopupContainer={(triggerNode) =>
                        triggerNode.parentElement || document.body
                      }
                      options={[
                        { value: 'ALL', label: 'Tất cả các bảng' },
                        ...ruleTables.map((t) => ({
                          value: t,
                          label: `Bảng: ${t}`,
                        })),
                      ]}
                      style={{ minWidth: 160 }}
                      value={ruleTableFilter}
                      onChange={setRuleTableFilter}
                    />
                  )}
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
                    onClick={async () => {
                      const targets = selectedTableFqn
                        ? [selectedTableFqn]
                        : [];
                      if (targets.length === 0) {
                        return;
                      }
                      setLoading(true);
                      try {
                        const results = await Promise.all(
                          targets.map((fqn) =>
                            ruleRecommenderAPI.getRules(fqn)
                          )
                        );
                        const flattened = results
                          .flat()
                          .filter(isRuleVisible);
                        setRules(flattened);
                      } finally {
                        setLoading(false);
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
                loading={loading}
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
                pagination={{
                  current: rulesCurrentPage,
                  pageSize: rulesPageSize,
                  total: filteredRules.length,
                  showSizeChanger: true,
                  pageSizeOptions: ['10', '20', '50'],
                  showTotal: (total, range) =>
                    `Hiển thị ${range[0]} - ${range[1]} trên tổng số ${total} quy tắc`,
                  showQuickJumper: true,
                  onChange: (page, pageSize) => {
                    setRulesCurrentPage(page);
                    setRulesPageSize(pageSize);
                  },
                }}
                rowKey="id"
                scroll={{ x: 'max-content' }}
              />
            </div>
          </>
        )}

        {/* ===================== TAB: NT GOVERNANCE ===================== */}
        {activeTab === 'nt-governance' && (
          <div className="main-content-card">
            <div style={{ padding: '16px 0' }}>
              <Alert
                showIcon
                description={t('label.nt-governance-description')}
                message={t('label.nt-governance-title')}
                style={{ marginBottom: 16, borderRadius: 8 }}
                type="info"
              />
              <Alert
                showIcon
                action={
                  <Button
                    icon={<DatabaseOutlined />}
                    loading={loadingTestCases}
                    size="small"
                    onClick={handleViewExistingTestCases}
                  >
                    {t('label.view-existing-test-cases')}
                  </Button>
                }
                description="Use the Target Scope Builder above to preview and apply NT Governance to tables, schemas, or a database."
                message="NT application is managed by server-side jobs"
                style={{ marginBottom: 16 }}
                type="success"
              />

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
                      width: 200,
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
                      width: 300,
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
                    {
                      title: t('label.action-plural'),
                      key: 'actions',
                      width: 80,
                      render: (_, record) => (
                        <Tooltip title="Configure NT rule">
                          <Button
                            aria-label={`Configure ${record.name}`}
                            data-testid={`configure-nt-rule-${record.name}`}
                            icon={<SettingOutlined />}
                            loading={
                              ntRuleConfigModal.loadingRuleName ===
                              record.name
                            }
                            type="text"
                            onClick={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              void ntRuleConfigModal.open(record.name);
                            }}
                          />
                        </Tooltip>
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
                  pagination={{
                    current: ntCurrentPage,
                    pageSize: ntPageSize,
                    showSizeChanger: true,
                    pageSizeOptions: ['10', '20', '50'],
                    showTotal: (total, range) =>
                      `Hiển thị ${range[0]} - ${range[1]} trên tổng số ${total} quy tắc NT`,
                    onChange: (page, pageSize) => {
                      setNtCurrentPage(page);
                      setNtPageSize(pageSize);
                    },
                  }}
                  rowKey="name"
                  scroll={{ x: 'max-content' }}
                  size="small"
                />
              </Card>

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
          </div>
        )}

        {ntRuleConfigModal.isOpen &&
          ntRuleConfigModal.selectedRule &&
          ntRuleConfigModal.config && (
            <NTRuleConfigModal
              initialConfig={ntRuleConfigModal.config}
              isSaving={ntRuleConfigModal.isSaving}
              rule={ntRuleConfigModal.selectedRule}
              onCancel={ntRuleConfigModal.close}
              onReset={ntRuleConfigModal.reset}
              onSave={ntRuleConfigModal.save}
            />
          )}


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
