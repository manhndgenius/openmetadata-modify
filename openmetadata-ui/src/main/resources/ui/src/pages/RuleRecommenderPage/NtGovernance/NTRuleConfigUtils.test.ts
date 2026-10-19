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

import {
  getAllNTRuleConfigs,
  getNTRuleConfig,
  NT_RULE_CONFIG_STORAGE_KEY,
  removeNTRuleConfig,
  saveNTRuleConfig,
} from './NTRuleConfigUtils';

describe('NTRuleConfigUtils', () => {
  beforeEach(() => localStorage.clear());

  it('merges saved values over backend defaults', () => {
    saveNTRuleConfig('NT1_TableNaming', { nameRegex: '^saved$' });

    expect(
      getNTRuleConfig('NT1_TableNaming', {
        enabled: true,
        nameRegex: '^default$',
      })
    ).toEqual({ enabled: true, nameRegex: '^saved$' });
  });

  it('returns defensive copies and removes one rule config', () => {
    const config = { allowedTags: ['PII.Sensitive'] };
    saveNTRuleConfig('NT2_Tagging', config);
    config.allowedTags.push('Mutated');

    const stored = getAllNTRuleConfigs();

    expect(stored).toEqual({
      NT2_Tagging: { allowedTags: ['PII.Sensitive'] },
    });

    removeNTRuleConfig('NT2_Tagging');

    expect(getAllNTRuleConfigs()).toEqual({});
  });

  it('falls back safely when localStorage contains invalid data', () => {
    localStorage.setItem(NT_RULE_CONFIG_STORAGE_KEY, '{invalid');

    expect(getNTRuleConfig('NT1_TableNaming', { enabled: true })).toEqual({
      enabled: true,
    });
  });
});
