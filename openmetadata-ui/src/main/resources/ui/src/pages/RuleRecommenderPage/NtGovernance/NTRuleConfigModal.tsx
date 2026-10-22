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

import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import {
  Alert,
  Button,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Switch,
  Typography,
} from 'antd';
import { useEffect } from 'react';
import { DataType } from '../../../generated/entity/data/table';
import {
  NtRuleConfig,
  NtRuleConfigField,
  NtRuleConfigRule,
} from '../../../services/ruleRecommenderAPI';

const isHiddenScopeField = (fieldName: string) => {
  const normalizedName = fieldName.toLowerCase();

  return (
    normalizedName.startsWith('excluded') ||
    normalizedName.startsWith('included')
  );
};

interface NTRuleConfigModalProps {
  rule: NtRuleConfigRule;
  initialConfig: NtRuleConfig;
  inline?: boolean;
  isSaving?: boolean;
  onCancel: () => void;
  onSave: (config: NtRuleConfig) => void;
  onReset?: () => void;
}

const regexValidator = (_: unknown, value?: string) => {
  if (!value) {
    return Promise.resolve();
  }
  try {
    new RegExp(value);

    return Promise.resolve();
  } catch (error) {
    return Promise.reject(
      new Error(error instanceof Error ? error.message : 'Invalid regex')
    );
  }
};

const regexListValidator = (_: unknown, value?: string[]) =>
  Promise.all(
    (value ?? []).map((pattern) => regexValidator(null, pattern))
  ).then(() => undefined);

