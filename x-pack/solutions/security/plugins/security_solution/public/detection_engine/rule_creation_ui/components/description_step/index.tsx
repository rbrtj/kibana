/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { EuiDescriptionList, EuiFlexGroup, EuiFlexItem } from '@elastic/eui';
import { chunk, get, isEmpty, isNumber, pick } from 'lodash/fp';
import React, { memo, useState } from 'react';
import styled from 'styled-components';
import type { ThreatMapping, Threats, Type } from '@kbn/securitysolution-io-ts-alerting-types';
import type { DataViewBase, Filter } from '@kbn/es-query';
import { FilterStateStore } from '@kbn/es-query';
import { FilterManager } from '@kbn/data-plugin/public';
import type {
  RelatedIntegrationArray,
  RequiredFieldArray,
} from '../../../../../common/api/detection_engine/model/rule_schema';
import { buildRelatedIntegrationsDescription } from '../../../common/components/related_integrations/integrations_description';
import { DEFAULT_TIMELINE_TITLE } from '../../../../timelines/components/timeline/translations';
import type { EqlOptions } from '../../../../../common/search_strategy';
import { useKibana } from '../../../../common/lib/kibana';
import type { AboutStepRiskScore, AboutStepSeverity, Duration } from '../../../common/types';
import type { FieldValueTimeline } from '../../../rule_creation/components/pick_timeline';
import type { FormSchema } from '../../../../shared_imports';
import type { ListItems } from './types';
import {
  buildAlertSuppressionDescription,
  buildAlertSuppressionMissingFieldsDescription,
  buildAlertSuppressionWindowDescription,
  buildEqlOptionsDescription,
  buildHighlightedFieldsOverrideDescription,
  buildIntervalDescription,
  buildNoteDescription,
  buildQueryBarDescription,
  buildRequiredFieldsDescription,
  buildRiskScoreDescription,
  buildRuleTypeDescription,
  buildSetupDescription,
  buildSeverityDescription,
  buildStringArrayDescription,
  buildThreatDescription,
  buildThreatMappingDescription,
  buildThresholdDescription,
  buildUnorderedListArrayDescription,
  buildUrlsDescription,
  getQueryLabel,
} from './helpers';
import * as i18n from './translations';
import { buildMlJobsDescription } from './build_ml_jobs_description';
import { buildActionsDescription } from './actions_description';
import { buildThrottleDescription } from './throttle_description';
import { filterEmptyThreats } from '../../pages/rule_creation/helpers';
import { useLicense } from '../../../../common/hooks/use_license';
import type { LicenseService } from '../../../../../common/license';
import {
  isSuppressionRuleConfiguredWithDuration,
  isSuppressionRuleConfiguredWithGroupBy,
  isSuppressionRuleConfiguredWithMissingFields,
  isThresholdRule,
} from '../../../../../common/detection_engine/utils';
import {
  ALERT_SUPPRESSION_DURATION_FIELD_NAME,
  ALERT_SUPPRESSION_DURATION_TYPE_FIELD_NAME,
  ALERT_SUPPRESSION_FIELDS_FIELD_NAME,
  ALERT_SUPPRESSION_MISSING_FIELDS_FIELD_NAME,
} from '../../../rule_creation/components/alert_suppression_edit';
import { THRESHOLD_ALERT_SUPPRESSION_ENABLED } from '../../../rule_creation/components/threshold_alert_suppression_edit';
import { THRESHOLD_VALUE_LABEL } from '../../../rule_creation/components/threshold_edit/translations';
import { NEW_TERMS_FIELDS_LABEL } from '../../../rule_creation/components/new_terms_fields_edit/translations';
import { HISTORY_WINDOW_START_LABEL } from '../../../rule_creation/components/history_window_start_edit/translations';
import { MACHINE_LEARNING_JOB_ID_LABEL } from '../../../rule_creation/components/machine_learning_job_id_edit/translations';
import { ANOMALY_THRESHOLD_LABEL } from '../../../rule_creation/components/anomaly_threshold_edit/translations';
import { THREAT_MATCH_MAPPING_FIELD_LABEL } from '../../../rule_creation/components/threat_match_mapping_edit/translations';
import { THREAT_MATCH_QUERY_FIELD_LABEL } from '../../../rule_creation/components/threat_match_query_edit/translations';
import { THREAT_MATCH_INDEX_FIELD_LABEL } from '../../../rule_creation/components/threat_match_index_edit/translations';
import { THREAT_MATCH_INDICATOR_PATH_FIELD_LABEL } from '../../../rule_creation/components/threat_match_indicator_path_edit/translations';
import type { FieldValueQueryBar } from '../query_bar_field';

