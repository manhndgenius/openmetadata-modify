/*
 *  Copyright 2026 Collate.
 *  Licensed under the Apache License, Version 2.0 (the "License");
 */

export const PUBLISH_TABLE_BATCH_SIZE = 3;

/**
 * Publish at most three tables at once. A new batch starts only after every
 * table in the current batch has completed.
 */
export const mapPublishTablesInBatches = async <T, R>(
  items: T[],
  publish: (item: T) => Promise<R>
): Promise<R[]> => {
  const results: R[] = [];

  for (let index = 0; index < items.length; index += PUBLISH_TABLE_BATCH_SIZE) {
    const batch = items.slice(index, index + PUBLISH_TABLE_BATCH_SIZE);
    const batchResults = await Promise.all(batch.map(publish));
    results.push(...batchResults);
  }

  return results;
};
