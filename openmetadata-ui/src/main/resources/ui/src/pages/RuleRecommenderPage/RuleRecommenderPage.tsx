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
  CheckCircleOutlined,
  CheckOutlined,
  CloseCircleOutlined,
  CloseOutlined,
  DatabaseOutlined,
  DeleteOutlined,
  EditOutlined,
  ExperimentOutlined,
  FieldTimeOutlined,
  PlusOutlined,
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
  Spin,
  Table,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import PageLayoutV1 from '../../components/PageLayoutV1/PageLayoutV1';
import {
  CandidateRule,
  NtGovernanceStatus,
  NtTestDefinition,
  renderParameterizedSql,
  ruleRecommenderAPI,
  TableOption,
} from '../../services/ruleRecommenderAPI';
import BatchOperationsPanel, {
  CandidateGenerationComplete,
} from './BatchOperationsPanel';
import RuleTargetTree from './AiRules/RuleTargetTree';
import { isSavedRuleVisible } from './AiRules/ruleVisibility';
import NTRuleConfigModal from './NtGovernance/NTRuleConfigModal';
import { useNtRuleConfigModal } from './NtGovernance/useNtRuleConfigModal';
import { mapPublishTablesInBatches } from './publishTableBatches';
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

const hasConfiguredAllowedValues = (rule: CandidateRule) =>
  rule.rule_type !== 'columnValuesToBeInSet' ||
  (Array.isArray(rule.parameters?.allowedValues) &&
    rule.parameters.allowedValues.length > 0);

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
  const [loading, setLoading] = useState<boolean>(false);
  const [publishing, setPublishing] = useState<boolean>(false);
  const [_backendHealth, setBackendHealth] = useState<{
    status: string;
    openmetadata_connected: boolean;
  }>({
    status: 'checking',
    openmetadata_connected: false,
  });

  const [tables, setTables] = useState<TableOption[]>([]);
  const [selectedTableFqn, setSelectedTableFqn] = useState<string>('');
  const [ruleTableFilter, setRuleTableFilter] = useState<string>('ALL');
  const [resultsMode, setResultsMode] = useState<'GENERATED' | 'SAVED'>(
    'SAVED'
  );
  const [generatedJobId, setGeneratedJobId] = useState<string>('');
  const [generatedTableFqns, setGeneratedTableFqns] = useState<string[]>([]);

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
  const ntRuleConfigModal = useNtRuleConfigModal({ closeAfterSave: false });

  // Dynamic parameters state for Edit Rule Modal
  const [dynamicParams, setDynamicParams] = useState<
    Array<{ key: string; value: string }>
  >([]);
  const [allowedValueInputs, setAllowedValueInputs] = useState<string[]>([]);

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
  const [ntSearchQuery, setNtSearchQuery] = useState<string>('');

  // Modals
  const [editingRule, setEditingRule] = useState<CandidateRule | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState<boolean>(false);
  const [editForm] = Form.useForm();

  const loadSavedRules = useCallback(async () => {
    const saved = await ruleRecommenderAPI.getSavedRules();
    setRules(saved.items.filter(isRuleVisible));

    return saved;
  }, []);

  // Load initial tables and check health
  useEffect(() => {
    const initialize = async () => {
      setLoading(true);
      try {
        const health = await ruleRecommenderAPI.checkHealth();
        setBackendHealth(health);

        const openmetadataTables =
          await ruleRecommenderAPI.getOpenMetadataTables();
        setTables(openmetadataTables);
        if (openmetadataTables.length > 0) {
          setSelectedTableFqn(openmetadataTables[0].fullyQualifiedName);
        }
        await loadSavedRules();
      } catch (error) {
        notification.error({
          message: 'Cannot initialize AI Rule Workspace',
          description: String(error),
        });
      } finally {
        setLoading(false);
      }
    };

    initialize();
  }, [loadSavedRules]);

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

  useEffect(() => {
    if (
      activeTab === 'nt-governance' &&
      ntDefinitions.length > 0 &&
      !ntRuleConfigModal.selectedRule &&
      !ntRuleConfigModal.isLoading
    ) {
      void ntRuleConfigModal.open(ntDefinitions[0].name);
    }
  }, [
    activeTab,
    ntDefinitions,
    ntRuleConfigModal.isLoading,
    ntRuleConfigModal.open,
    ntRuleConfigModal.selectedRule,
  ]);

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

  const getRulesInActiveView = () => {
    const tableFqns =
      resultsMode === 'GENERATED'
        ? generatedTableFqns
        : rules
            .filter(isSavedRuleVisible)
            .map((rule) => rule.table_fqn)
            .filter((tableFqn): tableFqn is string => Boolean(tableFqn));
    const activeTables = new Set(tableFqns);

    return rules.filter(
      (rule) =>
        isRuleVisible(rule) &&
        (resultsMode !== 'SAVED' || isSavedRuleVisible(rule)) &&
        Boolean(rule.table_fqn) &&
        activeTables.has(rule.table_fqn as string) &&
        (ruleTableFilter === 'ALL' || rule.table_fqn === ruleTableFilter)
    );
  };

  // Review single rule action
  const handleReviewRule = async (
    ruleId: string,
    action: 'ACCEPT' | 'REJECT'
  ) => {
    const selectedRule = rules.find((rule) => rule.id === ruleId);
    if (
      action === 'ACCEPT' &&
      selectedRule &&
      !hasConfiguredAllowedValues(selectedRule)
    ) {
      notification.warning({
        message: 'Allowed values required',
        description:
          'Use Edit parameters to configure allowedValues before accepting this Values In Set rule.',
      });

      return;
    }

    const nextStatus = action === 'ACCEPT' ? 'ACCEPTED' : 'REJECTED';
    try {
      await ruleRecommenderAPI.reviewRule(ruleId, nextStatus);
      setRules((prev) =>
        prev.map((r) => (r.id === ruleId ? { ...r, status: nextStatus } : r))
      );
      notification.info({
        message: action === 'ACCEPT' ? 'Rule Accepted' : 'Rule Rejected',
        description: `Rule ${ruleId} has been ${
          action === 'ACCEPT' ? 'accepted' : 'rejected'
        }.`,
      });
    } catch (error) {
      notification.error({
        message: 'Cannot update rule status',
        description: String(error),
      });
    }
  };

  // Accept all pending rules
  const handleAcceptAll = async () => {
    const activeRules = getRulesInActiveView();
    const reviewableRules = activeRules.filter(
      (rule) =>
        (rule.status === 'PENDING' ||
          rule.status === 'DRAFT' ||
          rule.status === 'EDITED') &&
        hasConfiguredAllowedValues(rule)
    );
    const unconfiguredCount = activeRules.filter(
      (rule) =>
        (rule.status === 'PENDING' ||
          rule.status === 'DRAFT' ||
          rule.status === 'EDITED') &&
        !hasConfiguredAllowedValues(rule)
    ).length;
    const results = await Promise.allSettled(
      reviewableRules.map((rule) =>
        ruleRecommenderAPI.reviewRule(rule.id, 'ACCEPTED')
      )
    );
    const acceptedRuleIds = new Set(
      reviewableRules
        .filter((_, index) => results[index].status === 'fulfilled')
        .map((rule) => rule.id)
    );
    const failedCount = results.length - acceptedRuleIds.size;

    setRules((prev) =>
      prev.map((r) =>
        acceptedRuleIds.has(r.id) ? { ...r, status: 'ACCEPTED' } : r
      )
    );
    notification[failedCount > 0 ? 'warning' : 'success']({
      message: 'Batch Review',
      description: [
        `${acceptedRuleIds.size} rule(s) persisted as Accepted.`,
        failedCount > 0 ? `${failedCount} update(s) failed.` : '',
        unconfiguredCount > 0
          ? `${unconfiguredCount} Values In Set rule(s) were skipped because allowedValues are not configured.`
          : '',
      ]
        .filter(Boolean)
        .join(' '),
    });
  };

  // Publish accepted rules to OpenMetadata
  const handlePublish = async () => {
    const acceptedRules = getRulesInActiveView().filter(
      (r) => r.status === 'ACCEPTED'
    );
    const unconfiguredRule = acceptedRules.find(
      (rule) => !hasConfiguredAllowedValues(rule)
    );
    if (unconfiguredRule) {
      notification.warning({
        message: 'Allowed values required',
        description:
          'Configure allowedValues for every Values In Set rule before publishing.',
      });

      return;
    }
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
      const rulesByTable = acceptedRules.reduce<
        Record<string, CandidateRule[]>
      >((groups, rule) => {
        const tableFqn = rule.table_fqn || selectedTableFqn;
        if (tableFqn) {
          groups[tableFqn] = [...(groups[tableFqn] ?? []), rule];
        }

        return groups;
      }, {});
      const results = await mapPublishTablesInBatches(
        Object.entries(rulesByTable),
        ([tableFqn, tableRules]) =>
          ruleRecommenderAPI.publishRules(tableFqn, tableRules)
      );
      const publishedCount = results.reduce(
        (total, result) => total + result.publishedCount,
        0
      );
      const publishedRuleIds = new Set(
        results.flatMap((result) => result.publishedRuleIds ?? [])
      );

      setRules((previous) =>
        previous.map((rule) =>
          publishedRuleIds.has(rule.id) ? { ...rule, status: 'APPLIED' } : rule
        )
      );

      notification.success({
        message: 'Publish Thành Công!',
        description: `Đã đồng bộ ${publishedCount} rule thành Test Case cho ${
          Object.keys(rulesByTable).length
        } bảng.`,
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

    // Initialize dynamic params from existing parameters
    const existingParams = rule.parameters || {};
    const initialDynamicParams: Array<{ key: string; value: string }> = [];
    if (rule.engine !== 'ADVANCED') {
      Object.entries(existingParams).forEach(([key, val]) => {
        if (key !== 'allowedValues') {
          initialDynamicParams.push({ key, value: String(val) });
        }
      });
    }
    setDynamicParams(initialDynamicParams);
    const existingAllowedValues = Array.isArray(existingParams.allowedValues)
      ? existingParams.allowedValues.map(String)
      : [];
    setAllowedValueInputs(
      rule.rule_type === 'columnValuesToBeInSet'
        ? existingAllowedValues.length > 0
          ? existingAllowedValues
          : ['']
        : []
    );

    editForm.setFieldsValue({
      reason: rule.reason,
      sql_expression: getRuleDisplaySql(rule),
      rangeMin: rangeKeys ? existingParams[rangeKeys.min] : undefined,
      rangeMax: rangeKeys ? existingParams[rangeKeys.max] : undefined,
      minLength: existingParams.minLength,
      maxLength: existingParams.maxLength,
    });
    setIsEditModalOpen(true);
  };

  // Add a new dynamic parameter
  const handleAddParam = () => {
    setDynamicParams([...dynamicParams, { key: '', value: '' }]);
  };

  // Remove a dynamic parameter
  const handleRemoveParam = (index: number) => {
    setDynamicParams(dynamicParams.filter((_, i) => i !== index));
  };

  // Update a dynamic parameter
  const handleUpdateParam = (
    index: number,
    field: 'key' | 'value',
    val: string
  ) => {
    const updated = [...dynamicParams];
    updated[index][field] = val;
    setDynamicParams(updated);
  };

  const handleAddAllowedValue = () => {
    setAllowedValueInputs((previous) => [...previous, '']);
  };

  const handleRemoveAllowedValue = (index: number) => {
    setAllowedValueInputs((previous) =>
      previous.length === 1
        ? ['']
        : previous.filter((_, valueIndex) => valueIndex !== index)
    );
  };

  const handleUpdateAllowedValue = (index: number, value: string) => {
    setAllowedValueInputs((previous) =>
      previous.map((currentValue, valueIndex) =>
        valueIndex === index ? value : currentValue
      )
    );
  };

  // Save edited rule
  const handleSaveEditedRule = () => {
    editForm.validateFields().then(async (values) => {
      if (!editingRule) {
        return;
      }

      let parsedParams: Record<string, unknown> =
        editingRule.engine === 'ADVANCED'
          ? { ...(editingRule.parameters || {}) }
          : {};
      const rangeKeys = RANGE_PARAMETER_KEYS[editingRule.rule_type];

      if (rangeKeys) {
        parsedParams = {
          [rangeKeys.min]: values.rangeMin,
          [rangeKeys.max]: values.rangeMax,
        };
      } else if (isLengthBetweenRule(editingRule.rule_type)) {
        parsedParams = {
          minLength: values.minLength,
          maxLength: values.maxLength,
        };
      } else if (editingRule.rule_type === 'columnValuesToMatchRegex') {
        parsedParams = { regex: regexEditValue };
      } else if (editingRule.rule_type === 'columnValuesToBeInSet') {
        const allowedValues = Array.from(
          new Set(
            allowedValueInputs.map((value) => value.trim()).filter(Boolean)
          )
        );

        if (allowedValues.length === 0) {
          notification.warning({
            message: 'Allowed values required',
            description: 'Add at least one allowed value before saving.',
          });

          return;
        }

        parsedParams = { allowedValues };
      }

      // Merge dynamic parameters
      if (editingRule.engine !== 'ADVANCED') {
        dynamicParams.forEach(({ key, value }) => {
          if (key.trim()) {
            // Try to parse value as number if possible
            const numValue = Number(value);
            parsedParams[key.trim()] = isNaN(numValue) ? value : numValue;
          }
        });
      }

      const editedSql = isCustomSqlRule(editingRule)
        ? values.sql_expression?.trim()
        : editingRule.sql_expression;

      try {
        await ruleRecommenderAPI.reviewRule(
          editingRule.id,
          'EDITED',
          parsedParams
        );
      } catch (error) {
        notification.error({
          message: 'Cannot save edited rule',
          description: String(error),
        });

        return;
      }

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

  const activeTableFqns = useMemo(
    () =>
      Array.from(
        new Set(
          resultsMode === 'GENERATED'
            ? generatedTableFqns
            : rules
                .filter(isSavedRuleVisible)
                .map((rule) => rule.table_fqn)
                .filter((tableFqn): tableFqn is string => Boolean(tableFqn))
        )
      ).sort(),
    [generatedTableFqns, resultsMode, rules]
  );

  const modeRules = useMemo(() => {
    const activeTables = new Set(activeTableFqns);

    return rules.filter(
      (rule) =>
        isRuleVisible(rule) &&
        (resultsMode !== 'SAVED' || isSavedRuleVisible(rule)) &&
        Boolean(rule.table_fqn) &&
        activeTables.has(rule.table_fqn as string)
    );
  }, [activeTableFqns, resultsMode, rules]);

  const scopedRules = useMemo(
    () =>
      ruleTableFilter === 'ALL'
        ? modeRules
        : modeRules.filter((rule) => rule.table_fqn === ruleTableFilter),
    [modeRules, ruleTableFilter]
  );

  const filteredRules = useMemo(() => {
    return scopedRules.filter((r) => {
      const matchesStatus =
        statusFilter === 'ALL' ||
        (statusFilter === 'PENDING'
          ? r.status === 'DRAFT' ||
            r.status === 'PENDING' ||
            r.status === 'EDITED'
          : r.status === statusFilter);
      if (!matchesStatus) {
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
        const matchesTable = (r.table_fqn || r.table_name || '')
          .toLowerCase()
          .includes(query);
        if (!matchesRule && !matchesCol && !matchesReason && !matchesTable) {
          return false;
        }
      }

      return true;
    });
  }, [scopedRules, statusFilter, scopeFilter, searchQuery]);

  const filteredNtDefinitions = useMemo(() => {
    const query = ntSearchQuery.trim().toLowerCase();
    if (!query) {
      return ntDefinitions;
    }

    return ntDefinitions.filter((definition) =>
      [definition.name, definition.displayName, definition.description]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query))
    );
  }, [ntDefinitions, ntSearchQuery]);

  const ruleCountByTable = useMemo(
    () =>
      modeRules.reduce<Record<string, number>>((counts, rule) => {
        if (rule.table_fqn) {
          counts[rule.table_fqn] = (counts[rule.table_fqn] ?? 0) + 1;
        }

        return counts;
      }, {}),
    [modeRules]
  );

  // Reset pagination to page 1 whenever filters change
  useEffect(() => {
    setRulesCurrentPage(1);
  }, [statusFilter, scopeFilter, ruleTableFilter, searchQuery]);

  // Statistics
  // DRAFT is treated as "pending review" — both are pre-review states.
  const stats = useMemo(() => {
    const visibleRules = scopedRules;
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
  }, [scopedRules]);

  const selectedTable = useMemo(() => {
    return tables.find((t) => t.fullyQualifiedName === selectedTableFqn);
  }, [tables, selectedTableFqn]);

  // Table Columns definition
  const columns: ColumnsType<CandidateRule> = [
    ...(activeTableFqns.length > 1
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
                  Not configured. Use Edit parameters to enter allowedValues.
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
              aiOnly
              onCandidateComplete={async (
                result: CandidateGenerationComplete
              ) => {
                const uniqueFqns = Array.from(new Set(result.tableFqns));
                if (uniqueFqns.length === 0) {
                  return;
                }
                setSelectedTableFqn(uniqueFqns[0]);
                setGeneratedJobId(result.job.job_id);
                setGeneratedTableFqns(uniqueFqns);
                setRuleTableFilter('ALL');
                setResultsMode('GENERATED');
                await loadSavedRules();
              }}
            />

            <div className="ai-results-mode-bar">
              <Radio.Group
                buttonStyle="solid"
                value={resultsMode}
                onChange={(event) => {
                  setResultsMode(event.target.value);
                  setStatusFilter('ALL');
                  setRuleTableFilter('ALL');
                }}
              >
                <Radio.Button
                  disabled={generatedTableFqns.length === 0}
                  value="GENERATED"
                >
                  Generated Results
                  {generatedJobId ? ` · ${generatedJobId.slice(0, 8)}` : ''}
                </Radio.Button>
                <Radio.Button value="SAVED">All Saved Rules</Radio.Button>
              </Radio.Group>
              <Text type="secondary">
                {resultsMode === 'GENERATED'
                  ? 'Only tables from the latest generation are shown.'
                  : 'Draft, Accepted and Rejected rules from PostgreSQL are shown.'}
              </Text>
            </div>

            {resultsMode === 'GENERATED' && (
              <Alert
                showIcon
                action={
                  <Button
                    size="small"
                    onClick={() => {
                      setResultsMode('SAVED');
                      setStatusFilter('ALL');
                      setRuleTableFilter('ALL');
                    }}
                  >
                    Browse all saved rules
                  </Button>
                }
                className="generated-results-summary"
                message={`${generatedTableFqns.length} table(s) were included in generation job ${generatedJobId}.`}
                type="info"
              />
            )}

            {/* Metric KPI cards */}
            <Row gutter={[16, 16]}>
              <Col lg={6} sm={12} xs={24}>
                <div className="stat-card">
                  <span className="stat-label">Total Rules</span>
                  <span className="stat-value primary">{stats.total}</span>
                </div>
              </Col>
              <Col lg={6} sm={12} xs={24}>
                <div className="stat-card">
                  <span className="stat-label">
                    {resultsMode === 'SAVED' ? 'Draft' : 'Pending Review'}
                  </span>
                  <span className="stat-value warning">{stats.pending}</span>
                </div>
              </Col>
              <Col lg={6} sm={12} xs={24}>
                <div className="stat-card">
                  <span className="stat-label">Accepted</span>
                  <span className="stat-value success">
                    {stats.accepted}
                  </span>
                </div>
              </Col>
              {resultsMode === 'GENERATED' ? (
                  <Col lg={6} sm={12} xs={24}>
                    <div className="stat-card">
                      <span className="stat-label">Already Applied</span>
                      <span className="stat-value success">
                        {stats.applied}
                      </span>
                    </div>
                  </Col>
              ) : (
                <Col lg={6} sm={12} xs={24}>
                  <div className="stat-card">
                    <span className="stat-label">Rejected</span>
                    <span className="stat-value warning">{stats.rejected}</span>
                  </div>
                </Col>
              )}
            </Row>

            <div className="ai-rule-workspace">
              <RuleTargetTree
                ruleCountByTable={ruleCountByTable}
                selectedTableFqn={ruleTableFilter}
                tableFqns={activeTableFqns}
                title={
                  resultsMode === 'GENERATED'
                    ? 'Generated Targets'
                    : 'Saved Rule Tables'
                }
                onSelect={(tableFqn) => {
                  setRuleTableFilter(tableFqn);
                  if (tableFqn !== 'ALL') {
                    setSelectedTableFqn(tableFqn);
                  }
                }}
              />
              <div className="main-content-card ai-rule-results">
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
                        {resultsMode === 'SAVED' ? 'Draft' : 'Pending'} (
                        {stats.pending})
                      </Radio.Button>
                      <Radio.Button value="ACCEPTED">
                        Accepted ({stats.accepted})
                      </Radio.Button>
                      {resultsMode === 'GENERATED' && (
                          <Radio.Button value="APPLIED">
                            Applied ({stats.applied})
                          </Radio.Button>
                      )}
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
                        setLoading(true);
                        try {
                          await loadSavedRules();
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
                            <b>Generate Data Quality Rules</b> or choose another
                            table.
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
                      `Showing ${range[0]} - ${range[1]} of ${total} rules`,
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
            </div>
          </>
        )}

        {/* ===================== TAB: NT GOVERNANCE ===================== */}
        {activeTab === 'nt-governance' && (
          <>
            <BatchOperationsPanel
              ntOnly
              onNtComplete={async (tableFqns) => {
                if (tableFqns.length === 0) {
                  return;
                }
                if (tableFqns.includes(selectedTableFqn)) {
                  await loadNtGovernanceStatus();
                } else {
                  setSelectedTableFqn(tableFqns[0]);
                }
              }}
            />
            <div className="main-content-card">
              <div style={{ padding: '16px 0' }}>
                <Alert
                  showIcon
                  description={t('label.nt-governance-description')}
                  message={t('label.nt-governance-title')}
                  style={{ marginBottom: 16, borderRadius: 8 }}
                  type="info"
                />
                <div className="d-flex justify-end m-b-md">
                  <Button
                    icon={<DatabaseOutlined />}
                    loading={loadingTestCases}
                    size="small"
                    onClick={handleViewExistingTestCases}
                  >
                    {t('label.view-existing-test-cases')}
                  </Button>
                </div>

                {ntStatusError && (
                  <Alert
                    showIcon
                    description={ntStatusError}
                    message="Unable to load NT rule status"
                    style={{ marginBottom: 16 }}
                    type="error"
                  />
                )}

                <div className="nt-governance-workspace">
                  <Card
                    className="nt-governance-card nt-rule-catalog"
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
                    <Input.Search
                      allowClear
                      className="nt-rule-search"
                      placeholder="Search NT definitions..."
                      value={ntSearchQuery}
                      onChange={(event) => setNtSearchQuery(event.target.value)}
                    />
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
                      dataSource={filteredNtDefinitions}
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
                          `Showing ${range[0]} - ${range[1]} of ${total} NT rules`,
                        onChange: (page, pageSize) => {
                          setNtCurrentPage(page);
                          setNtPageSize(pageSize);
                        },
                      }}
                      rowClassName={(record) =>
                        record.name === ntRuleConfigModal.selectedRule?.name
                          ? 'nt-rule-row-selected'
                          : ''
                      }
                      rowKey="name"
                      scroll={{ x: 'max-content' }}
                      size="small"
                      onRow={(record) => ({
                        onClick: () => void ntRuleConfigModal.open(record.name),
                      })}
                    />
                  </Card>

                  <Card
                    className="nt-rule-configuration-panel"
                    extra={
                      ntRuleConfigModal.selectedRule ? (
                        <Tag color="blue">
                          {ntRuleConfigModal.selectedRule.name}
                        </Tag>
                      ) : null
                    }
                    size="small"
                    title="Rule Configuration"
                  >
                    {ntRuleConfigModal.isLoading ? (
                      <div className="nt-rule-config-loading">
                        <Spin />
                        <Text type="secondary">Loading configuration...</Text>
                      </div>
                    ) : ntRuleConfigModal.error ? (
                      <Alert
                        showIcon
                        description={ntRuleConfigModal.error}
                        message="Cannot load rule configuration"
                        type="error"
                      />
                    ) : ntRuleConfigModal.selectedRule &&
                      ntRuleConfigModal.config ? (
                      <>
                        <Typography.Title level={5}>
                          {ntRuleConfigModal.selectedRule.display_name}
                        </Typography.Title>
                        <Paragraph type="secondary">
                          Configure the parameters used by DQ Backend whenever
                          this NT rule is executed.
                        </Paragraph>
                        <NTRuleConfigModal
                          inline
                          initialConfig={ntRuleConfigModal.config}
                          isSaving={ntRuleConfigModal.isSaving}
                          rule={ntRuleConfigModal.selectedRule}
                          onCancel={ntRuleConfigModal.close}
                          onReset={ntRuleConfigModal.reset}
                          onSave={ntRuleConfigModal.save}
                        />
                      </>
                    ) : (
                      <Empty description="Select an NT definition to configure" />
                    )}
                  </Card>
                </div>

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
          </>
        )}

        {/* Edit Rule Modal */}
        <Modal
          destroyOnClose
          open={isEditModalOpen}
          title={`Edit Rule: ${editingRule?.rule_type}`}
          width={600}
          onCancel={() => {
            setIsEditModalOpen(false);
            setEditingRule(null);
            setDynamicParams([]);
            setAllowedValueInputs([]);
          }}
          onOk={handleSaveEditedRule}
        >
          <Form form={editForm} layout="vertical">
            <Form.Item label="Inferred Rationale / Reason" name="reason">
              <Input.TextArea rows={2} />
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
                  autoSize={{ minRows: 4, maxRows: 10 }}
                  className="rule-sql-editor"
                  placeholder="SELECT * FROM ... WHERE ..."
                  spellCheck={false}
                />
              </Form.Item>
            )}

            {/* Rule-specific parameter fields */}
            {editingRule && RANGE_PARAMETER_KEYS[editingRule.rule_type] && (
              <div className="rule-range-editor">
                <Text strong className="rule-range-editor-title">
                  Value Range Parameters
                </Text>
                <Row gutter={12}>
                  <Col span={12}>
                    <Form.Item
                      dependencies={['rangeMax']}
                      label="Minimum value"
                      name="rangeMin"
                    >
                      <InputNumber className="w-full" placeholder="Min" />
                    </Form.Item>
                  </Col>
                  <Col span={12}>
                    <Form.Item
                      dependencies={['rangeMin']}
                      label="Maximum value"
                      name="rangeMax"
                    >
                      <InputNumber className="w-full" placeholder="Max" />
                    </Form.Item>
                  </Col>
                </Row>
              </div>
            )}

            {editingRule?.rule_type === 'columnValuesToMatchRegex' && (
              <Form.Item label="Regex Pattern">
                <Input
                  placeholder="^[a-zA-Z0-9]+$"
                  value={regexEditValue}
                  onChange={(e) => setRegexEditValue(e.target.value)}
                />
              </Form.Item>
            )}

            {editingRule?.rule_type === 'columnValuesToBeInSet' && (
              <Form.Item
                required
                extra="Each input represents one allowed value."
                label="Allowed Values"
              >
                <Space direction="vertical" size={8} style={{ width: '100%' }}>
                  {allowedValueInputs.map((value, index) => (
                    <Space.Compact block key={index}>
                      <Input
                        placeholder={`Allowed value ${index + 1}`}
                        value={value}
                        onChange={(event) =>
                          handleUpdateAllowedValue(index, event.target.value)
                        }
                      />
                      <Button
                        danger
                        aria-label={`Remove allowed value ${index + 1}`}
                        icon={<DeleteOutlined />}
                        onClick={() => handleRemoveAllowedValue(index)}
                      />
                    </Space.Compact>
                  ))}
                  <Button
                    block
                    icon={<PlusOutlined />}
                    type="dashed"
                    onClick={handleAddAllowedValue}
                  >
                    Add value
                  </Button>
                </Space>
              </Form.Item>
            )}

            {/* Dynamic Parameters Section */}
            {editingRule?.engine !== 'ADVANCED' &&
              editingRule?.rule_type !== 'columnValuesToBeInSet' && (
              <div className="dynamic-params-section">
                <div className="dynamic-params-header">
                  <Text strong>Parameters</Text>
                  <Button
                    icon={<PlusOutlined />}
                    size="small"
                    type="dashed"
                    onClick={handleAddParam}
                  >
                    Add Parameter
                  </Button>
                </div>

                {dynamicParams.length === 0 ? (
                  <Text style={{ fontSize: 12 }} type="secondary">
                    No parameters. Click "Add Parameter" to add key-value pairs.
                  </Text>
                ) : (
                  <div className="dynamic-params-list">
                    {dynamicParams.map((param, index) => (
                      <Row gutter={8} key={index} style={{ marginBottom: 8 }}>
                        <Col span={8}>
                          <Input
                            placeholder="key"
                            value={param.key}
                            onChange={(e) =>
                              handleUpdateParam(index, 'key', e.target.value)
                            }
                          />
                        </Col>
                        <Col span={14}>
                          <Input
                            placeholder="value"
                            value={param.value}
                            onChange={(e) =>
                              handleUpdateParam(index, 'value', e.target.value)
                            }
                          />
                        </Col>
                        <Col span={2}>
                          <Button
                            danger
                            icon={<DeleteOutlined />}
                            size="small"
                            type="text"
                            onClick={() => handleRemoveParam(index)}
                          />
                        </Col>
                      </Row>
                    ))}
                  </div>
                )}
              </div>
            )}
          </Form>
        </Modal>

      </div>
    </PageLayoutV1>
  );
};

export default RuleRecommenderPage;
