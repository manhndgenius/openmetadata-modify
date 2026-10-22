import { CandidateRule } from '../../../services/ruleRecommenderAPI';
import { isSavedRuleVisible } from './ruleVisibility';

const ruleWithStatus = (status: CandidateRule['status']): CandidateRule => ({
  confidence: 1,
  id: `rule-${status}`,
  reason: 'test',
  rule_type: 'columnValuesToBeNotNull',
  scope: 'column',
  status,
  table_name: 'encounters',
});

describe('isSavedRuleVisible', () => {
  it.each([
    ['DRAFT', true],
    ['REJECTED', true],
    ['PENDING', false],
    ['ACCEPTED', true],
    ['EDITED', false],
    ['APPLIED', false],
  ] as Array<[CandidateRule['status'], boolean]>)(
    '%s => %s',
    (status, expected) => {
      expect(isSavedRuleVisible(ruleWithStatus(status))).toBe(expected);
    }
  );
});