const NTRuleConfigModal = ({
  rule,
  initialConfig,
  inline = false,
  isSaving = false,
  onCancel,
  onSave,
  onReset,
}: NTRuleConfigModalProps) => {
  const [form] = Form.useForm<NtRuleConfig>();
  const visibleFields = rule.fields.filter(
    (field) => !isHiddenScopeField(field.name)
  );

  useEffect(() => {
    form.setFieldsValue(initialConfig);
  }, [form, initialConfig, rule.name]);

  const rulesFor = (field: NtRuleConfigField) => {
    const validationRules: Array<Record<string, unknown>> = [];
    if (!field.optional) {
      validationRules.push({
        required: true,
        message: `${field.label} is required`,
      });
    }
    if (field.control === 'REGEX') {
      validationRules.push({ validator: regexValidator });
    }
    if (field.control === 'REGEX_LIST') {
      validationRules.push({ validator: regexListValidator });
    }

    return validationRules;
  };

  const renderMapping = (field: NtRuleConfigField) => (
    <Form.List
      key={field.name}
      name={field.name}
      rules={[
        {
          validator: (_, value) =>
            field.optional || (Array.isArray(value) && value.length > 0)
              ? Promise.resolve()
              : Promise.reject(new Error(`${field.label} is required`)),
        },
      ]}
    >
      {(rows, { add, remove }, { errors }) => (
        <Form.Item label={field.label} required={!field.optional}>
          <Space direction="vertical" size="small" style={{ width: '100%' }}>
            {rows.map((row) => (
              <Space align="start" key={row.key} style={{ width: '100%' }}>
                {(field.columns ?? []).map((column) => (
                  <Form.Item
                    key={column.name}
                    name={[row.name, column.name]}
                    rules={[
                      { required: true, message: `${column.name} is required` },
                    ]}
                    style={{ marginBottom: 8 }}
                  >
                    {column.control === 'DATA_TYPE_MULTI_SELECT' ? (
                      <Select
                        showSearch
                        data-testid={`${field.name}-${column.name}-${row.name}`}
                        mode="multiple"
                        options={Object.values(DataType).map((dataType) => ({
                          label: dataType,
                          value: dataType,
                        }))}
                        placeholder="Select OpenMetadata data types"
                        style={{ minWidth: 260 }}
                      />
                    ) : column.control === 'TAG_LIST' ? (
                      <Select
                        mode="tags"
                        placeholder={column.name}
                        style={{ minWidth: 230 }}
                      />
                    ) : (
                      <Input
                        placeholder={column.name}
                        style={{ minWidth: 160 }}
                      />
                    )}
                  </Form.Item>
                ))}
                <Button
                  danger
                  aria-label={`Remove ${field.label}`}
                  icon={<DeleteOutlined />}
                  type="text"
                  onClick={() => remove(row.name)}
                />
              </Space>
            ))}
            <Button
              block
              icon={<PlusOutlined />}
              type="dashed"
              onClick={() => add()}
            >
              Add mapping
            </Button>
            <Form.ErrorList errors={errors} />
          </Space>
        </Form.Item>
      )}
    </Form.List>
  );

  const renderField = (field: NtRuleConfigField) => {
    if (field.control === 'EDITABLE_MAPPING') {
      return renderMapping(field);
    }

    if (field.control === 'BOOLEAN') {
      return (
        <Form.Item
          key={field.name}
          label={field.label}
          name={field.name}
          valuePropName="checked"
        >
          <Switch disabled={field.disabled} />
        </Form.Item>
      );
    }

    let control = <Input disabled={field.disabled} />;
    if (field.control === 'NUMBER') {
      control = (
        <InputNumber
          disabled={field.disabled}
          max={field.maximum}
          min={field.minimum}
          precision={field.integer ? 0 : undefined}
          style={{ width: '100%' }}
        />
      );
    } else if (
      field.control === 'TAG_LIST' ||
      field.control === 'REGEX_LIST' ||
      field.control === 'MULTI_SELECT'
    ) {
      control = (
        <Select
          disabled={field.disabled}
          mode={
            field.control === 'MULTI_SELECT' && !field.allowCustom
              ? 'multiple'
              : 'tags'
          }
          options={(field.options ?? []).map((option) => ({
            label: option,
            value: option,
          }))}
        />
      );
    } else if (field.control === 'SELECT') {
      control = (
        <Select
          disabled={field.disabled}
          options={(field.options ?? []).map((option) => ({
            label: option,
            value: option,
          }))}
        />
      );
    }

    return (
      <Form.Item
        key={field.name}
        label={field.label}
        name={field.name}
        rules={rulesFor(field)}
      >
        {control}
      </Form.Item>
    );
  };

  const handleFinish = (values: NtRuleConfig) => {
    const warning = values.warningThreshold;
    const failure = values.failureThreshold;
    if (
      typeof warning === 'number' &&
      typeof failure === 'number' &&
      warning > failure
    ) {
      form.setFields([
        {
          name: 'warningThreshold',
          errors: ['Warning threshold must not exceed failure threshold'],
        },
      ]);

      return;
    }
    const visibleValues = Object.fromEntries(
      Object.entries(values).filter(([name]) => !isHiddenScopeField(name))
    );
    onSave(visibleValues);
  };

  const formContent = (
    <>
      <Alert
        showIcon
        message="Configuration is stored in PostgreSQL and shared by all NT runs."
        type="info"
      />
      <Typography.Paragraph className="m-t-sm" type="secondary">
        Test Definition: {rule.name}
      </Typography.Paragraph>
      {visibleFields.length === 0 ? (
        <Alert
          message="This rule has no configurable parameters."
          type="warning"
        />
      ) : null}
      <Form
        form={form}
        initialValues={initialConfig}
        layout="vertical"
        onFinish={handleFinish}
      >
        {visibleFields.map(renderField)}
        <Space className="w-full justify-end">
          <Button
            data-testid="reset-nt-rule-config"
            disabled={isSaving}
            onClick={onReset}
          >
            Reset defaults
          </Button>
          {!inline && (
            <Button disabled={isSaving} onClick={onCancel}>
              Cancel
            </Button>
          )}
          <Button
            data-testid="save-nt-rule-config"
            htmlType="submit"
            loading={isSaving}
            type="primary"
          >
            Save
          </Button>
        </Space>
      </Form>
    </>
  );

  if (inline) {
    return <div className="nt-rule-config-inline">{formContent}</div>;
  }

  return (
    <Modal
      destroyOnClose
      visible
      footer={null}
      title={`Configure ${rule.display_name}`}
      width={720}
      onCancel={onCancel}
    >
      {formContent}
    </Modal>
  );
};

export default NTRuleConfigModal;
