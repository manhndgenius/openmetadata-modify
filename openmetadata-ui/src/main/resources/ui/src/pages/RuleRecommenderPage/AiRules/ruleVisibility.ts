import { CandidateRule } from '../../../services/ruleRecommenderAPI';

const SAVED_RULE_STATUSES = new Set<CandidateRule['status']>([
  'DRAFT',
  'ACCEPTED',
  'REJECTED',
]);

export const isSavedRuleVisible = (rule: CandidateRule) =>
  SAVED_RULE_STATUSES.has(rule.status);
