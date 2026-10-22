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

import { act, renderHook } from '@testing-library/react-hooks';
import { ruleRecommenderAPI } from '../../../services/ruleRecommenderAPI';
import { showSuccessToast } from '../../../utils/ToastUtils';
import { useNtRuleConfigModal } from './useNtRuleConfigModal';

jest.mock('../../../utils/ToastUtils', () => ({
  showErrorToast: jest.fn(),
  showSuccessToast: jest.fn(),
}));

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

describe('useNtRuleConfigModal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('tracks loading for only the rule being opened', async () => {
    let resolveConfig: (
      value: Awaited<ReturnType<typeof ruleRecommenderAPI.getNtRuleConfig>>
    ) => void = () => undefined;
    const configPromise = new Promise<
      Awaited<ReturnType<typeof ruleRecommenderAPI.getNtRuleConfig>>
    >((resolve) => {
      resolveConfig = resolve;
    });

    jest
      .spyOn(ruleRecommenderAPI, 'getNtRuleConfigSchema')
      .mockResolvedValue({ rules: [rule], version: 1 });
    jest
      .spyOn(ruleRecommenderAPI, 'getNtRuleConfig')
      .mockReturnValue(configPromise);
    const { result } = renderHook(() => useNtRuleConfigModal());

    let openPromise: Promise<void> | undefined;
    act(() => {
      openPromise = result.current.open(rule.name);
    });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.loadingRuleName).toBe(rule.name);

    resolveConfig({
      rule_name: rule.name,
      config: rule.defaults,
      override: {},
      enabled: true,
      version: 0,
      persisted: false,
    });
    await act(async () => openPromise);

    expect(result.current.isLoading).toBe(false);
    expect(result.current.loadingRuleName).toBeUndefined();
  });

  it('loads config from the backend and saves with its version', async () => {
    const getSchema = jest
      .spyOn(ruleRecommenderAPI, 'getNtRuleConfigSchema')
      .mockResolvedValue({ rules: [rule], version: 1 });
    const getConfig = jest
      .spyOn(ruleRecommenderAPI, 'getNtRuleConfig')
      .mockResolvedValue({
        rule_name: rule.name,
        config: { nameRegex: '^saved$' },
        override: { nameRegex: '^saved$' },
        enabled: true,
        version: 4,
        persisted: true,
      });
    const updateConfig = jest
      .spyOn(ruleRecommenderAPI, 'updateNtRuleConfig')
      .mockResolvedValue({
        rule_name: rule.name,
        config: { nameRegex: '^edited$' },
        override: { nameRegex: '^edited$' },
        enabled: true,
        version: 5,
        persisted: true,
      });
    const { result } = renderHook(() => useNtRuleConfigModal());

    await act(async () => result.current.open(rule.name));

    expect(result.current.isOpen).toBe(true);
    expect(result.current.selectedRule).toEqual(rule);
    expect(result.current.config).toEqual({ nameRegex: '^saved$' });

    act(() => result.current.close());
    await act(async () => result.current.open(rule.name));

    expect(getSchema).toHaveBeenCalledTimes(1);
    expect(getConfig).toHaveBeenCalledTimes(2);

    await act(async () => result.current.save({ nameRegex: '^edited$' }));

    expect(updateConfig).toHaveBeenCalledWith(
      rule.name,
      { nameRegex: '^edited$' },
      4,
      true
    );
    expect(showSuccessToast).toHaveBeenCalled();
    expect(result.current.isOpen).toBe(false);
  });

  it('resets the persisted override and displays backend defaults', async () => {
    jest
      .spyOn(ruleRecommenderAPI, 'getNtRuleConfigSchema')
      .mockResolvedValue({ rules: [rule], version: 1 });
    jest.spyOn(ruleRecommenderAPI, 'getNtRuleConfig').mockResolvedValue({
      rule_name: rule.name,
      config: { nameRegex: '^saved$' },
      override: { nameRegex: '^saved$' },
      enabled: true,
      version: 4,
      persisted: true,
    });
    const deleteConfig = jest
      .spyOn(ruleRecommenderAPI, 'deleteNtRuleConfig')
      .mockResolvedValue({
        rule_name: rule.name,
        config: rule.defaults,
        override: {},
        enabled: true,
        version: 0,
        persisted: false,
      });
    const { result } = renderHook(() => useNtRuleConfigModal());

    await act(async () => result.current.open(rule.name));
    await act(async () => result.current.reset());

    expect(deleteConfig).toHaveBeenCalledWith(rule.name, 4);
    expect(result.current.config).toEqual(rule.defaults);
    expect(result.current.isOpen).toBe(true);
  });

  it('keeps inline configuration selected after saving', async () => {
    jest
      .spyOn(ruleRecommenderAPI, 'getNtRuleConfigSchema')
      .mockResolvedValue({ rules: [rule], version: 1 });
    jest.spyOn(ruleRecommenderAPI, 'getNtRuleConfig').mockResolvedValue({
      rule_name: rule.name,
      config: { nameRegex: '^saved$' },
      override: { nameRegex: '^saved$' },
      enabled: true,
      version: 4,
      persisted: true,
    });
    jest.spyOn(ruleRecommenderAPI, 'updateNtRuleConfig').mockResolvedValue({
      rule_name: rule.name,
      config: { nameRegex: '^inline$' },
      override: { nameRegex: '^inline$' },
      enabled: true,
      version: 5,
      persisted: true,
    });
    const { result } = renderHook(() =>
      useNtRuleConfigModal({ closeAfterSave: false })
    );

    await act(async () => result.current.open(rule.name));
    await act(async () => result.current.save({ nameRegex: '^inline$' }));

    expect(result.current.isOpen).toBe(true);
    expect(result.current.selectedRule?.name).toBe(rule.name);
    expect(result.current.config).toEqual({ nameRegex: '^inline$' });
  });
});
