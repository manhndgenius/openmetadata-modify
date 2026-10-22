/*
 *  Copyright 2026 Collate.
 *  Licensed under the Apache License, Version 2.0 (the "License");
 */

import {
  mapPublishTablesInBatches,
  PUBLISH_TABLE_BATCH_SIZE,
} from './publishTableBatches';

describe('mapPublishTablesInBatches', () => {
  it('publishes no more than three tables concurrently and preserves order', async () => {
    let active = 0;
    let maximumActive = 0;

    const results = await mapPublishTablesInBatches(
      [1, 2, 3, 4, 5, 6, 7],
      async (value) => {
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        await Promise.resolve();
        active -= 1;

        return value * 10;
      }
    );

    expect(PUBLISH_TABLE_BATCH_SIZE).toBe(3);
    expect(maximumActive).toBe(3);
    expect(results).toEqual([10, 20, 30, 40, 50, 60, 70]);
  });
});
