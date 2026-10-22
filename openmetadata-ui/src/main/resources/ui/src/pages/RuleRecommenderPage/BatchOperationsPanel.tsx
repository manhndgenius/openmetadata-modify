/*
 *  Copyright 2024 Collate.
 *  Licensed under the Apache License, Version 2.0 (the "License");
 */

import {
  ApartmentOutlined,
  DatabaseOutlined,
  DownOutlined,
  ExperimentOutlined,
  LoadingOutlined,
  SafetyCertificateOutlined,
  TableOutlined,
  UpOutlined,
} from '@ant-design/icons';
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Col,
  Collapse,
  Descriptions,
  List,
  Modal,
  notification,
  Progress,
  Radio,
  Row,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useEffect, useMemo, useState } from 'react';
import {
  BulkGenerationPreview,
  BulkGenerationRequest,
  CatalogOption,
  GenerationJobItem,
  GenerationJobItemStatus,
  GenerationJobSummary,
  GoLiveRuleEngine,
  NtApplicationJobItem,
  NtApplicationJobSummary,
  NtApplicationPreview,
  ruleRecommenderAPI,
  TableOption,
  TargetScope,
} from '../../services/ruleRecommenderAPI';

const { Text } = Typography;
const TERMINAL_STATUSES = new Set(['SUCCESS', 'PARTIAL', 'FAILED']);
const LAST_GENERATION_JOB_KEY = 'dq:last-generation-job-id';
const LAST_NT_APPLICATION_JOB_KEY = 'dq:last-nt-application-job-id';
const ENGINE_COLORS: Record<GoLiveRuleEngine, string> = {
  BASIC: 'blue',
  ADVANCED: 'purple',
};

type ScopeMode = TargetScope['type'];
type Operation = 'CANDIDATE' | 'NT';
type CandidateEngineMode = 'BASIC' | 'ADVANCED' | 'BASIC_ADVANCED';

interface BatchOperationsPanelProps {
  aiOnly?: boolean;
  ntOnly?: boolean;
  onOpenTable?: (tableFqn: string) => void | Promise<void>;
  onCandidateComplete?: (
    result: CandidateGenerationComplete
  ) => void | Promise<void>;
  onNtComplete?: (tableFqns: string[]) => void | Promise<void>;
}

export interface CandidateGenerationComplete {
  job: GenerationJobSummary;
  items: GenerationJobItem[];
  tableFqns: string[];
}

const statusColor = (status: GenerationJobItemStatus) =>
  ({
    PENDING: 'default',
    RUNNING: 'processing',
    SUCCESS: 'success',
    PARTIAL: 'warning',
    FAILED: 'error',
    SKIPPED: 'default',
  }[status]);

const enginesForMode = (mode: CandidateEngineMode): GoLiveRuleEngine[] =>
  mode === 'BASIC_ADVANCED' ? ['BASIC', 'ADVANCED'] : [mode];

const candidateRequest = (
  scope: TargetScope,
  engines: GoLiveRuleEngine[]
): BulkGenerationRequest => ({
  scope,
  engines,
  options: {
    min_confidence: 0.6,
    use_llm: engines.includes('ADVANCED'),
  },
  concurrency: { metadata: 1, basic: 1, advanced: 1 },
});

