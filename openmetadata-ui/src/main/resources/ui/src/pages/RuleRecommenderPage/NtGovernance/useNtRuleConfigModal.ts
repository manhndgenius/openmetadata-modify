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

import { useCallback, useRef, useState } from 'react';
import {
  NtRuleConfig,
  NtRuleConfigRule,
  NtRuleConfigSchema,
  NtRuleConfigState,
  ruleRecommenderAPI,
} from '../../../services/ruleRecommenderAPI';
import { showErrorToast, showSuccessToast } from '../../../utils/ToastUtils';

export interface UseNtRuleConfigModalReturn {
  /** Whether the modal is currently open */
  isOpen: boolean;
  /** The selected rule for configuration */
  selectedRule: NtRuleConfigRule | undefined;
  /** Whether the schema is being loaded */
  isLoading: boolean;
  /** Rule whose configuration request is currently loading */
  loadingRuleName: string | undefined;
  /** Whether a save or reset request is in progress */
  isSaving: boolean;
  /** Effective configuration loaded from PostgreSQL */
  config: NtRuleConfig | undefined;
  /** Error message if any */
  error: string | null;
  /** Open the modal for a given rule name */
  open: (ruleName: string) => Promise<void>;
  /** Close the modal */
  close: () => void;
  /** Save the configuration */
  save: (config: NtRuleConfig) => Promise<void>;
  /** Delete the persisted override and restore backend defaults */
  reset: () => Promise<void>;
}

/**
 * Hook to manage NT Rule Configuration modal state.
 * Fetches form metadata and effective config, then persists edits in PostgreSQL.
 */
export const useNtRuleConfigModal = (): UseNtRuleConfigModalReturn => {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedRule, setSelectedRule] = useState<NtRuleConfigRule | undefined>();
  const [isLoading, setIsLoading] = useState(false);
  const [loadingRuleName, setLoadingRuleName] = useState<string>();
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [schemaCache, setSchemaCache] = useState<NtRuleConfigSchema | null>(null);
  const [configState, setConfigState] = useState<NtRuleConfigState>();
  const openRequestId = useRef(0);

  const open = useCallback(async (ruleName: string) => {
    const requestId = ++openRequestId.current;

    setIsLoading(true);
    setLoadingRuleName(ruleName);
    setError(null);

    try {
      const schemaPromise = schemaCache
        ? Promise.resolve(schemaCache)
        : ruleRecommenderAPI.getNtRuleConfigSchema();
      const [schema, persistedConfig] = await Promise.all([
        schemaPromise,
        ruleRecommenderAPI.getNtRuleConfig(ruleName),
      ]);
      if (requestId !== openRequestId.current) {
        return;
      }
      if (!schemaCache) {
        setSchemaCache(schema);
      }

      const rule = schema.rules.find((item) => item.name === ruleName);
      if (!rule) {
        throw new Error(`NT rule configuration not found: ${ruleName}`);
      }

      setSelectedRule(rule);
      setConfigState(persistedConfig);
      setIsOpen(true);
    } catch (err) {
      if (requestId !== openRequestId.current) {
        return;
      }
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      showErrorToast(message);
    } finally {
      if (requestId === openRequestId.current) {
        setIsLoading(false);
        setLoadingRuleName(undefined);
      }
    }
  }, [schemaCache]);

  const close = useCallback(() => {
    openRequestId.current += 1;
    setIsOpen(false);
    setIsLoading(false);
    setLoadingRuleName(undefined);
    setSelectedRule(undefined);
    setConfigState(undefined);
    setError(null);
  }, []);

  const save = useCallback(async (config: NtRuleConfig) => {
    if (!selectedRule || !configState) {
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      await ruleRecommenderAPI.updateNtRuleConfig(
        selectedRule.name,
        config,
        configState.version,
        configState.enabled
      );
      showSuccessToast('NT rule configuration saved');
      close();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      showErrorToast(message);
    } finally {
      setIsSaving(false);
    }
  }, [selectedRule, configState, close]);

  const reset = useCallback(async () => {
    if (!selectedRule || !configState) {
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      const defaults = await ruleRecommenderAPI.deleteNtRuleConfig(
        selectedRule.name,
        configState.version
      );
      setConfigState(defaults);
      showSuccessToast('NT rule configuration reset to defaults');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      showErrorToast(message);
    } finally {
      setIsSaving(false);
    }
  }, [selectedRule, configState]);

  return {
    isOpen,
    selectedRule,
    isLoading,
    loadingRuleName,
    isSaving,
    config: configState?.config,
    error,
    open,
    close,
    save,
    reset,
  };
};
