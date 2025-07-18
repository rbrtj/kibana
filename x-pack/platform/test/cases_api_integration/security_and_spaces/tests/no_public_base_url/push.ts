/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import expect from '@kbn/expect';
import type { RecordingServiceNowSimulator } from '../../../../alerting_api_integration/common/lib/actions_simulations_utils';
import { ObjectRemover as ActionsRemover } from '../../../../alerting_api_integration/common/lib';
import { arraysToEqual } from '../../../common/lib/validation';
import {
  postCommentUserReq,
  postCommentAlertReq,
  postCommentAlertMultipleIdsReq,
  postCommentActionsReq,
  postCommentActionsReleaseReq,
  postExternalReferenceESReq,
  persistableStateAttachment,
} from '../../../common/lib/mock';
import type { FtrProviderContext } from '../../../common/ftr_provider_context';

import {
  pushCase,
  deleteAllCaseItems,
  bulkCreateAttachments,
  createCaseWithConnector,
  getRecordingServiceNowSimulatorServer,
} from '../../../common/lib/api';

export default ({ getService }: FtrProviderContext): void => {
  const supertest = getService('supertest');
  const es = getService('es');

  describe('push_case', () => {
    describe('incident recorder server', () => {
      const actionsRemover = new ActionsRemover(supertest);
      let serviceNowSimulatorURL: string = '';
      let serviceNowServer: RecordingServiceNowSimulator;

      beforeEach(async () => {
        const { server, url } = await getRecordingServiceNowSimulatorServer();
        serviceNowServer = server;
        serviceNowSimulatorURL = url;
      });

      afterEach(async () => {
        await deleteAllCaseItems(es);
        await actionsRemover.removeAll();
        serviceNowServer.close();
      });

      it('should push correctly without a publicBaseUrl', async () => {
        const { postedCase, connector } = await createCaseWithConnector({
          supertest,
          serviceNowSimulatorURL,
          actionsRemover,
        });

        await pushCase({
          supertest,
          caseId: postedCase.id,
          connectorId: connector.id,
        });

        expect(serviceNowServer.incident).eql({
          short_description: postedCase.title,
          description: `${postedCase.description}\n\nAdded by elastic.`,
          severity: '2',
          urgency: '2',
          impact: '2',
          category: 'software',
          subcategory: 'os',
          correlation_id: postedCase.id,
          correlation_display: 'Elastic Case',
          caller_id: 'admin',
          opened_by: 'admin',
        });
      });

      it('should format the comments correctly', async () => {
        const { postedCase, connector } = await createCaseWithConnector({
          supertest,
          serviceNowSimulatorURL,
          actionsRemover,
        });

        const patchedCase = await bulkCreateAttachments({
          supertest,
          caseId: postedCase.id,
          params: [
            postCommentUserReq,
            postCommentAlertReq,
            postCommentAlertMultipleIdsReq,
            postCommentActionsReq,
            postCommentActionsReleaseReq,
            postExternalReferenceESReq,
            persistableStateAttachment,
          ],
        });

        await pushCase({
          supertest,
          caseId: patchedCase.id,
          connectorId: connector.id,
        });

        /**
         * If the request contains the work_notes property then
         * it is a create comment request
         */
        const allCommentRequests = serviceNowServer.allRequestData.filter(
          (request): request is { work_notes: string } =>
            typeof request.work_notes === 'string' && request.work_notes.length > 0
        );

        const allWorkNotes: string[] = allCommentRequests.map((request) => request.work_notes);
        const expectedNotes = [
          'This is a cool comment\n\nAdded by elastic.',
          'Isolated host host-name with comment: comment text\n\nAdded by elastic.',
          'Released host host-name with comment: comment text\n\nAdded by elastic.',
          'Elastic Alerts attached to the case: 3',
        ];

        /**
         * For each of these comments a request is made:
         * postCommentUserReq, postCommentActionsReq, postCommentActionsReleaseReq, and a comment with the
         * total alerts attach to a case. All other type of comments should be filtered. Specifically,
         * postCommentAlertReq, postCommentAlertMultipleIdsReq, postExternalReferenceESReq, and persistableStateAttachment
         */
        expect(allCommentRequests.length).be(4);

        // since we're using a bulk create we can't guarantee the ordering so we'll check that the values exist but not
        // there specific order in the results
        expect(arraysToEqual(allWorkNotes, expectedNotes)).to.be(true);
      });
    });
  });
};
