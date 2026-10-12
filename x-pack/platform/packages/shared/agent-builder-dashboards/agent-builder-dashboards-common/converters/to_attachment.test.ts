/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { LENS_EMBEDDABLE_TYPE } from '@kbn/lens-common';
import { LensConfigBuilder } from '@kbn/lens-embeddable-utils';
import { VISUALIZE_EMBEDDABLE_TYPE } from '@kbn/visualizations-common';
import { dashboardStateToAttachmentData } from './to_attachment';
import { dashboardState, grid, metricApiConfig } from './test_helpers';

describe('dashboardStateToAttachmentData', () => {
  it('keeps the top-level dashboard fields', () => {
    const state = {
      ...dashboardState([]),
      time_range: { from: 'now-7d', to: 'now' },
      refresh_interval: { pause: false, value: 30000 },
      tags: ['ops'],
      project_routing: '_alias:*',
    };

    expect(dashboardStateToAttachmentData(state)).toEqual({
      title: 'Dash',
      description: '',
      panels: [],
      time_range: { from: 'now-7d', to: 'now' },
      query: { expression: '', language: 'kql' },
      filters: [],
      options: {
        hide_panel_titles: false,
        hide_panel_borders: false,
        use_margins: true,
        auto_apply_filters: true,
        sync_colors: false,
        sync_cursor: true,
        sync_tooltips: false,
      },
      pinned_panels: [],
      refresh_interval: { pause: false, value: 30000 },
      tags: ['ops'],
      access_control: {},
      project_routing: '_alias:*',
    });
  });

  it.each([
    {
      name: 'a panel of another type without an id',
      panel: { type: 'markdown', grid, config: { content: '# Notes' } },
    },
    {
      name: 'a legacy-vis panel that is not Vega',
      panel: {
        type: VISUALIZE_EMBEDDABLE_TYPE,
        id: 'p1',
        grid,
        config: { savedVis: { type: 'markdown', params: { markdown: '# Notes' } } },
      },
    },
  ])('stores $name as it is, with an empty id when it has none', ({ panel }) => {
    expect(dashboardStateToAttachmentData(dashboardState([panel])).panels).toEqual([
      { id: '', ...panel },
    ]);
  });

  it('converts a section without an id and the Lens panels nested in it', () => {
    const state = dashboardState([
      {
        title: 'Traffic',
        collapsed: false,
        grid: { y: 10 },
        panels: [
          {
            type: LENS_EMBEDDABLE_TYPE,
            id: 'p1',
            grid,
            config: { attributes: new LensConfigBuilder().fromAPIFormat(metricApiConfig) },
          },
        ],
      },
    ]);

    expect(dashboardStateToAttachmentData(state).panels).toEqual([
      {
        id: '',
        title: 'Traffic',
        collapsed: false,
        grid: { y: 10 },
        panels: [
          {
            type: LENS_EMBEDDABLE_TYPE,
            id: 'p1',
            grid,
            config: expect.objectContaining({
              type: 'metric',
              data_source: metricApiConfig.data_source,
            }),
          },
        ],
      },
    ]);
  });
});
