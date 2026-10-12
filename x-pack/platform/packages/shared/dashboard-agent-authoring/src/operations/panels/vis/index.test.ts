/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { vegaEditPanelRequestSchema, vegaPanelRequestSchema } from '.';

describe('visualization panel request schemas', () => {
  it('allows a Vega panel without a chartType hint', () => {
    expect(
      vegaPanelRequestSchema.safeParse({
        source: 'request',
        query: 'show total requests',
        grid: { x: 0, y: 0, w: 12, h: 5 },
        renderer: 'vega',
      }).success
    ).toBe(true);
  });

  it('strips applyChartRules from a Vega edit', () => {
    const result = vegaEditPanelRequestSchema.safeParse({
      source: 'request',
      renderer: 'vega',
      panelId: 'panel-1',
      query: 'use a clearer title',
      applyChartRules: true,
    });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      source: 'request',
      renderer: 'vega',
      panelId: 'panel-1',
      query: 'use a clearer title',
    });
  });
});
