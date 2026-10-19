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

import { CheckCircleOutlined, SettingOutlined } from '@ant-design/icons';
import { Button, Card, Space, Table, Tag, Tooltip, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useTranslation } from 'react-i18next';
import { NtTestDefinition } from '../../../services/ruleRecommenderAPI';

const { Text } = Typography;

interface NtDefinitionsTableProps {
  definitions: NtTestDefinition[];
  loading: boolean;
  configuringRuleName?: string;
  error?: string | null;
  onConfigure: (ruleName: string) => void;
}

const NtDefinitionsTable = ({
  definitions,
  loading,
  configuringRuleName,
  error,
  onConfigure,
}: NtDefinitionsTableProps) => {
  const { t } = useTranslation();

  const columns: ColumnsType<NtTestDefinition> = [
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
          <Tag color="success" icon={<CheckCircleOutlined />}>
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
            loading={configuringRuleName === record.name}
            type="text"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onConfigure(record.name);
            }}
          />
        </Tooltip>
      ),
    },
  ];

  return (
    <Card
      className="nt-governance-card"
      extra={
        <Space size={6}>
          <Tag color="success">
            {definitions.filter((d) => d.status === 'APPLIED').length} APPLIED
          </Tag>
          <Tag>
            {definitions.filter((d) => d.status !== 'APPLIED').length} NOT APPLIED
          </Tag>
        </Space>
      }
      size="small"
      title={t('label.available-nt-definitions')}
    >
      <Table
        columns={columns}
        dataSource={definitions}
        loading={loading}
        locale={{
          emptyText: error ? 'Status unavailable' : 'No NT definitions found',
        }}
        pagination={false}
        rowKey="name"
        size="small"
      />
    </Card>
  );
};

export default NtDefinitionsTable;
