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

import { ruleRecommenderAPI } from './ruleRecommenderAPI';

describe('ruleRecommenderAPI', () => {
  describe('generateStatisticalRules', () => {
    it('maps the current recommendations response and column field', async () => {
      const fetchMock = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          recommendations: [
            {
              id: 'stat-1',
              column: 'healthcare_expenses',
              rule_type: 'columnValueMeanToBeBetween',
              decision: 'RECOMMEND',
              parameters: {},
              reason: 'Monitor average healthcare expenses.',
              evidence: { llm_decision: 'RECOMMEND' },
              profile_metric: 'mean',
              profile_history: [
                { timestamp: 1791565200000, value: 100.5 },
                { timestamp: 1791651600000, value: 101.25 },
              ],
            },
          ],
        }),
      });
      global.fetch = fetchMock as jest.Mock;

      const rules = await ruleRecommenderAPI.generateStatisticalRules(
        'healthcare_postgres.HealthCare.public.patients'
      );

      expect(rules).toHaveLength(1);
      expect(rules[0]).toMatchObject({
        id: 'stat-1',
        table_name: 'patients',
        column_name: 'healthcare_expenses',
        target_columns: ['healthcare_expenses'],
        scope: 'column',
        engine: 'STATISTICAL',
        status: 'DRAFT',
        confidence: 0.85,
        evidence: {
          llm_decision: 'RECOMMEND',
          current_mean: 101.25,
          mean_history: [
            { timestamp: 1791565200000, value: 100.5 },
            { timestamp: 1791651600000, value: 101.25 },
          ],
        },
      });
      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:8000/api/v1/recommendations/statistical/generate',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ table_name: 'patients', use_llm: true }),
        })
      );
    });
  });

  describe('generateAdvancedRules', () => {
    it('loads table context and maps rule columns when columns are omitted', async () => {
      const fetchMock = jest
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: jest.fn().mockResolvedValue({
            table_name: 'patients',
            columns: [
              {
                name: 'birthdate',
                data_type: 'date',
                nullable: true,
                description: 'Patient birth date',
                profile: null,
              },
              {
                name: 'deathdate',
                data_type: 'date',
                nullable: true,
                description: 'Patient death date',
                profile: null,
              },
            ],
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: jest.fn().mockResolvedValue({
            rules: [
              {
                id: 'advanced-1',
                rule_type: 'TEMPORAL',
                columns: ['birthdate', 'deathdate'],
                confidence: 0.9,
                reason: 'Death date must not precede birth date.',
                sql: 'SELECT * FROM patients WHERE status = :rule_param_1',
                params: { rule_param_1: 'DECEASED' },
                conditions: [],
              },
            ],
          }),
        });
      global.fetch = fetchMock as jest.Mock;

      const rules = await ruleRecommenderAPI.generateAdvancedRules(
        'healthcare_postgres.HealthCare.public.patients'
      );

      expect(fetchMock).toHaveBeenNthCalledWith(
        1,
        'http://localhost:8000/api/v1/context/patients'
      );
      expect(fetchMock).toHaveBeenNthCalledWith(
        2,
        'http://localhost:8000/api/v1/advanced-rules/recommend',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            table_name: 'patients',
            columns: [
              {
                name: 'birthdate',
                data_type: 'date',
                nullable: true,
                description: 'Patient birth date',
              },
              {
                name: 'deathdate',
                data_type: 'date',
                nullable: true,
                description: 'Patient death date',
              },
            ],
            min_confidence: 0.6,
          }),
        })
      );
      expect(rules[0]).toMatchObject({
        id: 'advanced-1',
        table_name: 'patients',
        target_columns: ['birthdate', 'deathdate'],
        column_name: 'birthdate',
        scope: 'column',
        engine: 'ADVANCED',
        sql: 'SELECT * FROM patients WHERE status = :rule_param_1',
        sql_expression: "SELECT * FROM patients WHERE status = 'DECEASED'",
        parameters: { rule_param_1: 'DECEASED' },
      });
    });
  });
});
