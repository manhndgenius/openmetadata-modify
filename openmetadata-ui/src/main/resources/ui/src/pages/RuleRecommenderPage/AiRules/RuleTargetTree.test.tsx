/*
 *  Copyright 2026 Collate.
 *  Licensed under the Apache License, Version 2.0 (the "License");
 */

import { fireEvent, render, screen } from '@testing-library/react';
import RuleTargetTree from './RuleTargetTree';

describe('RuleTargetTree', () => {
  const tables = [
    'service.health.public.encounters',
    'service.health.audit.encounters',
  ];

  it('keeps same-named tables separate by fully qualified name', () => {
    const onSelect = jest.fn();
    render(
      <RuleTargetTree
        ruleCountByTable={{ [tables[0]]: 2, [tables[1]]: 1 }}
        selectedTableFqn="ALL"
        tableFqns={tables}
        title="Generated Targets"
        onSelect={onSelect}
      />
    );

    expect(screen.getAllByText('encounters')).toHaveLength(2);

    fireEvent.click(screen.getAllByText('encounters')[1]);

    expect(onSelect).toHaveBeenCalledWith(tables[1]);
  });

  it('shows target tables even when no rules were generated', () => {
    render(
      <RuleTargetTree
        ruleCountByTable={{}}
        selectedTableFqn="ALL"
        tableFqns={[tables[0]]}
        title="Generated Targets"
        onSelect={jest.fn()}
      />
    );

    expect(screen.getByText('encounters')).toBeInTheDocument();
    expect(screen.getAllByText('0')).not.toHaveLength(0);
  });
});