const BatchOperationsPanel = ({
  aiOnly = false,
  ntOnly = false,
  onOpenTable,
  onCandidateComplete,
  onNtComplete,
}: BatchOperationsPanelProps) => {
  const [expanded, setExpanded] = useState(ntOnly);
  const [scopeMode, setScopeMode] = useState<ScopeMode>('TABLES');
  const [candidateEngineMode, setCandidateEngineMode] =
    useState<CandidateEngineMode>('BASIC');
  const [services, setServices] = useState<CatalogOption[]>([]);
  const [databases, setDatabases] = useState<CatalogOption[]>([]);
  const [schemas, setSchemas] = useState<CatalogOption[]>([]);
  const [tables, setTables] = useState<TableOption[]>([]);
  const [serviceFqn, setServiceFqn] = useState('');
  const [databaseFqn, setDatabaseFqn] = useState('');
  const [schemaFqns, setSchemaFqns] = useState<string[]>([]);
  const [tableFqns, setTableFqns] = useState<string[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [operation, setOperation] = useState<Operation | null>(null);
  const [candidatePreview, setCandidatePreview] =
    useState<BulkGenerationPreview | null>(null);
  const [ntPreview, setNtPreview] = useState<NtApplicationPreview | null>(null);
  const [candidateJob, setCandidateJob] = useState<GenerationJobSummary | null>(
    null
  );
  const [candidateItems, setCandidateItems] = useState<GenerationJobItem[]>([]);
  const [ntJob, setNtJob] = useState<NtApplicationJobSummary | null>(null);
  const [ntItems, setNtItems] = useState<NtApplicationJobItem[]>([]);

  useEffect(() => {
    let cancelled = false;

    const restoreGenerationJob = async () => {
      if (ntOnly) {
        return;
      }
      const jobId = window.localStorage.getItem(LAST_GENERATION_JOB_KEY);
      if (!jobId) {
        return;
      }
      try {
        const [summary, results] = await Promise.all([
          ruleRecommenderAPI.getGenerationJob(jobId),
          ruleRecommenderAPI.getGenerationJobResults(jobId),
        ]);
        if (!cancelled) {
          setCandidateJob(summary);
          setCandidateItems(results.items);
        }
      } catch {
        window.localStorage.removeItem(LAST_GENERATION_JOB_KEY);
      }
    };

    const restoreNtJob = async () => {
      if (aiOnly) {
        return;
      }
      const jobId = window.localStorage.getItem(LAST_NT_APPLICATION_JOB_KEY);
      if (!jobId) {
        return;
      }
      try {
        const [summary, results] = await Promise.all([
          ruleRecommenderAPI.getNtApplicationJob(jobId),
          ruleRecommenderAPI.getNtApplicationJobResults(jobId),
        ]);
        if (!cancelled) {
          setNtJob(summary);
          setNtItems(results.items);
        }
      } catch {
        window.localStorage.removeItem(LAST_NT_APPLICATION_JOB_KEY);
      }
    };

    void restoreGenerationJob();
    void restoreNtJob();

    return () => {
      cancelled = true;
    };
  }, [aiOnly, ntOnly]);

  const selectSchemas = async (nextSchemaFqns: string[]) => {
    setSchemaFqns(nextSchemaFqns);
    setTableFqns([]);
    setTables([]);
    if (scopeMode !== 'TABLES' || nextSchemaFqns.length === 0) {
      return;
    }
    setCatalogLoading(true);
    try {
      const lists = await Promise.all(
        nextSchemaFqns.map((fqn) => ruleRecommenderAPI.getCatalogTables(fqn))
      );
      const byFqn = new Map<string, TableOption>();
      lists
        .flat()
        .forEach((table) => byFqn.set(table.fullyQualifiedName, table));
      setTables(Array.from(byFqn.values()));
    } catch (error) {
      notification.error({
        message: 'Cannot load tables',
        description: String(error),
      });
    } finally {
      setCatalogLoading(false);
    }
  };

  const selectDatabase = async (nextDatabaseFqn: string) => {
    setDatabaseFqn(nextDatabaseFqn);
    setSchemas([]);
    setSchemaFqns([]);
    setTables([]);
    setTableFqns([]);
    if (!nextDatabaseFqn) {
      return;
    }
    setCatalogLoading(true);
    try {
      setSchemas(await ruleRecommenderAPI.getCatalogSchemas(nextDatabaseFqn));
    } catch (error) {
      notification.error({
        message: 'Cannot load schemas',
        description: String(error),
      });
    } finally {
      setCatalogLoading(false);
    }
  };

  const selectService = async (nextServiceFqn: string) => {
    setServiceFqn(nextServiceFqn);
    setDatabases([]);
    setDatabaseFqn('');
    setSchemas([]);
    setSchemaFqns([]);
    setTables([]);
    setTableFqns([]);
    setCatalogLoading(true);
    try {
      setDatabases(
        await ruleRecommenderAPI.getCatalogDatabases(nextServiceFqn)
      );
    } catch (error) {
      notification.error({
        message: 'Cannot load databases',
        description: String(error),
      });
    } finally {
      setCatalogLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setCatalogLoading(true);
      try {
        const result = await ruleRecommenderAPI.getCatalogServices();
        if (!cancelled) {
          setServices(result);
        }
      } catch (error) {
        if (!cancelled) {
          notification.error({
            message: 'Cannot load services',
            description: String(error),
          });
        }
      } finally {
        if (!cancelled) {
          setCatalogLoading(false);
        }
      }
    };
    load();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (scopeMode === 'TABLES' && schemaFqns.length > 0) {
      selectSchemas(schemaFqns);
    } else {
      setTables([]);
      setTableFqns([]);
    }
    // Scope changes intentionally rebuild the explicit table selection.
  }, [scopeMode]);

  const scope = useMemo<TargetScope | null>(() => {
    if (scopeMode === 'TABLES') {
      return tableFqns.length > 0
        ? { type: 'TABLES', table_fqns: tableFqns }
        : null;
    }
    if (scopeMode === 'SCHEMAS') {
      return schemaFqns.length > 0
        ? { type: 'SCHEMAS', schema_fqns: schemaFqns }
        : null;
    }

    return databaseFqn ? { type: 'DATABASE', database_fqn: databaseFqn } : null;
  }, [databaseFqn, schemaFqns, scopeMode, tableFqns]);

  const candidateEngines = useMemo(
    () => enginesForMode(candidateEngineMode),
    [candidateEngineMode]
  );

  const selectCandidateEngineMode = (mode: CandidateEngineMode) => {
    setCandidateEngineMode(mode);
    setCandidatePreview(null);
    if (operation === 'CANDIDATE') {
      setOperation(null);
    }
  };

  const preview = async (nextOperation: Operation) => {
    if (!scope) {
      notification.warning({
        message: 'Target scope is incomplete',
        description:
          scopeMode === 'TABLES'
            ? 'Select at least one table.'
            : scopeMode === 'SCHEMAS'
            ? 'Select at least one schema.'
            : 'Select a database.',
      });

      return;
    }
    setPreviewLoading(true);
    try {
      if (nextOperation === 'CANDIDATE') {
        setCandidatePreview(
          await ruleRecommenderAPI.previewGenerationJob(
            candidateRequest(scope, candidateEngines)
          )
        );
      } else {
        setNtPreview(await ruleRecommenderAPI.previewNtApplicationJob(scope));
      }
      setOperation(nextOperation);
    } catch (error) {
      notification.error({
        message: 'Cannot preview operation',
        description: String(error),
      });
    } finally {
      setPreviewLoading(false);
    }
  };

  const confirm = async () => {
    if (!scope || !operation) {
      return;
    }
    setPreviewLoading(true);
    try {
      if (operation === 'CANDIDATE') {
        const job = await ruleRecommenderAPI.startGenerationJob(
          candidateRequest(scope, candidateEngines)
        );
        window.localStorage.setItem(LAST_GENERATION_JOB_KEY, job.job_id);
        setCandidateJob(job);
        setCandidateItems([]);
      } else {
        const job = await ruleRecommenderAPI.startNtApplicationJob(scope);
        window.localStorage.setItem(LAST_NT_APPLICATION_JOB_KEY, job.job_id);
        setNtJob(job);
        setNtItems([]);
      }
      setOperation(null);
    } catch (error) {
      notification.error({
        message: 'Cannot start job',
        description: String(error),
      });
    } finally {
      setPreviewLoading(false);
    }
  };

  useEffect(() => {
    if (!candidateJob || TERMINAL_STATUSES.has(candidateJob.status)) {
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const [summary, results] = await Promise.all([
          ruleRecommenderAPI.getGenerationJob(candidateJob.job_id),
          ruleRecommenderAPI.getGenerationJobResults(candidateJob.job_id),
        ]);
        if (cancelled) {
          return;
        }
        setCandidateJob(summary);
        setCandidateItems(results.items);
        if (TERMINAL_STATUSES.has(summary.status)) {
          notification[summary.status === 'FAILED' ? 'error' : 'success']({
            message: `Rule generation ${summary.status.toLowerCase()}`,
            description: `${summary.processed_items}/${summary.total_items} tables processed`,
          });
          await onCandidateComplete?.({
            job: summary,
            items: results.items,
            tableFqns: Array.from(
              new Set(results.items.map((item) => item.table_fqn))
            ),
          });
        }
      } catch (error) {
        notification.error({
          message: 'Cannot refresh rule generation job',
          description: String(error),
        });
      }
    }, 1200);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [candidateJob, onCandidateComplete]);

  useEffect(() => {
    if (!ntJob || TERMINAL_STATUSES.has(ntJob.status)) {
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const [summary, results] = await Promise.all([
          ruleRecommenderAPI.getNtApplicationJob(ntJob.job_id),
          ruleRecommenderAPI.getNtApplicationJobResults(ntJob.job_id),
        ]);
        if (cancelled) {
          return;
        }
        setNtJob(summary);
        setNtItems(results.items);
        if (TERMINAL_STATUSES.has(summary.status)) {
          notification[summary.status === 'FAILED' ? 'error' : 'success']({
            message: `NT application ${summary.status.toLowerCase()}`,
            description: `${summary.processed_tables}/${summary.total_tables} tables processed`,
          });
          await onNtComplete?.(results.items.map((item) => item.table_fqn));
        }
      } catch (error) {
        notification.error({
          message: 'Cannot refresh NT application job',
          description: String(error),
        });
      }
    }, 1200);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [ntJob, onNtComplete]);

  const activePreview =
    operation === 'CANDIDATE' ? candidatePreview : ntPreview;

  const candidateColumns: ColumnsType<GenerationJobItem> = [
    {
      title: 'Table',
      dataIndex: 'table_fqn',
      ellipsis: true,
    },
    {
      title: 'Engine',
      dataIndex: 'engine',
      width: 115,
      render: (engine: GoLiveRuleEngine) => (
        <Tag color={ENGINE_COLORS[engine]}>{engine}</Tag>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      width: 110,
      render: (value: GenerationJobItemStatus) => (
        <Tag color={statusColor(value)}>{value}</Tag>
      ),
    },
    { title: 'Generated', dataIndex: 'generated_count', width: 100 },
    { title: 'Existing', dataIndex: 'existing_count', width: 90 },
    {
      title: 'Action',
      width: 100,
      render: (_, item) => (
        <Button size="small" onClick={() => onOpenTable?.(item.table_fqn)}>
          View rules
        </Button>
      ),
    },
  ];

  const ntColumns: ColumnsType<NtApplicationJobItem> = [
    { title: 'Table', dataIndex: 'table_fqn', ellipsis: true },
    {
      title: 'Status',
      dataIndex: 'status',
      width: 110,
      render: (value: GenerationJobItemStatus) => (
        <Tag color={statusColor(value)}>{value}</Tag>
      ),
    },
    { title: 'Created', dataIndex: 'created_count', width: 90 },
    { title: 'Skipped', dataIndex: 'skipped_count', width: 90 },
    { title: 'Failed', dataIndex: 'failed_count', width: 80 },
  ];

  const toggleTable = (tableFqn: string, checked: boolean) => {
    setTableFqns((current) =>
      checked
        ? Array.from(new Set([...current, tableFqn]))
        : current.filter((item) => item !== tableFqn)
    );
  };

  const toggleSchema = (schemaFqn: string, checked: boolean) => {
    const nextSchemaFqns = checked
      ? Array.from(new Set([...schemaFqns, schemaFqn]))
      : schemaFqns.filter((item) => item !== schemaFqn);
    void selectSchemas(nextSchemaFqns);
  };

  const targetCount =
    scopeMode === 'TABLES'
      ? tableFqns.length
      : scopeMode === 'SCHEMAS'
      ? schemaFqns.length
      : databaseFqn
      ? 1
      : 0;

  const selectedTargetLabels =
    scopeMode === 'TABLES'
      ? tables
          .filter((table) => tableFqns.includes(table.fullyQualifiedName))
          .map((table) => table.name)
      : scopeMode === 'SCHEMAS'
      ? schemas
          .filter((schema) => schemaFqns.includes(schema.fullyQualifiedName))
          .map((schema) => schema.name)
      : databases
          .filter((database) => database.fullyQualifiedName === databaseFqn)
          .map((database) => database.name);
  const focusedMode = aiOnly || ntOnly;
  const focusedOperation: Operation = ntOnly ? 'NT' : 'CANDIDATE';

  return (
    <>
      <Card
        className="ai-generation-panel"
        data-testid="batch-target-scope"
        extra={
          focusedMode ? (
            <Space>
              <Button
                icon={expanded ? <UpOutlined /> : <DownOutlined />}
                onClick={() => setExpanded((value) => !value)}
              >
                {expanded ? 'Hide configuration' : 'Configure targets'}
              </Button>
            </Space>
          ) : undefined
        }
        style={{ borderRadius: 12, marginBottom: 20 }}
        title={
          focusedMode ? (
            <div className="ai-generation-title">
              <span className="ai-generation-title-icon">
                {ntOnly ? (
                  <SafetyCertificateOutlined />
                ) : (
                  <ExperimentOutlined />
                )}
              </span>
              <span className="ai-generation-title-copy">
                <Text strong>
                  {ntOnly
                    ? 'Apply NT Governance Rules'
                    : 'Generate Data Quality Rules'}
                </Text>
                <Text type="secondary">
                  Choose one or many tables, schemas, or a whole database.
                </Text>
              </span>
              <Tag color="blue">
                {targetCount} target{targetCount === 1 ? '' : 's'}
              </Tag>
            </div>
          ) : (
            'Target scope for DQ operations'
          )
        }
      >
        {focusedMode && expanded && (
          <div className="ai-generation-configuration">
            <div className="ai-generation-columns">
              <section className="ai-generation-targets">
                <Text className="ai-generation-section-label">
                  01 &nbsp; Select target scope
                </Text>
                <Radio.Group
                  buttonStyle="solid"
                  className="ai-scope-selector"
                  value={scopeMode}
                  onChange={(event) => setScopeMode(event.target.value)}
                >
                  <Radio.Button value="TABLES">
                    <TableOutlined /> Tables
                  </Radio.Button>
                  <Radio.Button value="SCHEMAS">
                    <ApartmentOutlined /> Schemas
                  </Radio.Button>
                  <Radio.Button value="DATABASE">
                    <DatabaseOutlined /> Database
                  </Radio.Button>
                </Radio.Group>

                <div className="ai-catalog-fields">
                  <label className="ai-catalog-field">
                    <Text strong>Service</Text>
                    <Select
                      showSearch
                      loading={catalogLoading}
                      options={services.map((item) => ({
                        label: item.name,
                        value: item.fullyQualifiedName,
                      }))}
                      placeholder="Select service"
                      value={serviceFqn || undefined}
                      onChange={selectService}
                    />
                  </label>
                  <label className="ai-catalog-field">
                    <Text strong>Database</Text>
                    <Select
                      showSearch
                      loading={catalogLoading}
                      options={databases.map((item) => ({
                        label: item.name,
                        value: item.fullyQualifiedName,
                      }))}
                      placeholder="Select database"
                      value={databaseFqn || undefined}
                      onChange={selectDatabase}
                    />
                  </label>
                  {scopeMode === 'TABLES' && (
                    <label className="ai-catalog-field">
                      <Text strong>Schema</Text>
                      <Select
                        showSearch
                        loading={catalogLoading}
                        mode="multiple"
                        options={schemas.map((item) => ({
                          label: item.name,
                          value: item.fullyQualifiedName,
                        }))}
                        placeholder="Select schema(s)"
                        value={schemaFqns}
                        onChange={selectSchemas}
                      />
                    </label>
                  )}
                </div>

                {scopeMode === 'TABLES' && (
                  <div className="ai-target-grid">
                    {tables.map((table) => {
                      const checked = tableFqns.includes(
                        table.fullyQualifiedName
                      );

                      return (
                        <label
                          className={`ai-target-option${
                            checked ? ' ai-target-option-selected' : ''
                          }`}
                          key={table.fullyQualifiedName}
                        >
                          <Checkbox
                            checked={checked}
                            onChange={(event) =>
                              toggleTable(
                                table.fullyQualifiedName,
                                event.target.checked
                              )
                            }
                          />
                          <TableOutlined />
                          <Text ellipsis title={table.fullyQualifiedName}>
                            {table.name}
                          </Text>
                          <Tag>Table</Tag>
                        </label>
                      );
                    })}
                    {schemaFqns.length > 0 &&
                      tables.length === 0 &&
                      !catalogLoading && (
                        <Text className="ai-target-empty" type="secondary">
                          No tables found in the selected schema(s).
                        </Text>
                      )}
                  </div>
                )}

                {scopeMode === 'SCHEMAS' && (
                  <div className="ai-target-grid">
                    {schemas.map((schema) => {
                      const checked = schemaFqns.includes(
                        schema.fullyQualifiedName
                      );

                      return (
                        <label
                          className={`ai-target-option${
                            checked ? ' ai-target-option-selected' : ''
                          }`}
                          key={schema.fullyQualifiedName}
                        >
                          <Checkbox
                            checked={checked}
                            onChange={(event) =>
                              toggleSchema(
                                schema.fullyQualifiedName,
                                event.target.checked
                              )
                            }
                          />
                          <ApartmentOutlined />
                          <Text ellipsis title={schema.fullyQualifiedName}>
                            {schema.name}
                          </Text>
                          <Tag>Schema</Tag>
                        </label>
                      );
                    })}
                  </div>
                )}

                {scopeMode === 'DATABASE' && (
                  <div className="ai-generation-tip">
                    <DatabaseOutlined />
                    <Text type="secondary">
                      Every table in the selected database will be included in
                      this {ntOnly ? 'NT application' : 'generation'} run.
                    </Text>
                  </div>
                )}
              </section>

              <section className="ai-generation-engines">
                <Text className="ai-generation-section-label">
                  02 &nbsp;{' '}
                  {ntOnly ? 'NT Governance setup' : 'Recommendation engine'}
                </Text>
                {ntOnly ? (
                  <>
                    <div className="ai-engine-list">
                      <div className="ai-engine-option ai-engine-option-selected">
                        <SafetyCertificateOutlined />
                        <Text strong>15 NT Definitions</Text>
                        <Tag color="blue">Configured</Tag>
                      </div>
                    </div>
                    <div className="ai-generation-tip">
                      <Text type="secondary">
                        Apply creates the NT Test Cases for the selected tables.
                        When DQ Backend executes them, it reads the latest saved
                        configuration from PostgreSQL.
                      </Text>
                    </div>
                  </>
                ) : (
                  <Radio.Group
                    className="ai-engine-list"
                    value={candidateEngineMode}
                    onChange={(event) =>
                      selectCandidateEngineMode(event.target.value)
                    }>
                    <label
                      className={`ai-engine-option ${
                        candidateEngineMode === 'BASIC'
                          ? 'ai-engine-option-selected'
                          : ''
                      }`}>
                      <Radio value="BASIC" />
                      <Text strong>Basic Rules</Text>
                      <Text type="secondary">
                        Completeness, validity and profiling
                      </Text>
                    </label>
                    <label
                      className={`ai-engine-option ${
                        candidateEngineMode === 'ADVANCED'
                          ? 'ai-engine-option-selected'
                          : ''
                      }`}>
                      <Radio value="ADVANCED" />
                      <Text strong>Advanced Rules</Text>
                      <Text type="secondary">LLM-based business rules</Text>
                    </label>
                    <label
                      className={`ai-engine-option ${
                        candidateEngineMode === 'BASIC_ADVANCED'
                          ? 'ai-engine-option-selected'
                          : ''
                      }`}>
                      <Radio value="BASIC_ADVANCED" />
                      <Text strong>Basic + Advanced</Text>
                      <Text type="secondary">Run both engines</Text>
                    </label>
                  </Radio.Group>
                )}
                <div className="ai-generation-tip">
                  <Text type="secondary">
                    {ntOnly
                      ? 'Use the settings action in the definitions table below to review or change each rule configuration before applying.'
                      : 'Selected targets apply only to this new generation. Saved recommendations remain available in All Saved Rules.'}
                  </Text>
                </div>
              </section>
            </div>

            <div className="ai-generation-footer">
              <div>
                <Text strong>
                  Ready for {targetCount}{' '}
                  {scopeMode === 'TABLES'
                    ? 'table(s)'
                    : scopeMode === 'SCHEMAS'
                    ? 'schema(s)'
                    : 'database(s)'}
                </Text>
                <Text ellipsis type="secondary">
                  {selectedTargetLabels.length > 0
                    ? `${selectedTargetLabels.join(', ')} · ${
                        ntOnly
                          ? '15 NT definitions'
                          : candidateEngines.join(' + ')
                      }`
                    : ntOnly
                    ? 'Select a target to apply NT Governance'
                    : `Select a target to generate ${candidateEngines.join(
                        ' + '
                      )} rules`}
                </Text>
              </div>
              <Button
                data-testid={ntOnly ? 'preview-nt-job' : 'preview-basic-job'}
                disabled={!scope}
                icon={
                  ntOnly ? (
                    <SafetyCertificateOutlined />
                  ) : (
                    <ExperimentOutlined />
                  )
                }
                loading={previewLoading && operation === focusedOperation}
                type="primary"
                onClick={() => preview(focusedOperation)}
              >
                {ntOnly
                  ? 'Preview & Apply NT Governance'
                  : 'Generate & View Results'}
              </Button>
            </div>
          </div>
        )}

        {!focusedMode && (
          <>
            <Alert
              showIcon
              message="Basic and Advanced engines are available for go-live. Statistical remains disabled."
              style={{ marginBottom: 16 }}
              type="info"
            />
            <Row gutter={[16, 16]}>
              <Col lg={6} xs={24}>
                <Text strong>Scope</Text>
                <Radio.Group
                  buttonStyle="solid"
                  optionType="button"
                  style={{ display: 'flex', marginTop: 6 }}
                  value={scopeMode}
                  onChange={(event) => setScopeMode(event.target.value)}
                >
                  <Radio.Button value="TABLES">Tables</Radio.Button>
                  <Radio.Button value="SCHEMAS">Schemas</Radio.Button>
                  <Radio.Button value="DATABASE">Database</Radio.Button>
                </Radio.Group>
              </Col>
              <Col lg={6} xs={24}>
                <Text strong>Service</Text>
                <Select
                  showSearch
                  loading={catalogLoading}
                  options={services.map((item) => ({
                    label: item.name,
                    value: item.fullyQualifiedName,
                  }))}
                  placeholder="Select service"
                  style={{ width: '100%', marginTop: 6 }}
                  value={serviceFqn || undefined}
                  onChange={selectService}
                />
              </Col>
              <Col lg={6} xs={24}>
                <Text strong>Database</Text>
                <Select
                  showSearch
                  loading={catalogLoading}
                  options={databases.map((item) => ({
                    label: item.name,
                    value: item.fullyQualifiedName,
                  }))}
                  placeholder="Select database"
                  style={{ width: '100%', marginTop: 6 }}
                  value={databaseFqn || undefined}
                  onChange={selectDatabase}
                />
              </Col>
              {scopeMode !== 'DATABASE' && (
                <Col lg={6} xs={24}>
                  <Text strong>Schema</Text>
                  <Select
                    showSearch
                    loading={catalogLoading}
                    mode="multiple"
                    options={schemas.map((item) => ({
                      label: item.name,
                      value: item.fullyQualifiedName,
                    }))}
                    placeholder="Select one or more schemas"
                    style={{ width: '100%', marginTop: 6 }}
                    value={schemaFqns}
                    onChange={selectSchemas}
                  />
                </Col>
              )}
            </Row>
            {scopeMode === 'TABLES' && (
              <div style={{ marginTop: 16 }}>
                <Text strong>Tables</Text>
                <Select
                  showSearch
                  loading={catalogLoading}
                  mode="multiple"
                  options={tables.map((table) => ({
                    label: `${table.name} (${table.fullyQualifiedName})`,
                    value: table.fullyQualifiedName,
                  }))}
                  placeholder="Explicitly select at least one table"
                  style={{ width: '100%', marginTop: 6 }}
                  value={tableFqns}
                  onChange={setTableFqns}
                />
              </div>
            )}
            <div style={{ marginTop: 16 }}>
              <Text strong>Recommendation engine</Text>
              <Radio.Group
                style={{ display: 'block', marginTop: 6 }}
                value={candidateEngineMode}
                onChange={(event) =>
                  selectCandidateEngineMode(event.target.value)
                }>
                <Radio value="BASIC">Basic</Radio>
                <Radio value="ADVANCED">Advanced</Radio>
                <Radio value="BASIC_ADVANCED">Basic + Advanced</Radio>
              </Radio.Group>
            </div>
            <Space wrap style={{ marginTop: 18 }}>
              <Button
                data-testid="preview-basic-job"
                icon={<ExperimentOutlined />}
                loading={previewLoading && operation === 'CANDIDATE'}
                type="primary"
                onClick={() => preview('CANDIDATE')}
              >
                Preview & Generate Rules
              </Button>
              {!aiOnly && (
                <Button
                  data-testid="preview-nt-job"
                  icon={<SafetyCertificateOutlined />}
                  loading={previewLoading && operation === 'NT'}
                  onClick={() => preview('NT')}
                >
                  Preview & Apply NT Governance
                </Button>
              )}
              <Tag icon={<DatabaseOutlined />}>
                {scopeMode === 'TABLES'
                  ? `${tableFqns.length} selected tables`
                  : scopeMode === 'SCHEMAS'
                  ? `${schemaFqns.length} selected schemas`
                  : databaseFqn || 'No database selected'}
              </Tag>
            </Space>
          </>
        )}
      </Card>

      {!ntOnly && candidateJob && (
        <Card
          style={{ borderRadius: 12, marginBottom: 20 }}
          title={
            <Space wrap>
              <Text>{`Rule generation job ${candidateJob.job_id}`}</Text>
              {candidateJob.engines.map((engine) => (
                <Tag
                  color={ENGINE_COLORS[engine as GoLiveRuleEngine]}
                  key={engine}>
                  {engine}
                </Tag>
              ))}
            </Space>
          }
        >
          <div
            style={{
              alignItems: 'center',
              display: 'flex',
              gap: 12,
            }}>
            <Progress
              percent={Math.round(
                (candidateJob.processed_items /
                  Math.max(candidateJob.total_items, 1)) *
                  100
              )}
              status={
                candidateJob.status === 'FAILED' ? 'exception' : undefined
              }
              style={{ flex: 1, marginBottom: 0 }}
            />
            {!TERMINAL_STATUSES.has(candidateJob.status) && (
              <LoadingOutlined
                spin
                aria-label="Rule generation is running"
                style={{ color: '#1890ff', fontSize: 20 }}
              />
            )}
          </div>
          <Descriptions column={4} size="small">
            <Descriptions.Item label="Status">
              {candidateJob.status}
            </Descriptions.Item>
            <Descriptions.Item label="Processed">
              {candidateJob.processed_items}/{candidateJob.total_items}
            </Descriptions.Item>
            <Descriptions.Item label="Generated">
              {Object.values(candidateJob.generated_rules).reduce(
                (total, count) => total + count,
                0
              )}
            </Descriptions.Item>
            <Descriptions.Item label="Failed">
              {candidateJob.failed_items}
            </Descriptions.Item>
          </Descriptions>
          <Table
            columns={candidateColumns}
            dataSource={candidateItems}
            pagination={{ pageSize: 10 }}
            rowKey="item_id"
            size="small"
          />
        </Card>
      )}

      {!aiOnly && ntJob && (
        <Card
          style={{ borderRadius: 12, marginBottom: 20 }}
          title={`NT application job ${ntJob.job_id}`}
        >
          <Progress
            percent={Math.round(
              (ntJob.processed_tables / Math.max(ntJob.total_tables, 1)) * 100
            )}
            status={ntJob.status === 'FAILED' ? 'exception' : undefined}
          />
          <Descriptions column={4} size="small">
            <Descriptions.Item label="Status">{ntJob.status}</Descriptions.Item>
            <Descriptions.Item label="Processed">
              {ntJob.processed_tables}/{ntJob.total_tables}
            </Descriptions.Item>
            <Descriptions.Item label="Created">
              {ntJob.created_count}
            </Descriptions.Item>
            <Descriptions.Item label="Failed">
              {ntJob.failed_count}
            </Descriptions.Item>
          </Descriptions>
          <Table
            columns={ntColumns}
            dataSource={ntItems}
            pagination={{ pageSize: 10 }}
            rowKey="item_id"
            size="small"
          />
        </Card>
      )}

      <Modal
        destroyOnClose
        confirmLoading={previewLoading}
        okText={operation === 'CANDIDATE' ? 'Start generation job' : 'Start NT job'}
        open={operation !== null && activePreview !== null}
        title={
          operation === 'CANDIDATE'
            ? 'Confirm rule generation'
            : 'Confirm NT Governance application'
        }
        width={720}
        onCancel={() => setOperation(null)}
        onOk={confirm}
      >
        {activePreview && (
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Alert
              showIcon
              message={`The server resolved ${activePreview.total_tables} tables. This exact snapshot will be used by the job.`}
              type="warning"
            />
            <Descriptions bordered column={2} size="small">
              <Descriptions.Item label="Scope">
                {activePreview.scope.type}
              </Descriptions.Item>
              <Descriptions.Item label="Tables">
                {activePreview.total_tables}
              </Descriptions.Item>
              {operation === 'CANDIDATE' && candidatePreview && (
                <Descriptions.Item label="Engine" span={2}>
                  {candidateEngines.join(' + ')} ({candidatePreview.total_items}{' '}
                  tasks)
                </Descriptions.Item>
              )}
              {operation === 'NT' && ntPreview && (
                <Descriptions.Item label="Maximum Test Cases" span={2}>
                  {ntPreview.maximum_test_cases}
                </Descriptions.Item>
              )}
            </Descriptions>
            <Collapse>
              <Collapse.Panel
                header={`Resolved tables (${activePreview.total_tables})`}
                key="tables"
              >
                <List
                  bordered
                  dataSource={activePreview.tables}
                  pagination={
                    activePreview.tables.length > 10
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
              </Collapse.Panel>
            </Collapse>
          </Space>
        )}
      </Modal>
    </>
  );
};

export default BatchOperationsPanel;
