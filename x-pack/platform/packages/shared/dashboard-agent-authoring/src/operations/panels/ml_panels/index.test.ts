/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { buildConfigPanelContent } from '..';
import {
  anomalyChartsPanelConfigSchema,
  anomalySwimlaneConfigSchema,
  editAnomalyChartsPanelConfigInputSchema,
  editAnomalySwimlaneConfigInputSchema,
  editSingleMetricViewerConfigInputSchema,
  singleMetricViewerConfigSchema,
} from '.';

describe('ml_anomaly_charts registry entry', () => {
  it.each([
    [
      'maps a numeric severity_threshold to an open-ended floor',
      { job_ids: ['job-1'], severity_threshold: 30 },
      { job_ids: ['job-1'], severity_threshold: [{ min: 30 }] },
    ],
    [
      'passes through an embeddable severity_threshold range array',
      { job_ids: ['job-1'], severity_threshold: [{ min: 50 }] },
      { job_ids: ['job-1'], severity_threshold: [{ min: 50 }] },
    ],
    [
      'omits severity_threshold when it is not provided',
      { job_ids: ['job-1'] },
      { job_ids: ['job-1'] },
    ],
    [
      'preserves title in the embeddable config',
      { job_ids: ['job-1'], title: 'Anomaly charts of job-1' },
      { job_ids: ['job-1'], title: 'Anomaly charts of job-1' },
    ],
  ])('%s', (_, config, expectedConfig) => {
    expect(buildConfigPanelContent('ml_anomaly_charts', config)).toEqual({
      type: 'ml_anomaly_charts',
      config: expectedConfig,
    });
  });
});

describe('anomalyChartsPanelConfigSchema', () => {
  it('rejects an empty job_ids array', () => {
    expect(anomalyChartsPanelConfigSchema.safeParse({ job_ids: [] }).success).toBe(false);
  });

  it.each([
    ['50', true, 50],
    ['a range array', true, [{ min: 50 }]],
    ['101', false, 101],
    ['-1', false, -1],
    ['six ranges', false, Array.from({ length: 6 }, (_, index) => ({ min: index * 10 }))],
  ])('parses a severity_threshold of %s as valid: %s', (_, valid, severityThreshold) => {
    expect(
      anomalyChartsPanelConfigSchema.safeParse({
        job_ids: ['job-1'],
        severity_threshold: severityThreshold,
      }).success
    ).toBe(valid);
  });
});

describe('anomalySwimlaneConfigSchema', () => {
  it('accepts a viewBy swim lane and rejects an unknown swimlane_type', () => {
    const viewBy = {
      job_ids: ['job-1'],
      swimlane_type: 'viewBy',
      view_by: 'host.name',
      severity_threshold: 50,
    };

    expect(anomalySwimlaneConfigSchema.parse(viewBy)).toEqual(viewBy);
    expect(
      anomalySwimlaneConfigSchema.safeParse({ ...viewBy, swimlane_type: 'byHost' }).success
    ).toBe(false);
  });
});

describe('singleMetricViewerConfigSchema', () => {
  it.each([
    [0, true],
    [-1, false],
  ])('parses a selected_detector_index of %s as valid: %s', (selectedDetectorIndex, valid) => {
    expect(
      singleMetricViewerConfigSchema.safeParse({
        job_ids: ['job-1'],
        selected_detector_index: selectedDetectorIndex,
      }).success
    ).toBe(valid);
  });
});

describe('ML edit_panels input schemas', () => {
  it.each([
    [
      'an anomaly charts edit',
      true,
      editAnomalyChartsPanelConfigInputSchema,
      {
        type: 'ml_anomaly_charts',
        panelId: 'charts-1',
        config: { job_ids: ['job-1'], severity_threshold: 50, title: 'Updated charts' },
      },
    ],
    [
      'a swim lane edit',
      true,
      editAnomalySwimlaneConfigInputSchema,
      {
        type: 'ml_anomaly_swimlane',
        panelId: 'swim-1',
        config: {
          job_ids: ['job-1'],
          swimlane_type: 'viewBy',
          view_by: 'host.name',
          severity_threshold: 75,
        },
      },
    ],
    [
      'a single metric viewer edit',
      true,
      editSingleMetricViewerConfigInputSchema,
      {
        type: 'ml_single_metric_viewer',
        panelId: 'smv-1',
        config: { job_ids: ['job-1'], selected_entities: { 'host.name': 'web-01' } },
      },
    ],
    [
      'an anomaly charts edit missing panelId',
      false,
      editAnomalyChartsPanelConfigInputSchema,
      { type: 'ml_anomaly_charts', config: { job_ids: ['job-1'] } },
    ],
  ])('parses %s as valid: %s', (_, valid, schema, input) => {
    expect(schema.safeParse({ source: 'config', ...input }).success).toBe(valid);
  });
});
