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
});
