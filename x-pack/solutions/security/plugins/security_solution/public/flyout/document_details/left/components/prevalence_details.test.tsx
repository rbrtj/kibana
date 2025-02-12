/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { render } from '@testing-library/react';
import React from 'react';
import { DocumentDetailsContext } from '../../shared/context';
import { PrevalenceDetails } from './prevalence_details';
import {
  PREVALENCE_DETAILS_TABLE_ALERT_COUNT_CELL_TEST_ID,
  PREVALENCE_DETAILS_TABLE_DOC_COUNT_CELL_TEST_ID,
  PREVALENCE_DETAILS_TABLE_FIELD_CELL_TEST_ID,
  PREVALENCE_DETAILS_TABLE_HOST_PREVALENCE_CELL_TEST_ID,
  PREVALENCE_DETAILS_TABLE_TEST_ID,
  PREVALENCE_DETAILS_UPSELL_TEST_ID,
  PREVALENCE_DETAILS_TABLE_USER_PREVALENCE_CELL_TEST_ID,
  PREVALENCE_DETAILS_TABLE_VALUE_CELL_TEST_ID,
  PREVALENCE_DETAILS_TABLE_PREVIEW_LINK_CELL_TEST_ID,
  PREVALENCE_DETAILS_TABLE_UPSELL_CELL_TEST_ID,
  PREVALENCE_DETAILS_TABLE_INVESTIGATE_IN_TIMELINE_BUTTON_TEST_ID,
} from './test_ids';
import { usePrevalence } from '../../shared/hooks/use_prevalence';
import { TestProviders } from '../../../../common/mock';
import { licenseService } from '../../../../common/hooks/use_license';
import { mockFlyoutApi } from '../../shared/mocks/mock_flyout_context';
import { useExpandableFlyoutApi } from '@kbn/expandable-flyout';
import { HostPreviewPanelKey } from '../../../entity_details/host_right';
import { HOST_PREVIEW_BANNER } from '../../right/components/host_entity_overview';
import { UserPreviewPanelKey } from '../../../entity_details/user_right';
import { USER_PREVIEW_BANNER } from '../../right/components/user_entity_overview';
import { createTelemetryServiceMock } from '../../../../common/lib/telemetry/telemetry_service.mock';
import { useUserPrivileges } from '../../../../common/components/user_privileges';

jest.mock('@kbn/expandable-flyout');
jest.mock('../../../../common/components/user_privileges');

const mockedTelemetry = createTelemetryServiceMock();
jest.mock('../../../../common/lib/kibana', () => {
  return {
    useKibana: () => ({
      services: {
        telemetry: mockedTelemetry,
      },
    }),
  };
});

jest.mock('../../shared/hooks/use_prevalence');

const mockDispatch = jest.fn();
jest.mock('react-redux', () => {
  const original = jest.requireActual('react-redux');
  return {
    ...original,
    useDispatch: () => mockDispatch,
  };
});
jest.mock('../../../../common/hooks/use_license', () => {
  const licenseServiceInstance = {
    isPlatinumPlus: jest.fn(),
  };
  return {
    licenseService: licenseServiceInstance,
    useLicense: () => {
      return licenseServiceInstance;
    },
  };
});

const NO_DATA_MESSAGE = 'No prevalence data available.';

const panelContextValue = {
  eventId: 'event id',
  indexName: 'indexName',
  browserFields: {},
  dataFormattedForFieldBrowser: [],
  scopeId: 'scopeId',
} as unknown as DocumentDetailsContext;

const UPSELL_MESSAGE = 'Host and user prevalence are only available with a';

const mockPrevelanceReturnValue = {
  loading: false,
  error: false,
  data: [
    {
      field: 'field1',
      values: ['value1'],
      alertCount: 1,
      docCount: 1,
      hostPrevalence: 0.05,
      userPrevalence: 0.1,
    },
    {
      field: 'field2',
      values: ['value2'],
      alertCount: 1,
      docCount: 1,
      hostPrevalence: 0.5,
      userPrevalence: 0.05,
    },
    {
      field: 'host.name',
      values: ['test host'],
      alertCount: 1,
      docCount: 1,
      hostPrevalence: 0.05,
      userPrevalence: 0.1,
    },
    {
      field: 'user.name',
      values: ['test user'],
      alertCount: 1,
      docCount: 1,
      hostPrevalence: 0.05,
      userPrevalence: 0.1,
    },
  ],
};

