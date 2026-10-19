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

import { render, screen } from '@testing-library/react';
import CandidateRulesLoadingState from './CandidateRulesLoadingState';

const steps = [
  {
    title: 'Table Schema & Profiling',
    description: 'Reading schema',
    status: 'finish' as const,
    resultDetail: 'Schema loaded',
  },
  {
    title: 'Basic Heuristic Rules',
    description: 'Generating basic rules',
    status: 'process' as const,
  },
  {
    title: 'Statistical Profiling Rules',
    description: 'Generating statistical rules',
    status: 'wait' as const,
  },
  {
    title: 'Advanced AI / LLM Engine',
    description: 'Generating advanced rules',
    status: 'wait' as const,
  },
  {
    title: 'Deduplication & Validation',
    description: 'Validating rules',
    status: 'wait' as const,
  },
];

describe('CandidateRulesLoadingState', () => {
  it('shows only reached steps for the selected engines', () => {
    render(
      <CandidateRulesLoadingState
        currentStep={1}
        currentTableIndex={2}
        currentTableName="patients"
        enabledEngines={['BASIC']}
        steps={steps}
        targetTableFqn="service.database.schema.patients"
        totalTables={3}
      />
    );

    expect(
      screen.getByTestId('candidate-rules-generation-loading')
    ).toBeInTheDocument();
    expect(
      screen.getByText('Processing table 2/3: patients')
    ).toBeInTheDocument();
    expect(
      screen.getByText('Step 2/3: Basic Heuristic Rules')
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/Table Schema & Profiling/)
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText('Statistical Profiling Rules')
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText('Advanced AI / LLM Engine')
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText('Deduplication & Validation')
    ).not.toBeInTheDocument();
  });

  it('omits unselected engines while progressively revealing reached steps', () => {
    render(
      <CandidateRulesLoadingState
        currentStep={3}
        currentTableIndex={1}
        currentTableName="patients"
        enabledEngines={['STATISTICAL', 'ADVANCED']}
        steps={steps}
        totalTables={1}
      />
    );

    expect(
      screen.getByText('Step 3/4: Advanced AI / LLM Engine')
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/Table Schema & Profiling/)
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Basic Heuristic Rules')).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Statistical Profiling Rules/)
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText('Deduplication & Validation')
    ).not.toBeInTheDocument();
  });
});
