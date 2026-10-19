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

import { LoadingOutlined } from '@ant-design/icons';
import { Spin, Typography } from 'antd';
import type { RuleEngine } from '../../services/ruleRecommenderAPI';

const { Text, Title } = Typography;

export interface CandidateGenerationStep {
  title: string;
  description: string;
  status: 'wait' | 'process' | 'finish' | 'error';
  resultDetail?: string;
}

interface CandidateRulesLoadingStateProps {
  currentStep: number;
  currentTableIndex: number;
  currentTableName?: string;
  enabledEngines: RuleEngine[];
  steps: CandidateGenerationStep[];
  targetTableFqn?: string;
  totalTables: number;
}

const CandidateRulesLoadingState = ({
  currentStep,
  currentTableIndex,
  currentTableName,
  enabledEngines,
  steps,
  targetTableFqn,
  totalTables,
}: CandidateRulesLoadingStateProps) => {
  const tableName = currentTableName || targetTableFqn || 'selected table';
  const isBulkGeneration = totalTables > 1;
  const engineByStepIndex: Partial<Record<number, RuleEngine>> = {
    1: 'BASIC',
    2: 'STATISTICAL',
    3: 'ADVANCED',
  };
  const enabledSteps = steps
    .map((step, index) => ({ index, step }))
    .filter(({ index }) => {
      const engine = engineByStepIndex[index];

      return !engine || enabledEngines.includes(engine);
    });
  const activeStep =
    [...enabledSteps].reverse().find(({ index }) => index <= currentStep) ??
    enabledSteps[0];
  const activeStepNumber = Math.max(
    1,
    enabledSteps.findIndex(({ index }) => index === activeStep?.index) + 1
  );

  return (
    <div
      aria-live="polite"
      className="candidate-rules-loading-state"
      data-testid="candidate-rules-generation-loading"
      role="status"
    >
      <Spin indicator={<LoadingOutlined spin />} size="large" />

      <div
        className="candidate-rules-loading-state__heading"
        key={activeStep?.index}
      >
        <Text className="candidate-rules-loading-state__table" type="secondary">
          {isBulkGeneration
            ? `Processing table ${currentTableIndex}/${totalTables}: ${tableName}`
            : `Analyzing ${tableName}`}
        </Text>
        <Title level={4}>
          Step {activeStepNumber}/{enabledSteps.length}:{' '}
          {activeStep?.step.title}
        </Title>
        <Text className="candidate-rules-loading-state__description">
          {activeStep?.step.description}
        </Text>
        {activeStep?.step.resultDetail && (
          <Text strong className="candidate-rules-loading-state__result">
            {activeStep.step.resultDetail}
          </Text>
        )}
      </div>
    </div>
  );
};

export default CandidateRulesLoadingState;
