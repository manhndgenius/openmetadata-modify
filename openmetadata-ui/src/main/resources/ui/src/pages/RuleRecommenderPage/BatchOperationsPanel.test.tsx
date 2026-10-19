/*
 *  Copyright 2026 Collate.
 *  Licensed under the Apache License, Version 2.0 (the "License");
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ruleRecommenderAPI } from '../../services/ruleRecommenderAPI';
import BatchOperationsPanel from './BatchOperationsPanel';

jest.mock('../../services/ruleRecommenderAPI', () => {
  const actual = jest.requireActual('../../services/ruleRecommenderAPI');

  return {
    ...actual,
    ruleRecommenderAPI: {
      ...actual.ruleRecommenderAPI,
      getCatalogServices: jest.fn(),
      previewGenerationJob: jest.fn(),
      previewNtApplicationJob: jest.fn(),
    },
  };
});

describe('BatchOperationsPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (ruleRecommenderAPI.getCatalogServices as jest.Mock).mockResolvedValue([]);
  });

  it('uses one scope builder for BASIC generation and NT application', async () => {
    render(<BatchOperationsPanel />);

    expect(screen.getByTestId('batch-target-scope')).toBeInTheDocument();
    expect(
      screen.getByText('Preview & Generate BASIC Rules')
    ).toBeInTheDocument();
    expect(
      screen.getByText('Preview & Apply NT Governance')
    ).toBeInTheDocument();
    expect(screen.queryByText('Advanced')).not.toBeInTheDocument();
    expect(screen.queryByText('Statistical')).not.toBeInTheDocument();

    await waitFor(() =>
      expect(ruleRecommenderAPI.getCatalogServices).toHaveBeenCalledTimes(1)
    );
  });

  it('does not interpret an empty table selection as all tables', async () => {
    render(<BatchOperationsPanel />);

    fireEvent.click(screen.getByTestId('preview-basic-job'));

    await waitFor(() =>
      expect(
        ruleRecommenderAPI.previewGenerationJob
      ).not.toHaveBeenCalled()
    );
  });
});
