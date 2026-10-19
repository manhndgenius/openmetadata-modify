/*
 *  Copyright 2026 Collate.
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

import { DatabaseOutlined, RocketOutlined } from '@ant-design/icons';
import { Alert, Button, Card, Col, Collapse, List, Row, Space, Table, Tag, Typography } from 'antd';
import { useTranslation } from 'react-i18next';
import { NtGovernanceSummary, NtTestDefinition } from '../../../services/ruleRecommenderAPI';
import NtDefinitionsTable from './NtDefinitionsTable';

const { Text } = Typography;

interface NtGovernanceTabProps {
  /** Fully qualified name of the table owning this governance view */
  tableFqn: string;
  /** List of NT test definitions for the current table */
  definitions: NtTestDefinition[];
  /** Whether the definitions are loading */
  loading: boolean;
  /** Error message when loading definitions failed */
  error?: string | null;
  /** Whether the create-default action is loading */
  creating: boolean;
  /** Whether fetching existing test cases is loading */
  loadingTestCases: boolean;
  /** Result from creating default test cases */
  result: NtGovernanceSummary | null;
  /** Existing test cases for this table */
  existingTestCases: unknown[];
  /** Callback to create default test cases */
  onCreateDefaults: () => void;
  /** Callback to view existing test cases */
  onViewExisting: () => void;
  /** Callback when user wants to configure an NT rule */
  onConfigureRule: (ruleName: string) => void;
}

const NtGovernanceTab = ({
  definitions,
  loading,
  error,
  creating,
  loadingTestCases,
  result,
  existingTestCases,
  onCreateDefaults,
  onViewExisting,
  onConfigureRule,
}: NtGovernanceTabProps) => {
  const { t } = useTranslation();

  return (
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
          loading={creating}
          type="primary"
          onClick={onCreateDefaults}
        >
          {t('label.create-default-test-cases')}
        </Button>
        <Button
          icon={<DatabaseOutlined />}
          loading={loadingTestCases}
          onClick={onViewExisting}
        >
          {t('label.view-existing-test-cases')}
        </Button>
      </Space>

      {error && (
        <Alert
          showIcon
          description={error}
          message="Unable to load NT rule status"
          style={{ marginBottom: 16 }}
          type="error"
        />
      )}

      {/* NT Definitions Table with Configure Action */}
      <NtDefinitionsTable
        definitions={definitions}
        error={error}
        loading={loading}
        onConfigure={onConfigureRule}
      />

      {/* Creation Result Card */}
      {result && (
        <Card
          className="nt-governance-card"
          size="small"
          title={t('label.nt-creation-result')}
        >
          <Row gutter={16} style={{ marginBottom: 12 }}>
            <Col>
              <Tag color="success">
                {t('label.created')}: {result.created_count}
              </Tag>
            </Col>
            <Col>
              <Tag color="warning">
                {t('label.skipped')}: {result.skipped_count}
              </Tag>
            </Col>
            <Col>
              <Tag color="error">
                {t('label.failed')}: {result.failed_count}
              </Tag>
            </Col>
          </Row>
          <Collapse ghost>
            <Collapse.Panel
              header={`${t('label.created-test-cases')} (${result.test_cases.length})`}
              key="created"
            >
              <List
                dataSource={result.test_cases}
                renderItem={(tc) => (
                  <List.Item>
                    <Text code>{tc.name}</Text>{' '}
                    <Tag color="geekblue">{tc.testDefinition}</Tag>
                  </List.Item>
                )}
                size="small"
              />
            </Collapse.Panel>
            {result.skipped.length > 0 && (
              <Collapse.Panel
                header={`${t('label.skipped-test-cases')} (${result.skipped.length})`}
                key="skipped"
              >
                <List
                  dataSource={result.skipped}
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
            {result.failed.length > 0 && (
              <Collapse.Panel
                header={`${t('label.failed-test-cases')} (${result.failed.length})`}
                key="failed"
              >
                <List
                  dataSource={result.failed}
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

      {/* Existing Test Cases Card */}
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
  );
};

export default NtGovernanceTab;
