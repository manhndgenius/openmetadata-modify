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
  describe('server-side batch contracts', () => {
    it('previews BASIC generation with the canonical TABLES scope', async () => {
      const fetchMock = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          scope: {
            type: 'TABLES',
            table_fqns: ['svc.db.schema.orders'],
          },
          total_tables: 1,
          tables: ['svc.db.schema.orders'],
          total_items: 1,
          estimated_llm_calls: { BASIC: 0 },
        }),
      });
      global.fetch = fetchMock as jest.Mock;

      await ruleRecommenderAPI.previewGenerationJob({
        scope: {
          type: 'TABLES',
          table_fqns: ['svc.db.schema.orders'],
        },
        engines: ['BASIC'],
      });

      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:8000/api/v1/recommendation-jobs/preview',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            scope: {
              type: 'TABLES',
              table_fqns: ['svc.db.schema.orders'],
            },
            engines: ['BASIC'],
          }),
        })
      );
    });

    it('starts an NT application job from a multi-schema scope', async () => {
      const fetchMock = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          job_id: 'nt-job-1',
          status: 'PENDING',
        }),
      });
      global.fetch = fetchMock as jest.Mock;
      const scope = {
        type: 'SCHEMAS' as const,
        schema_fqns: ['svc.db.public', 'svc.db.analytics'],
      };

      await ruleRecommenderAPI.startNtApplicationJob(scope);

      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:8000/api/v1/nt-application-jobs',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ scope }),
        })
      );
    });
  });

  describe('startNtRun', () => {
    it('starts an NT run with the table and ingestion pipeline identifiers', async () => {
      const fetchMock = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          run_id: 'nt-run-1',
          table_fqn: 'svc.db.schema.encounters',
          pipeline_id: 'pipeline-1',
          status: 'PENDING',
        }),
      });
      global.fetch = fetchMock as jest.Mock;

      const result = await ruleRecommenderAPI.startNtRun(
        'svc.db.schema.encounters',
        'pipeline-1'
      );

      expect(result.run_id).toBe('nt-run-1');
      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:8000/api/v1/nt-runs',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            table_fqn: 'svc.db.schema.encounters',
            pipeline_id: 'pipeline-1',
          }),
        })
      );
    });
  });

  describe('getNtRuleConfigSchema', () => {
    it('loads the dynamic NT rule form catalog', async () => {
      const schema = { version: 1, rules: [] };
      const fetchMock = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue(schema),
      });
      global.fetch = fetchMock as jest.Mock;

      await expect(ruleRecommenderAPI.getNtRuleConfigSchema()).resolves.toEqual(
        schema
      );
      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:8000/api/v1/nt-rules/config-schema'
      );
    });
  });

  describe('NT rule config persistence', () => {
    const persisted = {
      rule_name: 'NT1_TableNaming',
      config: { nameRegex: '^saved$' },
      override: { nameRegex: '^saved$' },
      enabled: true,
      version: 2,
      persisted: true,
    };

    it('loads and updates a rule config with its expected version', async () => {
      const fetchMock = jest
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: jest.fn().mockResolvedValue(persisted),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: jest.fn().mockResolvedValue({ ...persisted, version: 3 }),
        });
      global.fetch = fetchMock as jest.Mock;

      await ruleRecommenderAPI.getNtRuleConfig('NT1_TableNaming');
      await ruleRecommenderAPI.updateNtRuleConfig(
        'NT1_TableNaming',
        { nameRegex: '^edited$' },
        2
      );

      expect(fetchMock).toHaveBeenNthCalledWith(
        1,
        'http://localhost:8000/api/v1/nt-rules/NT1_TableNaming/config'
      );
      expect(fetchMock).toHaveBeenNthCalledWith(
        2,
        'http://localhost:8000/api/v1/nt-rules/NT1_TableNaming/config',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({
            config: { nameRegex: '^edited$' },
            enabled: true,
            expected_version: 2,
          }),
        })
      );
    });

    it('resets a persisted override with optimistic locking', async () => {
      const fetchMock = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          ...persisted,
          persisted: false,
          version: 0,
        }),
      });
      global.fetch = fetchMock as jest.Mock;

      await ruleRecommenderAPI.deleteNtRuleConfig('NT1_TableNaming', 2);

      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:8000/api/v1/nt-rules/NT1_TableNaming/config?expected_version=2',
        { method: 'DELETE' }
      );
    });
  });

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
          body: JSON.stringify({
            table_name: 'patients',
            table_fqn: 'healthcare_postgres.HealthCare.public.patients',
            use_llm: true,
          }),
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
        'http://localhost:8000/api/v1/context/healthcare_postgres.HealthCare.public.patients'
      );
      expect(fetchMock).toHaveBeenNthCalledWith(
        2,
        'http://localhost:8000/api/v1/advanced-rules/recommend',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            table_name: 'patients',
            table_fqn: 'healthcare_postgres.HealthCare.public.patients',
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
