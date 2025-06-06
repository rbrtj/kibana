/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useMemo } from 'react';
import { useEnableExperimental } from '../../../../../common/hooks/use_experimental_features';
import { useBrowserFields } from '../../../../../data_view_manager/hooks/use_browser_fields';
import { SourcererScopeName } from '../../../../../sourcerer/store/model';
import { useSourcererDataView } from '../../../../../sourcerer/containers';
import { requiredFieldsForActions } from '../../../../../detections/components/alerts_table/default_config';
import { defaultUdtHeaders } from '../../body/column_headers/default_headers';
import type { ColumnHeaderOptions } from '../../../../../../common/types';
import { memoizedGetTimelineColumnHeaders } from './utils';

export const useTimelineColumns = (columns: ColumnHeaderOptions[]) => {
  const { newDataViewPickerEnabled } = useEnableExperimental();
  const { browserFields: oldBrowserFields } = useSourcererDataView(SourcererScopeName.timeline);
  const experimentalBrowserFields = useBrowserFields(SourcererScopeName.timeline);

  const browserFields = newDataViewPickerEnabled ? experimentalBrowserFields : oldBrowserFields;

  const localColumns = useMemo(() => columns ?? defaultUdtHeaders, [columns]);

  const augmentedColumnHeaders = memoizedGetTimelineColumnHeaders(
    localColumns,
    browserFields,
    false
  );

  const timelineQueryFieldsFromColumns = useMemo(() => {
    const columnFields = augmentedColumnHeaders.map((c) => c.id);

    return [...columnFields, ...requiredFieldsForActions];
  }, [augmentedColumnHeaders]);

  return useMemo(
    () => ({
      defaultColumns: defaultUdtHeaders,
      localColumns,
      augmentedColumnHeaders,
      timelineQueryFieldsFromColumns,
    }),
    [augmentedColumnHeaders, timelineQueryFieldsFromColumns, localColumns]
  );
};
