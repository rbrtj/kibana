/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { LENS_EMBEDDABLE_TYPE } from '@kbn/lens-common';
import { LensConfigBuilder, type LensAttributes } from '@kbn/lens-embeddable-utils';
import { attachmentDataToDashboardState } from './from_attachment';
import { dashboardStateToAttachmentData } from './to_attachment';
import { dashboardState, grid, metricApiConfig } from './test_helpers';

const buildLensAttributes = (): LensAttributes =>
  new LensConfigBuilder().fromAPIFormat({
    ...metricApiConfig,
    title: 'Attributes title',
    description: 'Attributes description',
  });

const panelSettings = {
  title: 'Panel title edited',
  description: 'Panel description edited',
  hide_title: true,
  hide_border: true,
  drilldowns: [{ id: 'd1' }],
};

describe('Lens dashboard panel conversion — panel-level settings', () => {
  it('to_attachment preserves panel-level settings over attributes title/description', () => {
    const state = dashboardState([
      {
        type: LENS_EMBEDDABLE_TYPE,
        id: 'p1',
        grid,
        config: { ...panelSettings, attributes: buildLensAttributes() },
      },
    ]);

    const { panels } = dashboardStateToAttachmentData(state);

    expect(panels).toEqual([
      {
        type: LENS_EMBEDDABLE_TYPE,
        id: 'p1',
        grid,
        config: expect.objectContaining({ ...panelSettings, type: 'metric' }),
      },
    ]);
    expect(panels[0]).not.toHaveProperty('config.attributes');
  });

  it('to_attachment falls back to attributes title/description when panel-level ones are absent', () => {
    const state = dashboardState([
      { type: LENS_EMBEDDABLE_TYPE, id: 'p1', grid, config: { attributes: buildLensAttributes() } },
    ]);

    const { panels } = dashboardStateToAttachmentData(state);

    expect(panels).toEqual([
      {
        type: LENS_EMBEDDABLE_TYPE,
        id: 'p1',
        grid,
        config: expect.objectContaining({
          title: 'Attributes title',
          description: 'Attributes description',
          type: 'metric',
        }),
      },
    ]);
  });

  it('to_attachment keeps Lens attributes unchanged when they cannot be converted to API format', () => {
    const brokenAttributes = {
      title: 'Broken',
      visualizationType: 'lnsMetric',
      references: [],
      state: {},
    };
    const state = dashboardState([
      { type: LENS_EMBEDDABLE_TYPE, id: 'p1', grid, config: { attributes: brokenAttributes } },
    ]);

    expect(dashboardStateToAttachmentData(state).panels).toEqual([
      { type: LENS_EMBEDDABLE_TYPE, id: 'p1', grid, config: { attributes: brokenAttributes } },
    ]);
  });

  it('from_attachment passes a Lens panel that is not in API format through unchanged', () => {
    const attachmentPanel = {
      type: LENS_EMBEDDABLE_TYPE,
      id: 'p1',
      grid,
      config: { title: 'Saved chart', attributes: buildLensAttributes() },
    };

    const state = attachmentDataToDashboardState({ title: 'Dash', panels: [attachmentPanel] });

    expect(state.panels).toEqual([attachmentPanel]);
  });

  it('round-trips panel-level settings through dashboard state', () => {
    const attachmentPanel = {
      type: LENS_EMBEDDABLE_TYPE,
      id: 'p1',
      grid,
      config: { ...metricApiConfig, ...panelSettings },
    };

    const state = attachmentDataToDashboardState({ title: 'Dash', panels: [attachmentPanel] });

    expect(state.panels).toEqual([
      {
        type: LENS_EMBEDDABLE_TYPE,
        id: 'p1',
        grid,
        config: expect.objectContaining({
          ...panelSettings,
          attributes: expect.objectContaining({ visualizationType: 'lnsMetric' }),
        }),
      },
    ]);
    expect(dashboardStateToAttachmentData(state).panels).toEqual([
      {
        type: LENS_EMBEDDABLE_TYPE,
        id: 'p1',
        grid,
        config: expect.objectContaining({ ...panelSettings, type: 'metric' }),
      },
    ]);
  });
});
