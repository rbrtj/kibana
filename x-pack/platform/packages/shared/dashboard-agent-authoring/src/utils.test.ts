/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { DashboardOperation } from './operations';
import { hasValidCreateMetadataOperations } from './utils';

describe('hasValidCreateMetadataOperations', () => {
  const addSection: DashboardOperation = {
    operation: 'add_section',
    title: 'Overview',
    grid: { y: 0 },
  };

  it.each([
    [true, 'a non-empty title', [{ operation: 'set_metadata', title: 'Sales' }, addSection]],
    [false, 'only a blank title', [{ operation: 'set_metadata', title: '   ' }]],
    [false, 'no set_metadata', [addSection]],
    [
      false,
      'a title followed by a blank title update',
      [
        { operation: 'set_metadata', title: 'Sales' },
        { operation: 'set_metadata', title: '' },
      ],
    ],
  ] as Array<[boolean, string, DashboardOperation[]]>)(
    'returns %s for %s',
    (expected, _, operations) => {
      expect(hasValidCreateMetadataOperations(operations)).toBe(expected);
    }
  );
});
