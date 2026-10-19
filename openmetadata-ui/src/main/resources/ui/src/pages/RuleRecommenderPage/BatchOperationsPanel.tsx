/*
 *  Copyright 2024 Collate.
 *  Licensed under the Apache License, Version 2.0 (the "License");
 */

import {
  DatabaseOutlined,
  ExperimentOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons';
import {
  Alert,
  Button,
  Card,
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
  NtApplicationJobItem,
  NtApplicationJobSummary,
  NtApplicationPreview,
  ruleRecommenderAPI,
  TableOption,
  TargetScope,
} from '../../services/ruleRecommenderAPI';

const { Text } = Typography;
const TERMINAL_STATUSES = new Set(['SUCCESS', 'PARTIAL', 'FAILED']);

type ScopeMode = TargetScope['type'];
type Operation = 'CANDIDATE' | 'NT';

interface BatchOperationsPanelProps {
  onOpenTable?: (tableFqn: string) => void | Promise<void>;
  onCandidateComplete?: (tableFqns: string[]) => void | Promise<void>;
  onNtComplete?: (tableFqns: string[]) => void | Promise<void>;
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

const candidateRequest = (scope: TargetScope): BulkGenerationRequest => ({
  scope,
  engines: ['BASIC'],
  options: { min_confidence: 0.6, use_llm: false },
  concurrency: { metadata: 4, basic: 8 },
});

const BatchOperationsPanel = ({
  onOpenTable,
  onCandidateComplete,
  onNtComplete,
}: BatchOperationsPanelProps) => {
  const [scopeMode, setScopeMode] = useState<ScopeMode>('TABLES');
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
  const [candidateJob, setCandidateJob] =
    useState<GenerationJobSummary | null>(null);
  const [candidateItems, setCandidateItems] = useState<GenerationJobItem[]>([]);
  const [ntJob, setNtJob] = useState<NtApplicationJobSummary | null>(null);
  const [ntItems, setNtItems] = useState<NtApplicationJobItem[]>([]);

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
      lists.flat().forEach((table) =>
        byFqn.set(table.fullyQualifiedName, table)
      );
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
      setSchemas(
        await ruleRecommenderAPI.getCatalogSchemas(nextDatabaseFqn)
      );
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
      return tableFqns.length > 0 ? { type: 'TABLES', table_fqns: tableFqns } : null;
    }
    if (scopeMode === 'SCHEMAS') {
      return schemaFqns.length > 0
        ? { type: 'SCHEMAS', schema_fqns: schemaFqns }
        : null;
    }

    return databaseFqn ? { type: 'DATABASE', database_fqn: databaseFqn } : null;
  }, [databaseFqn, schemaFqns, scopeMode, tableFqns]);

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
            candidateRequest(scope)
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
          candidateRequest(scope)
        );
        setCandidateJob(job);
        setCandidateItems([]);
      } else {
        const job = await ruleRecommenderAPI.startNtApplicationJob(scope);
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
            message: `Basic generation ${summary.status.toLowerCase()}`,
            description: `${summary.processed_items}/${summary.total_items} tables processed`,
          });
          await onCandidateComplete?.(
            results.items.map((item) => item.table_fqn)
          );
        }
      } catch (error) {
        notification.error({
          message: 'Cannot refresh Basic generation job',
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

  return (
    <>
      <Card
        data-testid="batch-target-scope"
        style={{ borderRadius: 12, marginBottom: 20 }}
        title="Target scope for DQ operations"
      >
        <Alert
          showIcon
          message="Candidate generation is currently limited to the BASIC engine."
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
        <Space wrap style={{ marginTop: 18 }}>
          <Button
            data-testid="preview-basic-job"
            icon={<ExperimentOutlined />}
            loading={previewLoading && operation === 'CANDIDATE'}
            type="primary"
            onClick={() => preview('CANDIDATE')}
          >
            Preview & Generate BASIC Rules
          </Button>
          <Button
            data-testid="preview-nt-job"
            icon={<SafetyCertificateOutlined />}
            loading={previewLoading && operation === 'NT'}
            onClick={() => preview('NT')}
          >
            Preview & Apply NT Governance
          </Button>
          <Tag icon={<DatabaseOutlined />}>
            {scopeMode === 'TABLES'
              ? `${tableFqns.length} selected tables`
              : scopeMode === 'SCHEMAS'
              ? `${schemaFqns.length} selected schemas`
              : databaseFqn || 'No database selected'}
          </Tag>
        </Space>
      </Card>

      {candidateJob && (
        <Card
          style={{ borderRadius: 12, marginBottom: 20 }}
          title={`BASIC generation job ${candidateJob.job_id}`}
        >
          <Progress
            percent={Math.round(
              (candidateJob.processed_items /
                Math.max(candidateJob.total_items, 1)) *
                100
            )}
            status={candidateJob.status === 'FAILED' ? 'exception' : undefined}
          />
          <Descriptions column={4} size="small">
            <Descriptions.Item label="Status">
              {candidateJob.status}
            </Descriptions.Item>
            <Descriptions.Item label="Processed">
              {candidateJob.processed_items}/{candidateJob.total_items}
            </Descriptions.Item>
            <Descriptions.Item label="Generated">
              {candidateJob.generated_rules.BASIC || 0}
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

      {ntJob && (
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
        okText={operation === 'CANDIDATE' ? 'Start BASIC job' : 'Start NT job'}
        open={operation !== null && activePreview !== null}
        title={
          operation === 'CANDIDATE'
            ? 'Confirm BASIC rule generation'
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
                  BASIC ({candidatePreview.total_items} tasks)
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