const DescriptionListContainer = styled(EuiDescriptionList)`
  max-width: 600px;

  .euiDescriptionList__description {
    overflow-wrap: anywhere;
  }
`;

const DESCRIPTION_LIST_COLUMN_WIDTHS: [string, string] = ['50%', '50%'];

interface StepRuleDescriptionProps<T> {
  columns?: 'multi' | 'single' | 'singleSplit';
  data: unknown;
  indexPatterns?: DataViewBase;
  // @ts-expect-error upgrade typescript v4.9.5
  schema: FormSchema<T>;
}

export const StepRuleDescriptionComponent = <T,>({
  data,
  columns = 'multi',
  indexPatterns,
  schema,
}: StepRuleDescriptionProps<T>) => {
  const kibana = useKibana();
  const license = useLicense();
  const [filterManager] = useState<FilterManager>(new FilterManager(kibana.services.uiSettings));

  const keys = Object.keys(schema);
  const listItems = keys.reduce((acc: ListItems[], key: string) => {
    if (key === 'machineLearningJobId') {
      return [
        ...acc,
        buildMlJobsDescription(get(key, data) as string[], MACHINE_LEARNING_JOB_ID_LABEL),
      ];
    }

    if (key === 'throttle') {
      return [...acc, buildThrottleDescription(get(key, data), get([key, 'label'], schema))];
    }

    if (key === 'actions') {
      return [...acc, buildActionsDescription(get(key, data), get([key, 'label'], schema))];
    }

    return [
      ...acc,
      ...buildListItems(data, pick(key, schema), filterManager, license, indexPatterns),
    ];
  }, []);

  if (columns === 'multi') {
    return (
      <EuiFlexGroup>
        {chunk(Math.ceil(listItems.length / 2), listItems).map((chunkListItems, index) => (
          <EuiFlexItem
            data-test-subj="listItemColumnStepRuleDescription"
            key={`description-step-rule-${index}`}
          >
            <EuiDescriptionList listItems={chunkListItems} />
          </EuiFlexItem>
        ))}
      </EuiFlexGroup>
    );
  }

  return (
    <EuiFlexGroup>
      <EuiFlexItem data-test-subj="listItemColumnStepRuleDescription">
        {columns === 'single' ? (
          <EuiDescriptionList listItems={listItems} />
        ) : (
          <DescriptionListContainer
            data-test-subj="singleSplitStepRuleDescriptionList"
            type="column"
            columnWidths={DESCRIPTION_LIST_COLUMN_WIDTHS}
            rowGutterSize="m"
            listItems={listItems}
          />
        )}
      </EuiFlexItem>
    </EuiFlexGroup>
  );
};

export const StepRuleDescription = memo(StepRuleDescriptionComponent);

export const buildListItems = <T,>(
  data: unknown,
  // @ts-expect-error upgrade typescript v4.9.5
  schema: FormSchema<T>,
  filterManager: FilterManager,
  license: LicenseService,
  indexPatterns?: DataViewBase
): ListItems[] =>
  Object.keys(schema).reduce<ListItems[]>(
    (acc, field) => [
      ...acc,
      ...getDescriptionItem(
        field,
        get([field, 'label'], schema),
        data,
        filterManager,
        license,
        indexPatterns
      ),
    ],
    []
  );

