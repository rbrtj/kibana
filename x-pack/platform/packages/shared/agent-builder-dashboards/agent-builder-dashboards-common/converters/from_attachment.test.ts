/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { LENS_EMBEDDABLE_TYPE } from '@kbn/lens-common';
import { attachmentDataToDashboardState } from './from_attachment';
import { grid, metricApiConfig } from './test_helpers';

const defaultOptions = {
  hide_panel_titles: false,
  hide_panel_borders: false,
  use_margins: true,
  auto_apply_filters: true,
  sync_colors: false,
  sync_cursor: true,
  sync_tooltips: false,
};

describe('attachmentDataToDashboardState', () => {
  it('fills every missing dashboard field with its default', () => {
    expect(attachmentDataToDashboardState({ title: 'Dash', panels: [] })).toEqual({
      title: 'Dash',
      description: '',
      panels: [],
      time_range: { from: 'now-24h', to: 'now' },
      query: { expression: '', language: 'kql' },
      filters: [],
      options: defaultOptions,
      pinned_panels: [],
      refresh_interval: { pause: true, value: 0 },
      tags: [],
      access_control: {},
    });
  });

  it('merges partial options over the default options', () => {
    const { options } = attachmentDataToDashboardState({
      title: 'Dash',
      panels: [],
      options: { use_margins: false, sync_colors: true },
    });

    expect(options).toEqual({ ...defaultOptions, use_margins: false, sync_colors: true });
  });

  it('uses the provided time range, query, filters, pinned panels and access control', () => {
    const { time_range, query, filters, pinned_panels, access_control } =
      attachmentDataToDashboardState({
        title: 'Dash',
        panels: [],
        time_range: { from: 'now-7d', to: 'now' },
        query: { expression: 'host.name: "web-1"', language: 'kql' },
        filters: [{ meta: { key: 'service.name' } }],
        pinned_panels: [{ type: 'options_list_control', id: 'control-1' }],
        access_control: { access_mode: 'write_restricted' },
      });

    expect({ time_range, query, filters, pinned_panels, access_control }).toEqual({
      time_range: { from: 'now-7d', to: 'now' },
      query: { expression: 'host.name: "web-1"', language: 'kql' },
      filters: [{ meta: { key: 'service.name' } }],
      pinned_panels: [{ type: 'options_list_control', id: 'control-1' }],
      access_control: { access_mode: 'write_restricted' },
    });
  });

  it('passes a panel of another type through unchanged', () => {
    const markdownPanel = { type: 'markdown', id: 'p1', grid, config: { content: '# Notes' } };

    const { panels } = attachmentDataToDashboardState({ title: 'Dash', panels: [markdownPanel] });

    expect(panels).toEqual([markdownPanel]);
  });

  it('converts a section and the panels nested in it', () => {
    const { panels } = attachmentDataToDashboardState({
      title: 'Dash',
      panels: [
        {
          id: 'section-1',
          title: 'Traffic',
          collapsed: true,
          grid: { y: 10 },
          panels: [{ type: LENS_EMBEDDABLE_TYPE, id: 'p1', grid, config: metricApiConfig }],
        },
      ],
    });

    expect(panels).toEqual([
      {
        id: 'section-1',
        title: 'Traffic',
        collapsed: true,
        grid: { y: 10 },
        panels: [
          {
            type: LENS_EMBEDDABLE_TYPE,
            id: 'p1',
            grid,
            config: {
              ...metricApiConfig,
              attributes: expect.objectContaining({ visualizationType: 'lnsMetric' }),
            },
          },
        ],
      },
    ]);
  });
});
