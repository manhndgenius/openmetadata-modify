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
      getGenerationJob: jest.fn(),
      getGenerationJobResults: jest.fn(),
      getNtApplicationJob: jest.fn(),
      getNtApplicationJobResults: jest.fn(),
      previewGenerationJob: jest.fn(),
      previewNtApplicationJob: jest.fn(),
    },
  };
});

describe('BatchOperationsPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.localStorage.clear();
    (ruleRecommenderAPI.getCatalogServices as jest.Mock).mockResolvedValue([]);
  });

  it('uses one scope builder for rule generation and NT application', async () => {
    render(<BatchOperationsPanel />);

    expect(screen.getByTestId('batch-target-scope')).toBeInTheDocument();
    expect(
      screen.getByText('Preview & Generate Rules')
    ).toBeInTheDocument();
    expect(
      screen.getByText('Preview & Apply NT Governance')
    ).toBeInTheDocument();
    expect(screen.getByText('Advanced')).toBeInTheDocument();
    expect(screen.queryByText('Statistical')).not.toBeInTheDocument();

    await waitFor(() =>
      expect(ruleRecommenderAPI.getCatalogServices).toHaveBeenCalledTimes(1)
    );
  });

  it('does not interpret an empty table selection as all tables', async () => {
    render(<BatchOperationsPanel />);

    fireEvent.click(screen.getByTestId('preview-basic-job'));

    await waitFor(() =>
      expect(ruleRecommenderAPI.previewGenerationJob).not.toHaveBeenCalled()
    );
  });

  it('renders an AI-only collapsed generator without NT actions', async () => {
    render(<BatchOperationsPanel aiOnly />);

    expect(screen.getByText('Generate Data Quality Rules')).toBeInTheDocument();
    expect(screen.getByText('Configure targets')).toBeInTheDocument();
    expect(
      screen.queryByText('Preview & Apply NT Governance')
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/Select target scope/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Configure targets'));

    expect(screen.getByText(/Select target scope/i)).toBeInTheDocument();
    expect(screen.getByText('Basic Rules')).toBeInTheDocument();
    expect(screen.getByText('Advanced Rules')).toBeInTheDocument();
    expect(
      screen.getAllByRole('button', { name: /Generate.*Results/i })
    ).toHaveLength(1);
    expect(screen.getByText('Basic + Advanced')).toBeInTheDocument();
    expect(screen.queryByText('Coming soon')).not.toBeInTheDocument();
    expect(screen.queryByText('Statistical')).not.toBeInTheDocument();

    const advancedRadio = screen.getByRole('radio', {
      name: /Advanced Rules/i,
    });

    fireEvent.click(advancedRadio);

    expect(advancedRadio).toBeChecked();
    expect(
      screen.getByRole('button', { name: /Generate & View Results/i })
    ).toBeDisabled();

    await waitFor(() =>
      expect(ruleRecommenderAPI.getCatalogServices).toHaveBeenCalledTimes(1)
    );
  });

  it('reuses the target configuration for NT Governance only', async () => {
    render(<BatchOperationsPanel ntOnly />);

    expect(screen.getByText('Apply NT Governance Rules')).toBeInTheDocument();
    expect(screen.getByText(/Select target scope/i)).toBeInTheDocument();
    expect(screen.getByText('15 NT Definitions')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Preview & Apply NT Governance/i })
    ).toBeDisabled();
    expect(
      screen.queryByText('Preview & Generate Rules')
    ).not.toBeInTheDocument();

    await waitFor(() =>
      expect(ruleRecommenderAPI.getCatalogServices).toHaveBeenCalledTimes(1)
    );
  });

  it('restores and continues polling the last generation job', async () => {
    window.localStorage.setItem(
      'dq:last-generation-job-id',
      'generation-job-1'
    );
    (ruleRecommenderAPI.getGenerationJob as jest.Mock).mockResolvedValue({
      job_id: 'generation-job-1',
      scope: { type: 'TABLES', table_fqns: ['svc.db.schema.table'] },
      engines: ['BASIC', 'ADVANCED'],
      status: 'RUNNING',
      total_tables: 1,
      total_items: 2,
      processed_items: 1,
      successful_items: 1,
      partial_items: 0,
      failed_items: 0,
      skipped_items: 0,
      generated_rules: { BASIC: 5, ADVANCED: 0 },
      llm_calls: { BASIC: 0, ADVANCED: 0 },
      created_at: '2026-10-21T00:00:00Z',
    });
    (ruleRecommenderAPI.getGenerationJobResults as jest.Mock).mockResolvedValue(
      {
        job_id: 'generation-job-1',
        page: 1,
        page_size: 200,
        total: 0,
        total_pages: 0,
        items: [],
      }
    );

    render(<BatchOperationsPanel aiOnly />);

    expect(
      await screen.findByText('Rule generation job generation-job-1')
    ).toBeInTheDocument();
    expect(screen.getByText('BASIC')).toBeInTheDocument();
    expect(screen.getByText('ADVANCED')).toBeInTheDocument();
    expect(
      screen.getByLabelText('Rule generation is running')
    ).toBeInTheDocument();
    expect(ruleRecommenderAPI.getNtApplicationJob).not.toHaveBeenCalled();
  });
});
