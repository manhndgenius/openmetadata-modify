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

import { fireEvent, render, screen } from '@testing-library/react';
import NtDefinitionsTable from './NtDefinitionsTable';

const definitions = [
  {
    description: 'Checks table naming',
    displayName: 'Table Naming Convention',
    name: 'NT1_TableNaming',
    status: 'APPLIED' as const,
  },
  {
    description: 'Checks required tags',
    displayName: 'Required Tags',
    name: 'NT2_Tagging',
    status: 'NOT_APPLIED' as const,
  },
];

describe('NtDefinitionsTable', () => {
  it('renders statuses and configures the selected definition', () => {
    const onConfigure = jest.fn();
    render(
      <NtDefinitionsTable
        definitions={definitions}
        loading={false}
        onConfigure={onConfigure}
      />
    );

    expect(screen.getByText('1 APPLIED')).toBeInTheDocument();
    expect(screen.getByText('1 NOT APPLIED')).toBeInTheDocument();

    fireEvent.click(
      screen.getByTestId('configure-nt-rule-NT1_TableNaming')
    );

    expect(onConfigure).toHaveBeenCalledWith('NT1_TableNaming');
  });

  it('shows loading on only the rule being configured', () => {
    render(
      <NtDefinitionsTable
        configuringRuleName="NT1_TableNaming"
        definitions={definitions}
        loading={false}
        onConfigure={jest.fn()}
      />
    );

    expect(
      screen.getByTestId('configure-nt-rule-NT1_TableNaming')
    ).toHaveClass('ant-btn-loading');
    expect(
      screen.getByTestId('configure-nt-rule-NT2_Tagging')
    ).not.toHaveClass('ant-btn-loading');
  });
});
