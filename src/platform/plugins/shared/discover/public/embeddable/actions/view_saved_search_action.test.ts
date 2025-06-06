/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { SEARCH_EMBEDDABLE_TYPE } from '@kbn/discover-utils';
import type { SavedSearch } from '@kbn/saved-search-plugin/common';
import { BehaviorSubject } from 'rxjs';

import { discoverServiceMock } from '../../__mocks__/services';
import { createStartContractMock } from '../../__mocks__/start_contract';
import type { SearchEmbeddableApi } from '../types';
import { getDiscoverLocatorParams } from '../utils/get_discover_locator_params';
import { ViewSavedSearchAction } from './view_saved_search_action';
import type { SolutionId } from '@kbn/core-chrome-browser';

const applicationMock = createStartContractMock();
const services = discoverServiceMock;

const compatibleEmbeddableApi: SearchEmbeddableApi = {
  type: SEARCH_EMBEDDABLE_TYPE,
  savedSearch$: new BehaviorSubject({
    searchSource: { getField: jest.fn() },
  } as unknown as SavedSearch),
  parentApi: {
    viewMode$: new BehaviorSubject('view'),
  },
} as unknown as SearchEmbeddableApi;

jest
  .spyOn(services.core.chrome, 'getActiveSolutionNavId$')
  .mockReturnValue(new BehaviorSubject('test' as unknown as SolutionId));

describe('view saved search action', () => {
  it('is compatible when embeddable is of type saved search, in view mode && appropriate permissions are set', async () => {
    const action = new ViewSavedSearchAction(applicationMock, services.locator);
    expect(await action.isCompatible({ embeddable: compatibleEmbeddableApi })).toBe(true);
  });

  it('is not compatible when embeddable not of type saved search', async () => {
    const action = new ViewSavedSearchAction(applicationMock, services.locator);
    expect(
      await action.isCompatible({
        embeddable: { ...compatibleEmbeddableApi, type: 'CONTACT_CARD_EMBEDDABLE' },
      })
    ).toBe(false);
  });

  it('is not visible when in edit mode', async () => {
    const action = new ViewSavedSearchAction(applicationMock, services.locator);
    expect(
      await action.isCompatible({
        embeddable: { ...compatibleEmbeddableApi, viewMode$: new BehaviorSubject('edit') },
      })
    ).toBe(false);
  });

  it('execute navigates to a saved search', async () => {
    const action = new ViewSavedSearchAction(applicationMock, services.locator);
    await new Promise((resolve) => setTimeout(resolve, 0));
    await action.execute({ embeddable: compatibleEmbeddableApi });
    expect(discoverServiceMock.locator.navigate).toHaveBeenCalledWith(
      getDiscoverLocatorParams(compatibleEmbeddableApi)
    );
  });
});