const renderPrevalenceDetails = () =>
  render(
    <TestProviders>
      <DocumentDetailsContext.Provider value={panelContextValue}>
        <PrevalenceDetails />
      </DocumentDetailsContext.Provider>
    </TestProviders>
  );

describe('PrevalenceDetails', () => {
  const licenseServiceMock = licenseService as jest.Mocked<typeof licenseService>;

  beforeEach(() => {
    jest.clearAllMocks();
    licenseServiceMock.isPlatinumPlus.mockReturnValue(true);
    jest.mocked(useExpandableFlyoutApi).mockReturnValue(mockFlyoutApi);
    (useUserPrivileges as jest.Mock).mockReturnValue({ timelinePrivileges: { read: true } });
  });

  it('should render the table with all data if license is platinum', () => {
    (usePrevalence as jest.Mock).mockReturnValue(mockPrevelanceReturnValue);
    const { getByTestId, getAllByTestId, queryByTestId, queryByText } = renderPrevalenceDetails();

    expect(getByTestId(PREVALENCE_DETAILS_TABLE_TEST_ID)).toBeInTheDocument();
    expect(getAllByTestId(PREVALENCE_DETAILS_TABLE_FIELD_CELL_TEST_ID).length).toBeGreaterThan(1);
    expect(getAllByTestId(PREVALENCE_DETAILS_TABLE_VALUE_CELL_TEST_ID).length).toBeGreaterThan(1);
    expect(
      getAllByTestId(PREVALENCE_DETAILS_TABLE_ALERT_COUNT_CELL_TEST_ID).length
    ).toBeGreaterThan(1);
    expect(getAllByTestId(PREVALENCE_DETAILS_TABLE_DOC_COUNT_CELL_TEST_ID).length).toBeGreaterThan(
      1
    );
    expect(
      getAllByTestId(PREVALENCE_DETAILS_TABLE_HOST_PREVALENCE_CELL_TEST_ID).length
    ).toBeGreaterThan(1);
    expect(
      getAllByTestId(PREVALENCE_DETAILS_TABLE_USER_PREVALENCE_CELL_TEST_ID).length
    ).toBeGreaterThan(1);
    expect(queryByTestId(PREVALENCE_DETAILS_UPSELL_TEST_ID)).not.toBeInTheDocument();
    expect(queryByText(NO_DATA_MESSAGE)).not.toBeInTheDocument();
    expect(getAllByTestId(PREVALENCE_DETAILS_TABLE_PREVIEW_LINK_CELL_TEST_ID)).toHaveLength(2);
  });

  it('should render host and user name as clickable link', () => {
    (usePrevalence as jest.Mock).mockReturnValue(mockPrevelanceReturnValue);

    const { getAllByTestId } = renderPrevalenceDetails();
    expect(getAllByTestId(PREVALENCE_DETAILS_TABLE_PREVIEW_LINK_CELL_TEST_ID)).toHaveLength(2);

    getAllByTestId(PREVALENCE_DETAILS_TABLE_PREVIEW_LINK_CELL_TEST_ID)[0].click();
    expect(mockFlyoutApi.openPreviewPanel).toHaveBeenCalledWith({
      id: HostPreviewPanelKey,
      params: {
        hostName: 'test host',
        scopeId: panelContextValue.scopeId,
        banner: HOST_PREVIEW_BANNER,
      },
    });

    getAllByTestId(PREVALENCE_DETAILS_TABLE_PREVIEW_LINK_CELL_TEST_ID)[1].click();
    expect(mockFlyoutApi.openPreviewPanel).toHaveBeenCalledWith({
      id: UserPreviewPanelKey,
      params: {
        userName: 'test user',
        scopeId: panelContextValue.scopeId,
        banner: USER_PREVIEW_BANNER,
      },
    });
  });

  it('should hide data in prevalence columns if license is not platinum', () => {
    const field1 = 'field1';

    licenseServiceMock.isPlatinumPlus.mockReturnValue(false);
    (usePrevalence as jest.Mock).mockReturnValue({
      loading: false,
      error: false,
      data: [
        {
          field: field1,
          values: ['value1'],
          alertCount: 1,
          docCount: 1,
          hostPrevalence: 0.05,
          userPrevalence: 0.1,
        },
      ],
    });

    const { getByTestId, getAllByTestId } = renderPrevalenceDetails();

    expect(getByTestId(PREVALENCE_DETAILS_TABLE_TEST_ID)).toBeInTheDocument();
    expect(getByTestId(PREVALENCE_DETAILS_UPSELL_TEST_ID)).toHaveTextContent(UPSELL_MESSAGE);
    expect(getAllByTestId(PREVALENCE_DETAILS_TABLE_UPSELL_CELL_TEST_ID).length).toEqual(2);
    expect(
      getByTestId(PREVALENCE_DETAILS_TABLE_HOST_PREVALENCE_CELL_TEST_ID)
    ).not.toHaveTextContent('5%');
    expect(
      getByTestId(PREVALENCE_DETAILS_TABLE_USER_PREVALENCE_CELL_TEST_ID)
    ).not.toHaveTextContent('10%');
  });

  it('should render formatted numbers for the alert and document count columns and be clickable buttons', () => {
    (usePrevalence as jest.Mock).mockReturnValue({
      loading: false,
      error: false,
      data: [
        {
          field: 'field1',
          values: ['value1'],
          alertCount: 1000,
          docCount: 2000000,
          hostPrevalence: 0.05,
          userPrevalence: 0.1,
        },
      ],
    });

    const { getByTestId, getAllByTestId } = render(
      <TestProviders>
        <DocumentDetailsContext.Provider value={panelContextValue}>
          <PrevalenceDetails />
        </DocumentDetailsContext.Provider>
      </TestProviders>
    );

    expect(getByTestId(PREVALENCE_DETAILS_TABLE_TEST_ID)).toBeInTheDocument();
    expect(getByTestId(PREVALENCE_DETAILS_TABLE_FIELD_CELL_TEST_ID)).toHaveTextContent('field1');
    expect(getByTestId(PREVALENCE_DETAILS_TABLE_VALUE_CELL_TEST_ID)).toHaveTextContent('value1');
    expect(getByTestId(PREVALENCE_DETAILS_TABLE_ALERT_COUNT_CELL_TEST_ID)).toHaveTextContent('1k');
    expect(getByTestId(PREVALENCE_DETAILS_TABLE_DOC_COUNT_CELL_TEST_ID)).toHaveTextContent('2M');
    expect(getByTestId(PREVALENCE_DETAILS_TABLE_HOST_PREVALENCE_CELL_TEST_ID)).toHaveTextContent(
      '5%'
    );
    expect(getByTestId(PREVALENCE_DETAILS_TABLE_USER_PREVALENCE_CELL_TEST_ID)).toHaveTextContent(
      '10%'
    );

    expect(
      getAllByTestId(PREVALENCE_DETAILS_TABLE_INVESTIGATE_IN_TIMELINE_BUTTON_TEST_ID).length
    ).toBeGreaterThan(1);
  });

  it('should render formatted numbers as text if user lacks timeline read privileges', () => {
    (useUserPrivileges as jest.Mock).mockReturnValue({ timelinePrivileges: { read: false } });
    (usePrevalence as jest.Mock).mockReturnValue({
      loading: false,
      error: false,
      data: [
        {
          field: 'field1',
          values: ['value1'],
          alertCount: 1000,
          docCount: 2000000,
          hostPrevalence: 0.05,
          userPrevalence: 0.1,
        },
      ],
    });

    const { getByTestId, queryAllByTestId } = render(
      <TestProviders>
        <DocumentDetailsContext.Provider value={panelContextValue}>
          <PrevalenceDetails />
        </DocumentDetailsContext.Provider>
      </TestProviders>
    );

    expect(getByTestId(PREVALENCE_DETAILS_TABLE_TEST_ID)).toBeInTheDocument();
    expect(getByTestId(PREVALENCE_DETAILS_TABLE_FIELD_CELL_TEST_ID)).toHaveTextContent('field1');
    expect(getByTestId(PREVALENCE_DETAILS_TABLE_VALUE_CELL_TEST_ID)).toHaveTextContent('value1');
    expect(getByTestId(PREVALENCE_DETAILS_TABLE_ALERT_COUNT_CELL_TEST_ID)).toHaveTextContent('1k');
    expect(getByTestId(PREVALENCE_DETAILS_TABLE_DOC_COUNT_CELL_TEST_ID)).toHaveTextContent('2M');
    expect(getByTestId(PREVALENCE_DETAILS_TABLE_HOST_PREVALENCE_CELL_TEST_ID)).toHaveTextContent(
      '5%'
    );
    expect(getByTestId(PREVALENCE_DETAILS_TABLE_USER_PREVALENCE_CELL_TEST_ID)).toHaveTextContent(
      '10%'
    );

    expect(
      queryAllByTestId(PREVALENCE_DETAILS_TABLE_INVESTIGATE_IN_TIMELINE_BUTTON_TEST_ID).length
    ).not.toBeGreaterThan(1);
  });

  it('should render multiple values in value column', () => {
    (usePrevalence as jest.Mock).mockReturnValue({
      loading: false,
      error: false,
      data: [
        {
          field: 'field1',
          values: ['value1', 'value2'],
          alertCount: 1000,
          docCount: 2000000,
          hostPrevalence: 0.05,
          userPrevalence: 0.1,
        },
      ],
    });

    const { getByTestId } = render(
      <TestProviders>
        <DocumentDetailsContext.Provider value={panelContextValue}>
          <PrevalenceDetails />
        </DocumentDetailsContext.Provider>
      </TestProviders>
    );

    expect(getByTestId(PREVALENCE_DETAILS_TABLE_TEST_ID)).toBeInTheDocument();
    expect(getByTestId(PREVALENCE_DETAILS_TABLE_VALUE_CELL_TEST_ID)).toHaveTextContent('value1');
    expect(getByTestId(PREVALENCE_DETAILS_TABLE_VALUE_CELL_TEST_ID)).toHaveTextContent('value2');
  });

  it('should render the table with only basic columns if license is not platinum', () => {
    const field1 = 'field1';
    const field2 = 'field2';
    (usePrevalence as jest.Mock).mockReturnValue({
      loading: false,
      error: false,
      data: [
        {
          field: field1,
          values: ['value1'],
          alertCount: 1,
          docCount: 1,
          hostPrevalence: 0.05,
          userPrevalence: 0.1,
        },
        {
          field: field2,
          values: ['value2'],
          alertCount: 1,
          docCount: 1,
          hostPrevalence: 0.5,
          userPrevalence: 0.05,
        },
      ],
    });
    licenseServiceMock.isPlatinumPlus.mockReturnValue(false);

    const { getByTestId, getAllByTestId } = renderPrevalenceDetails();

    expect(getByTestId(PREVALENCE_DETAILS_TABLE_TEST_ID)).toBeInTheDocument();
    expect(getAllByTestId(PREVALENCE_DETAILS_TABLE_FIELD_CELL_TEST_ID).length).toBeGreaterThan(1);
    expect(getAllByTestId(PREVALENCE_DETAILS_TABLE_VALUE_CELL_TEST_ID).length).toBeGreaterThan(1);
    expect(
      getAllByTestId(PREVALENCE_DETAILS_TABLE_ALERT_COUNT_CELL_TEST_ID).length
    ).toBeGreaterThan(1);
    expect(getAllByTestId(PREVALENCE_DETAILS_TABLE_DOC_COUNT_CELL_TEST_ID).length).toBeGreaterThan(
      1
    );
    expect(
      getAllByTestId(PREVALENCE_DETAILS_TABLE_HOST_PREVALENCE_CELL_TEST_ID).length
    ).toBeGreaterThan(1);
    expect(
      getAllByTestId(PREVALENCE_DETAILS_TABLE_USER_PREVALENCE_CELL_TEST_ID).length
    ).toBeGreaterThan(1);
    expect(getByTestId(PREVALENCE_DETAILS_UPSELL_TEST_ID)).toBeInTheDocument();
  });

  it('should render no data message if call errors out', () => {
    (usePrevalence as jest.Mock).mockReturnValue({
      loading: false,
      error: true,
      data: [],
    });

    const { getByText } = renderPrevalenceDetails();
    expect(getByText(NO_DATA_MESSAGE)).toBeInTheDocument();
  });

  it('should render no data message if no data', () => {
    (usePrevalence as jest.Mock).mockReturnValue({
      loading: false,
      error: false,
      data: [],
    });

    const { getByText } = renderPrevalenceDetails();
    expect(getByText(NO_DATA_MESSAGE)).toBeInTheDocument();
  });
});
