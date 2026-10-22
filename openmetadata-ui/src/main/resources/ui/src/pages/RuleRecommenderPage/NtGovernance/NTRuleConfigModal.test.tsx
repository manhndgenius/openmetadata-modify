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

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import NTRuleConfigModal from './NTRuleConfigModal';

const rule = {
  configurable: true,
  defaults: { nameRegex: '^default$' },
  display_name: 'Table Naming Convention',
  fields: [
    {
      control: 'REGEX' as const,
      label: 'Name regex',
      name: 'nameRegex',
    },
  ],
  name: 'NT1_TableNaming',
};

describe('NTRuleConfigModal', () => {
  it('renders saved values and submits the edited config', async () => {
    const onSave = jest.fn();
    render(
      <NTRuleConfigModal
        initialConfig={{ nameRegex: '^saved$' }}
        rule={rule}
        onCancel={jest.fn()}
        onSave={onSave}
      />
    );

    const input = screen.getByDisplayValue('^saved$');
    fireEvent.change(input, { target: { value: '^edited$' } });
    fireEvent.click(screen.getByTestId('save-nt-rule-config'));

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith({ nameRegex: '^edited$' })
    );
  });

  it('renders the same validated form inline without a modal', () => {
    render(
      <NTRuleConfigModal
        inline
        initialConfig={{ nameRegex: '^saved$' }}
        rule={rule}
        onCancel={jest.fn()}
        onSave={jest.fn()}
      />
    );

    expect(screen.getByDisplayValue('^saved$')).toBeInTheDocument();
    expect(screen.getByTestId('save-nt-rule-config')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByText('Cancel')).not.toBeInTheDocument();
  });

  it('does not submit an invalid regular expression', async () => {
    const onSave = jest.fn();
    render(
      <NTRuleConfigModal
        initialConfig={rule.defaults}
        rule={rule}
        onCancel={jest.fn()}
        onSave={onSave}
      />
    );

    fireEvent.change(screen.getByDisplayValue('^default$'), {
      target: { value: '[' },
    });
    fireEvent.click(screen.getByTestId('save-nt-rule-config'));

    await waitFor(() => expect(onSave).not.toHaveBeenCalled());
  });

  it('resets the persisted override through the backend callback', () => {
    const onReset = jest.fn();
    render(
      <NTRuleConfigModal
        initialConfig={rule.defaults}
        rule={rule}
        onCancel={jest.fn()}
        onReset={onReset}
        onSave={jest.fn()}
      />
    );

    fireEvent.click(screen.getByTestId('reset-nt-rule-config'));

    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it('renders allowedTypes as an OpenMetadata data type selector', () => {
    const mappingRule = {
      configurable: true,
      defaults: {
        suffixTypeMappings: [{ allowedTypes: ['TIMESTAMPZ'], suffix: '_at' }],
      },
      display_name: 'Date Time Columns',
      fields: [
        {
          columns: [
            { control: 'TEXT' as const, name: 'suffix' },
            {
              control: 'DATA_TYPE_MULTI_SELECT' as const,
              name: 'allowedTypes',
            },
          ],
          control: 'EDITABLE_MAPPING' as const,
          label: 'Suffix and allowed type mappings',
          name: 'suffixTypeMappings',
        },
      ],
      name: 'NT5_DateTimeColumns',
    };

    render(
      <NTRuleConfigModal
        initialConfig={mappingRule.defaults}
        rule={mappingRule}
        onCancel={jest.fn()}
        onSave={jest.fn()}
      />
    );

    expect(
      screen.getByTestId('suffixTypeMappings-allowedTypes-0')
    ).toBeInTheDocument();
    expect(screen.getByText('TIMESTAMPZ')).toBeInTheDocument();
  });

  it('hides excluded and included scope fields from the parameter form', async () => {
    const onSave = jest.fn();
    const scopedRule = {
      ...rule,
      defaults: {
        excludedColumns: ['internal_id'],
        excludedPatterns: ['^tmp_'],
        includedColumns: ['name'],
        nameRegex: '^default$',
      },
      fields: [
        ...rule.fields,
        {
          control: 'TAG_LIST' as const,
          label: 'Excluded columns',
          name: 'excludedColumns',
        },
        {
          control: 'REGEX_LIST' as const,
          label: 'Excluded patterns',
          name: 'excludedPatterns',
        },
        {
          control: 'TAG_LIST' as const,
          label: 'Included columns',
          name: 'includedColumns',
        },
      ],
    };

    render(
      <NTRuleConfigModal
        initialConfig={scopedRule.defaults}
        rule={scopedRule}
        onCancel={jest.fn()}
        onSave={onSave}
      />
    );

    expect(screen.queryByText('Excluded columns')).not.toBeInTheDocument();
    expect(screen.queryByText('Excluded patterns')).not.toBeInTheDocument();
    expect(screen.queryByText('Included columns')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('save-nt-rule-config'));

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith({ nameRegex: '^default$' })
    );
  });
});