export const addFilterStateIfNotThere = (filters: Filter[]): Filter[] => {
  return filters.map((filter) => {
    if (filter.$state == null) {
      return { $state: { store: FilterStateStore.APP_STATE }, ...filter };
    } else {
      return filter;
    }
  });
};

/* eslint complexity: ["error", 25]*/
// eslint-disable-next-line complexity
export const getDescriptionItem = (
  field: string,
  label: string,
  data: unknown,
  filterManager: FilterManager,
  license: LicenseService,
  indexPatterns?: DataViewBase
): ListItems[] => {
  if (field === 'queryBar') {
    const queryBar = get('queryBar', data) as FieldValueQueryBar;
    const filters = addFilterStateIfNotThere(queryBar.filters ?? []);
    const query = queryBar.query.query as string;
    const savedId = queryBar.saved_id ?? '';
    const savedQueryName = queryBar.title;
    const ruleType: Type = get('ruleType', data) as Type;
    const queryLabel = getQueryLabel(ruleType);
    return buildQueryBarDescription({
      field,
      filters,
      filterManager,
      query,
      queryLabel,
      savedId,
      savedQueryName,
      indexPatterns,
    });
  } else if (field === 'responseActions') {
    return [];
  } else if (field === ALERT_SUPPRESSION_FIELDS_FIELD_NAME) {
    const ruleType: Type = get('ruleType', data);

    const ruleCanHaveGroupByFields = isSuppressionRuleConfiguredWithGroupBy(ruleType);
    if (!ruleCanHaveGroupByFields) {
      return [];
    }
    const values: string[] = get(field, data);
    return buildAlertSuppressionDescription(label, values, ruleType);
  } else if (field === ALERT_SUPPRESSION_DURATION_TYPE_FIELD_NAME) {
    return [];
  } else if (field === ALERT_SUPPRESSION_DURATION_FIELD_NAME) {
    const ruleType: Type = get('ruleType', data);

    const ruleCanHaveDuration = isSuppressionRuleConfiguredWithDuration(ruleType);
    if (!ruleCanHaveDuration) {
      return [];
    }

    // threshold rule has suppression duration without grouping fields, but suppression should be explicitly enabled by user
    // query rule have suppression duration only if group by fields selected
    const showDuration = isThresholdRule(ruleType)
      ? get(THRESHOLD_ALERT_SUPPRESSION_ENABLED, data) === true
      : get(ALERT_SUPPRESSION_FIELDS_FIELD_NAME, data).length > 0;

    if (showDuration) {
      const value: Duration = get(field, data);
      return buildAlertSuppressionWindowDescription(
        label,
        value,
        get(ALERT_SUPPRESSION_DURATION_TYPE_FIELD_NAME, data),
        ruleType
      );
    } else {
      return [];
    }
  } else if (field === ALERT_SUPPRESSION_MISSING_FIELDS_FIELD_NAME) {
    const ruleType: Type = get('ruleType', data);
    const ruleCanHaveSuppressionMissingFields =
      isSuppressionRuleConfiguredWithMissingFields(ruleType);

    if (!ruleCanHaveSuppressionMissingFields) {
      return [];
    }
    if (get(ALERT_SUPPRESSION_FIELDS_FIELD_NAME, data).length > 0) {
      const value = get(field, data);
      return buildAlertSuppressionMissingFieldsDescription(label, value, ruleType);
    } else {
      return [];
    }
  } else if (field === 'eqlOptions') {
    const eqlOptions: EqlOptions = get(field, data);
    return buildEqlOptionsDescription(eqlOptions);
  } else if (field === 'threat') {
    const threats: Threats = get(field, data);
    return buildThreatDescription({ label, threat: filterEmptyThreats(threats) });
  } else if (field === 'threshold') {
    const threshold = get(field, data);
    return buildThresholdDescription(THRESHOLD_VALUE_LABEL, threshold);
  } else if (field === 'references') {
    const urls: string[] = get(field, data);
    return buildUrlsDescription(label, urls);
  } else if (field === 'falsePositives') {
    const values: string[] = get(field, data);
    return buildUnorderedListArrayDescription(label, field, values);
  } else if (field === 'investigationFields') {
    const values: string[] = get(field, data);
    return buildHighlightedFieldsOverrideDescription(label, values);
  } else if (field === 'riskScore') {
    const values: AboutStepRiskScore = get(field, data);
    return buildRiskScoreDescription(values);
  } else if (field === 'severity') {
    const values: AboutStepSeverity = get(field, data);
    return buildSeverityDescription(values);
  } else if (field === 'requiredFields') {
    const requiredFields: RequiredFieldArray = get(field, data);
    return buildRequiredFieldsDescription(label, requiredFields);
  } else if (field === 'relatedIntegrations') {
    const relatedIntegrations: RelatedIntegrationArray = get(field, data);
    return buildRelatedIntegrationsDescription(label, relatedIntegrations);
  } else if (field === 'timeline') {
    const timeline = get(field, data) as FieldValueTimeline;
    return [
      {
        title: label,
        description: timeline.title ?? DEFAULT_TIMELINE_TITLE,
      },
    ];
  } else if (field === 'note') {
    const val: string = get(field, data);
    return buildNoteDescription(label, val);
  } else if (field === 'setup') {
    const val: string = get(field, data);
    return buildSetupDescription(label, val);
  } else if (field === 'ruleType') {
    const ruleType: Type = get(field, data);
    return buildRuleTypeDescription(label, ruleType);
  } else if (field === 'kibanaSiemAppUrl') {
    return [];
  } else if (field === 'threatIndex') {
    const values: string[] = get(field, data);
    return buildStringArrayDescription(THREAT_MATCH_INDEX_FIELD_LABEL, field, values);
  } else if (field === 'threatQueryBar') {
    const threatQueryBar = get('threatQueryBar', data) as FieldValueQueryBar;

    return buildQueryBarDescription({
      field,
      filters: addFilterStateIfNotThere(threatQueryBar.filters ?? []),
      filterManager,
      query: threatQueryBar.query.query as string,
      queryLanguage: threatQueryBar.query.language,
      savedId: threatQueryBar.saved_id ?? '',
      indexPatterns,
      queryLabel: THREAT_MATCH_QUERY_FIELD_LABEL,
    });
  } else if (field === 'threatMapping') {
    const threatMap: ThreatMapping = get(field, data);
    return buildThreatMappingDescription(THREAT_MATCH_MAPPING_FIELD_LABEL, threatMap);
  } else if (field === 'threatIndicatorPath') {
    return [
      {
        title: THREAT_MATCH_INDICATOR_PATH_FIELD_LABEL,
        description: get(field, data),
      },
    ];
  } else if (field === 'newTermsFields') {
    const values: string[] = get(field, data);
    return buildStringArrayDescription(NEW_TERMS_FIELDS_LABEL, field, values);
  } else if (Array.isArray(get(field, data)) && field !== 'threatMapping') {
    const values: string[] = get(field, data);
    return buildStringArrayDescription(label, field, values);
  } else if (field === 'index') {
    if (get('dataViewId', data)) {
      return [];
    }
  } else if (field === 'isBuildingBlock') {
    return get('isBuildingBlock', data)
      ? [{ title: i18n.BUILDING_BLOCK_LABEL, description: i18n.BUILDING_BLOCK_DESCRIPTION }]
      : [];
  } else if (['interval', 'from'].includes(field)) {
    return buildIntervalDescription(label, get(field, data));
  } else if (field === 'maxSignals') {
    const value: number | undefined = get(field, data);
    return value ? [{ title: label, description: value }] : [];
  } else if (field === 'anomalyThreshold') {
    const value: number | undefined = get(field, data);
    return value ? [{ title: ANOMALY_THRESHOLD_LABEL, description: value }] : [];
  } else if (field === 'historyWindowSize') {
    const value: number = get(field, data);
    return value ? [{ title: HISTORY_WINDOW_START_LABEL, description: value }] : [];
  }

  const description: string = get(field, data);
  if (isNumber(description) || !isEmpty(description)) {
    return [
      {
        title: label,
        description,
      },
    ];
  }
  return [];
};
