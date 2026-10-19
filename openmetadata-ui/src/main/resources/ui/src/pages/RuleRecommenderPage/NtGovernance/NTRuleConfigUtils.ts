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

import { NtRuleConfig, NtRuleConfigMap } from '../../../services/ruleRecommenderAPI';

export const NT_RULE_CONFIG_STORAGE_KEY = 'openmetadata.nt-rule-configs.v1';
const STORAGE_VERSION = 1;

interface NtRuleConfigStorage {
  version: number;
  configs: NtRuleConfigMap;
}

const isConfig = (value: unknown): value is NtRuleConfig =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

const readStorage = (): NtRuleConfigStorage => {
  try {
    const raw = localStorage.getItem(NT_RULE_CONFIG_STORAGE_KEY);
    if (!raw) {
      return { version: STORAGE_VERSION, configs: {} };
    }

    const parsed = JSON.parse(raw) as Partial<NtRuleConfigStorage>;
    if (
      parsed.version !== STORAGE_VERSION ||
      !parsed.configs ||
      typeof parsed.configs !== 'object' ||
      Array.isArray(parsed.configs)
    ) {
      return { version: STORAGE_VERSION, configs: {} };
    }

    const configs = Object.entries(parsed.configs).reduce<NtRuleConfigMap>(
      (result, [name, config]) => {
        if (isConfig(config)) {
          result[name] = clone(config);
        }

        return result;
      },
      {}
    );

    return { version: STORAGE_VERSION, configs };
  } catch {
    return { version: STORAGE_VERSION, configs: {} };
  }
};

const writeStorage = (configs: NtRuleConfigMap): void => {
  try {
    localStorage.setItem(
      NT_RULE_CONFIG_STORAGE_KEY,
      JSON.stringify({ version: STORAGE_VERSION, configs })
    );
  } catch {
    // Browsers can reject localStorage in private/restricted contexts. The UI
    // remains usable with backend defaults in that case.
  }
};

export const getAllNTRuleConfigs = (): NtRuleConfigMap =>
  clone(readStorage().configs);

export const getNTRuleConfig = (
  definitionName: string,
  defaults: NtRuleConfig = {}
): NtRuleConfig => ({
  ...clone(defaults),
  ...clone(readStorage().configs[definitionName] ?? {}),
});

export const saveNTRuleConfig = (
  definitionName: string,
  config: NtRuleConfig
): void => {
  const stored = readStorage().configs;
  stored[definitionName] = clone(config);
  writeStorage(stored);
};

export const removeNTRuleConfig = (definitionName: string): void => {
  const stored = readStorage().configs;
  delete stored[definitionName];
  writeStorage(stored);
};
