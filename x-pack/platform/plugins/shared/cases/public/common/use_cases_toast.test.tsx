/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useKibana, useToasts } from './lib/kibana';
import { TestProviders, renderWithTestingProviders } from './mock';
import { CaseToastSuccessContent, useCasesToast } from './use_cases_toast';
import { alertComment, basicComment, mockCase } from '../containers/mock';
import React from 'react';
import userEvent from '@testing-library/user-event';
import type { SupportedCaseAttachment } from '../types';
import { screen, renderHook, getByTestId, queryByTestId } from '@testing-library/react';
import { OWNER_INFO } from '../../common/constants';
import { useApplication } from './lib/kibana/use_application';

jest.mock('./lib/kibana');
jest.mock('./lib/kibana/use_application');

const useToastsMock = useToasts as jest.Mock;
const useKibanaMock = useKibana as jest.Mocked<typeof useKibana>;
const useApplicationMock = useApplication as jest.Mock;

describe('Use cases toast hook', () => {
  const successMock = jest.fn();
  const errorMock = jest.fn();
  const dangerMock = jest.fn();
  const getUrlForApp = jest.fn().mockReturnValue(`/app/cases/${mockCase.id}`);
  const navigateToUrl = jest.fn();

  function validateTitle(title: string) {
    const mockParams = successMock.mock.calls[0][0];
    const el = document.createElement('div');
    mockParams.title(el);
    expect(el).toHaveTextContent(title);
  }

  function validateContent(content: string) {
    const mockParams = successMock.mock.calls[0][0];
    const el = document.createElement('div');
    mockParams.text(el);
    expect(el).toHaveTextContent(content);
  }

  async function navigateToCase() {
    const mockParams = successMock.mock.calls[0][0];
    const el = document.createElement('div');
    mockParams.text(el);
    // eslint-disable-next-line testing-library/prefer-screen-queries
    const button = getByTestId(el, 'toaster-content-case-view-link');
    await userEvent.click(button);
  }

  useToastsMock.mockImplementation(() => {
    return {
      addSuccess: successMock,
      addError: errorMock,
      addDanger: dangerMock,
    };
  });

  beforeEach(() => {
    jest.clearAllMocks();
    useKibanaMock().services.application = {
      ...useKibanaMock().services.application,
      getUrlForApp,
      navigateToUrl,
    };

    useApplicationMock.mockReturnValue({ appId: 'testAppId' });
  });

  describe('showSuccessAttach', () => {
    describe('Toast hook', () => {
      it('should create a success toast when invoked with a case', () => {
        const { result } = renderHook(
          () => {
            return useCasesToast();
          },
          { wrapper: TestProviders }
        );
        result.current.showSuccessAttach({
          theCase: mockCase,
        });
        expect(successMock).toHaveBeenCalled();
      });
    });

    describe('toast title', () => {
      it('should create a success toast when invoked with a case and a custom title', () => {
        const { result } = renderHook(
          () => {
            return useCasesToast();
          },
          { wrapper: TestProviders }
        );
        result.current.showSuccessAttach({ theCase: mockCase, title: 'Custom title' });
        validateTitle('Custom title');
      });

      it('should display the alert sync title when called with an alert attachment (1 alert)', () => {
        const { result } = renderHook(
          () => {
            return useCasesToast();
          },
          { wrapper: TestProviders }
        );
        result.current.showSuccessAttach({
          theCase: mockCase,
          attachments: [alertComment as SupportedCaseAttachment],
        });
        validateTitle('An alert was added to "Another horrible breach!!');
      });

      it('should display the alert sync title when called with an alert attachment (multiple alerts)', () => {
        const { result } = renderHook(
          () => {
            return useCasesToast();
          },
          { wrapper: TestProviders }
        );
        const alert = {
          ...alertComment,
          alertId: ['1234', '54321'],
        } as SupportedCaseAttachment;

        result.current.showSuccessAttach({
          theCase: mockCase,
          attachments: [alert],
        });
        validateTitle('Alerts were added to "Another horrible breach!!');
      });

      it('should display a generic title when called with a non-alert attachament', () => {
        const { result } = renderHook(
          () => {
            return useCasesToast();
          },
          { wrapper: TestProviders }
        );
        result.current.showSuccessAttach({
          theCase: mockCase,
          attachments: [basicComment as SupportedCaseAttachment],
        });
        validateTitle('Case Another horrible breach!! updated');
      });
    });

    describe('Toast content', () => {
      const onViewCaseClick = jest.fn();

      beforeEach(() => {
        onViewCaseClick.mockReset();
      });

      it('should create a success toast when invoked with a case and a custom content', () => {
        const { result } = renderHook(
          () => {
            return useCasesToast();
          },
          { wrapper: TestProviders }
        );
        result.current.showSuccessAttach({ theCase: mockCase, content: 'Custom content' });
        validateContent('Custom content');
      });

      it('renders an alert-specific content when called with an alert attachment and sync on', () => {
        const { result } = renderHook(
          () => {
            return useCasesToast();
          },
          { wrapper: TestProviders }
        );
        result.current.showSuccessAttach({
          theCase: mockCase,
          attachments: [alertComment as SupportedCaseAttachment],
        });
        validateContent('The alert statuses are synched with the case status.');
      });

      it('renders empty content when called with an alert attachment and sync off', () => {
        const { result } = renderHook(
          () => {
            return useCasesToast();
          },
          { wrapper: TestProviders }
        );
        result.current.showSuccessAttach({
          theCase: { ...mockCase, settings: { ...mockCase.settings, syncAlerts: false } },
          attachments: [alertComment as SupportedCaseAttachment],
        });
        validateContent('View case');
      });

      it('renders a correct successful message content', () => {
        renderWithTestingProviders(
          <CaseToastSuccessContent content={'my content'} onViewCaseClick={onViewCaseClick} />
        );
        expect(screen.getByTestId('toaster-content-sync-text')).toHaveTextContent('my content');
        expect(screen.getByTestId('toaster-content-case-view-link')).toHaveTextContent('View case');
        expect(onViewCaseClick).not.toHaveBeenCalled();
      });

      it('renders a correct successful message without content', () => {
        renderWithTestingProviders(<CaseToastSuccessContent onViewCaseClick={onViewCaseClick} />);
        expect(screen.queryByTestId('toaster-content-sync-text')).toBeFalsy();
        expect(screen.getByTestId('toaster-content-case-view-link')).toHaveTextContent('View case');
        expect(onViewCaseClick).not.toHaveBeenCalled();
      });

      it('Calls the onViewCaseClick when clicked', async () => {
        renderWithTestingProviders(<CaseToastSuccessContent onViewCaseClick={onViewCaseClick} />);

        await userEvent.click(screen.getByTestId('toaster-content-case-view-link'));
        expect(onViewCaseClick).toHaveBeenCalled();
      });

      it('hides the view case link when onViewCaseClick is not defined', () => {
        <CaseToastSuccessContent />;

        expect(screen.queryByTestId('toaster-content-case-view-link')).not.toBeInTheDocument();
      });
    });

    describe('Toast navigation', () => {
      const tests = Object.entries(OWNER_INFO).map(([owner, ownerInfo]) => [
        owner,
        ownerInfo.appId,
      ]);

      it.each(tests)(
        'should navigate correctly with owner %s and appId %s',
        async (owner, appId) => {
          const { result } = renderHook(
            () => {
              return useCasesToast();
            },
            { wrapper: TestProviders }
          );

          result.current.showSuccessAttach({
            theCase: { ...mockCase, owner },
            title: 'Custom title',
          });

          await navigateToCase();

          expect(getUrlForApp).toHaveBeenCalledWith(appId, {
            deepLinkId: 'cases',
            path: '/mock-id',
          });

          expect(navigateToUrl).toHaveBeenCalledWith('/app/cases/mock-id');
        }
      );

      it('navigates to the current app if the owner is invalid', async () => {
        const { result } = renderHook(
          () => {
            return useCasesToast();
          },
          { wrapper: TestProviders }
        );

        result.current.showSuccessAttach({
          theCase: { ...mockCase, owner: 'in-valid' },
          title: 'Custom title',
        });

        await navigateToCase();

        expect(getUrlForApp).toHaveBeenCalledWith('testAppId', {
          deepLinkId: 'cases',
          path: '/mock-id',
        });
      });

      it('does not navigates to a case if the appId is not defined', () => {
        useApplicationMock.mockReturnValue({ appId: undefined });

        const { result } = renderHook(
          () => {
            return useCasesToast();
          },
          { wrapper: TestProviders }
        );

        result.current.showSuccessAttach({
          theCase: { ...mockCase, owner: 'in-valid' },
          title: 'Custom title',
        });

        const mockParams = successMock.mock.calls[0][0];
        const el = document.createElement('div');
        mockParams.text(el);
        // eslint-disable-next-line testing-library/prefer-screen-queries
        const button = queryByTestId(el, 'toaster-content-case-view-link');

        expect(button).toBeNull();
        expect(getUrlForApp).not.toHaveBeenCalled();
        expect(navigateToUrl).not.toHaveBeenCalled();
      });
    });
  });

  describe('showErrorToast', () => {
    it('should show an error toast', () => {
      const error = new Error('showErrorToast: an error occurred');

      const { result } = renderHook(
        () => {
          return useCasesToast();
        },
        { wrapper: TestProviders }
      );

      result.current.showErrorToast(error);

      expect(errorMock).toHaveBeenCalledWith(error, { title: error.message });
    });

    it('should override the title', () => {
      const error = new Error('showErrorToast: an error occurred');

      const { result } = renderHook(
        () => {
          return useCasesToast();
        },
        { wrapper: TestProviders }
      );

      result.current.showErrorToast(error, { title: 'my title' });

      expect(errorMock).toHaveBeenCalledWith(error, { title: 'my title' });
    });

    it('should not show an error toast if the error is AbortError', () => {
      const error = new Error('showErrorToast: an error occurred');
      error.name = 'AbortError';

      const { result } = renderHook(
        () => {
          return useCasesToast();
        },
        { wrapper: TestProviders }
      );

      result.current.showErrorToast(error);

      expect(errorMock).not.toHaveBeenCalled();
    });

    it('should show the body message if it is a ServerError', () => {
      const error = new Error('showErrorToast: an error occurred');
      // @ts-expect-error: need to create a ServerError
      error.body = { message: 'message error' };

      const { result } = renderHook(
        () => {
          return useCasesToast();
        },
        { wrapper: TestProviders }
      );

      result.current.showErrorToast(error);

      expect(errorMock).toHaveBeenCalledWith(new Error('message error'), {
        title: 'message error',
      });
    });
  });

  describe('showSuccessToast', () => {
    it('should show a success toast', () => {
      const { result } = renderHook(
        () => {
          return useCasesToast();
        },
        { wrapper: TestProviders }
      );

      result.current.showSuccessToast('my title');

      expect(successMock).toHaveBeenCalledWith({
        className: 'eui-textBreakWord',
        title: 'my title',
      });
    });
  });

  describe('showDangerToast', () => {
    it('should show a danger toast', () => {
      const { result } = renderHook(
        () => {
          return useCasesToast();
        },
        { wrapper: TestProviders }
      );

      result.current.showDangerToast('my danger toast');

      expect(dangerMock).toHaveBeenCalledWith({
        className: 'eui-textBreakWord',
        title: 'my danger toast',
      });
    });
  });
});
