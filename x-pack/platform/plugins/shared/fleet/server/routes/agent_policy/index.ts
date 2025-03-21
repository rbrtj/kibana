/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import { schema } from '@kbn/config-schema';

import type { FleetAuthzRouter } from '../../services/security';

import { API_VERSIONS } from '../../../common/constants';
import { FLEET_API_PRIVILEGES } from '../../constants/api_privileges';
import { AGENT_POLICY_API_ROUTES } from '../../constants';
import { type FleetConfigType } from '../../config';
import {
  GetAgentPoliciesRequestSchema,
  GetOneAgentPolicyRequestSchema,
  CreateAgentPolicyRequestSchema,
  UpdateAgentPolicyRequestSchema,
  CopyAgentPolicyRequestSchema,
  DeleteAgentPolicyRequestSchema,
  GetFullAgentPolicyRequestSchema,
  GetK8sManifestRequestSchema,
  BulkGetAgentPoliciesRequestSchema,
  AgentPolicyResponseSchema,
  BulkGetAgentPoliciesResponseSchema,
  GetAgentPolicyResponseSchema,
  DeleteAgentPolicyResponseSchema,
  GetFullAgentPolicyResponseSchema,
  DownloadFullAgentPolicyResponseSchema,
  GetK8sManifestResponseScheme,
  GetAgentPolicyOutputsRequestSchema,
  GetAgentPolicyOutputsResponseSchema,
  GetListAgentPolicyOutputsResponseSchema,
  GetListAgentPolicyOutputsRequestSchema,
  GetAutoUpgradeAgentsStatusRequestSchema,
  GetAutoUpgradeAgentsStatusResponseSchema,
  CreateAgentAndPackagePolicyRequestSchema,
} from '../../types';

import { K8S_API_ROUTES } from '../../../common/constants';
import { parseExperimentalConfigValue } from '../../../common/experimental_features';

import { genericErrorResponse } from '../schema/errors';
import { ListResponseSchema } from '../schema/utils';

import {
  getAgentPoliciesHandler,
  getOneAgentPolicyHandler,
  createAgentPolicyHandler,
  updateAgentPolicyHandler,
  copyAgentPolicyHandler,
  deleteAgentPoliciesHandler,
  getFullAgentPolicy,
  downloadFullAgentPolicy,
  downloadK8sManifest,
  getK8sManifest,
  bulkGetAgentPoliciesHandler,
  GetAgentPolicyOutputsHandler,
  GetListAgentPolicyOutputsHandler,
  getAutoUpgradeAgentsStatusHandler,
  createAgentAndPackagePoliciesHandler,
} from './handlers';

export const registerRoutes = (router: FleetAuthzRouter, config: FleetConfigType) => {
  // List - Fleet Server needs access to run setup
  router.versioned
    .get({
      path: AGENT_POLICY_API_ROUTES.LIST_PATTERN,
      security: {
        authz: {
          requiredPrivileges: [
            {
              anyRequired: [
                FLEET_API_PRIVILEGES.AGENT_POLICIES.READ,
                FLEET_API_PRIVILEGES.AGENTS.READ,
                FLEET_API_PRIVILEGES.SETUP,
              ],
            },
          ],
        },
      },
      summary: `Get agent policies`,
      options: {
        tags: ['oas-tag:Elastic Agent policies'],
      },
    })
    .addVersion(
      {
        version: API_VERSIONS.public.v1,
        validate: {
          request: GetAgentPoliciesRequestSchema,
          response: {
            200: {
              body: () => ListResponseSchema(AgentPolicyResponseSchema),
            },
            400: {
              body: genericErrorResponse,
            },
          },
        },
      },
      getAgentPoliciesHandler
    );

  // Bulk GET
  router.versioned
    .post({
      path: AGENT_POLICY_API_ROUTES.BULK_GET_PATTERN,
      security: {
        authz: {
          requiredPrivileges: [
            {
              anyRequired: [
                FLEET_API_PRIVILEGES.AGENT_POLICIES.READ,
                FLEET_API_PRIVILEGES.AGENTS.READ,
                FLEET_API_PRIVILEGES.SETUP,
              ],
            },
          ],
        },
      },
      summary: `Bulk get agent policies`,
      options: {
        tags: ['oas-tag:Elastic Agent policies'],
      },
    })
    .addVersion(
      {
        version: API_VERSIONS.public.v1,
        validate: {
          request: BulkGetAgentPoliciesRequestSchema,
          response: {
            200: {
              body: () => BulkGetAgentPoliciesResponseSchema,
            },
            400: {
              body: genericErrorResponse,
            },
          },
        },
      },
      bulkGetAgentPoliciesHandler
    );

  // Get one
  router.versioned
    .get({
      path: AGENT_POLICY_API_ROUTES.INFO_PATTERN,
      security: {
        authz: {
          requiredPrivileges: [
            {
              anyRequired: [
                FLEET_API_PRIVILEGES.AGENT_POLICIES.READ,
                FLEET_API_PRIVILEGES.AGENTS.READ,
                FLEET_API_PRIVILEGES.SETUP,
              ],
            },
          ],
        },
      },
      summary: `Get an agent policy`,
      description: `Get an agent policy by ID.`,
      options: {
        tags: ['oas-tag:Elastic Agent policies'],
      },
    })
    .addVersion(
      {
        version: API_VERSIONS.public.v1,
        validate: {
          request: GetOneAgentPolicyRequestSchema,
          response: {
            200: {
              body: () => GetAgentPolicyResponseSchema,
            },
            400: {
              body: genericErrorResponse,
            },
          },
        },
      },
      getOneAgentPolicyHandler
    );

  const experimentalFeatures = parseExperimentalConfigValue(config.enableExperimental);
  if (experimentalFeatures.enableAutomaticAgentUpgrades) {
    router.versioned
      .get({
        path: AGENT_POLICY_API_ROUTES.AUTO_UPGRADE_AGENTS_STATUS_PATTERN,
        security: {
          authz: {
            requiredPrivileges: [FLEET_API_PRIVILEGES.AGENTS.READ],
          },
        },
        summary: `Get auto upgrade agent status`,
        description: `Get auto upgrade agent status`,
        options: {
          tags: ['oas-tag:Elastic Agent policies'],
        },
      })
      .addVersion(
        {
          version: API_VERSIONS.public.v1,
          validate: {
            request: GetAutoUpgradeAgentsStatusRequestSchema,
            response: {
              200: {
                body: () => GetAutoUpgradeAgentsStatusResponseSchema,
              },
              400: {
                body: genericErrorResponse,
              },
            },
          },
        },
        getAutoUpgradeAgentsStatusHandler
      );
  }

  // Create
  router.versioned
    .post({
      path: AGENT_POLICY_API_ROUTES.CREATE_PATTERN,
      security: {
        authz: {
          requiredPrivileges: [FLEET_API_PRIVILEGES.AGENT_POLICIES.ALL],
        },
      },
      summary: `Create an agent policy`,
      options: {
        tags: ['oas-tag:Elastic Agent policies'],
      },
    })
    .addVersion(
      {
        version: API_VERSIONS.public.v1,
        validate: {
          request: CreateAgentPolicyRequestSchema,
          response: {
            200: {
              body: () => GetAgentPolicyResponseSchema,
            },
            400: {
              body: genericErrorResponse,
            },
          },
        },
      },
      createAgentPolicyHandler
    );

  // Create agent + package policies in a single request
  // Used for agentless integrations
  router.versioned
    .post({
      path: AGENT_POLICY_API_ROUTES.CREATE_WITH_PACKAGE_POLICIES,
      security: {
        authz: {
          requiredPrivileges: [FLEET_API_PRIVILEGES.AGENT_POLICIES.ALL],
        },
      },
      summary: `Create an agent policy and its package policies in one request`,
      options: {
        tags: ['oas-tag:Elastic Agent policies'],
      },
    })
    .addVersion(
      {
        version: API_VERSIONS.public.v1,
        validate: {
          request: CreateAgentAndPackagePolicyRequestSchema,
          response: {
            200: {
              body: () => GetAgentPolicyResponseSchema,
            },
            400: {
              body: genericErrorResponse,
            },
          },
        },
      },
      createAgentAndPackagePoliciesHandler
    );

  // Update
  router.versioned
    .put({
      path: AGENT_POLICY_API_ROUTES.UPDATE_PATTERN,
      security: {
        authz: {
          requiredPrivileges: [FLEET_API_PRIVILEGES.AGENT_POLICIES.ALL],
        },
      },
      summary: `Update an agent policy`,
      description: `Update an agent policy by ID.`,
      options: {
        tags: ['oas-tag:Elastic Agent policies'],
      },
    })
    .addVersion(
      {
        version: API_VERSIONS.public.v1,
        validate: {
          request: UpdateAgentPolicyRequestSchema,
          response: {
            200: {
              body: () => GetAgentPolicyResponseSchema,
            },
            400: {
              body: genericErrorResponse,
            },
          },
        },
      },
      updateAgentPolicyHandler
    );

  // Copy
  router.versioned
    .post({
      path: AGENT_POLICY_API_ROUTES.COPY_PATTERN,
      security: {
        authz: {
          requiredPrivileges: [FLEET_API_PRIVILEGES.AGENT_POLICIES.ALL],
        },
      },
      summary: `Copy an agent policy`,
      description: `Copy an agent policy by ID.`,
      options: {
        tags: ['oas-tag:Elastic Agent policies'],
      },
    })
    .addVersion(
      {
        version: API_VERSIONS.public.v1,
        validate: {
          request: CopyAgentPolicyRequestSchema,
          response: {
            200: {
              body: () => GetAgentPolicyResponseSchema,
            },
            400: {
              body: genericErrorResponse,
            },
          },
        },
      },
      copyAgentPolicyHandler
    );

  // Delete
  router.versioned
    .post({
      path: AGENT_POLICY_API_ROUTES.DELETE_PATTERN,
      security: {
        authz: {
          requiredPrivileges: [FLEET_API_PRIVILEGES.AGENT_POLICIES.ALL],
        },
      },
      summary: `Delete an agent policy`,
      description: `Delete an agent policy by ID.`,
      options: {
        tags: ['oas-tag:Elastic Agent policies'],
      },
    })
    .addVersion(
      {
        version: API_VERSIONS.public.v1,
        validate: {
          request: DeleteAgentPolicyRequestSchema,
          response: {
            200: {
              body: () => DeleteAgentPolicyResponseSchema,
            },
            400: {
              body: genericErrorResponse,
            },
          },
        },
      },
      deleteAgentPoliciesHandler
    );

  // Get one full agent policy
  router.versioned
    .get({
      path: AGENT_POLICY_API_ROUTES.FULL_INFO_PATTERN,
      security: {
        authz: {
          requiredPrivileges: [FLEET_API_PRIVILEGES.AGENT_POLICIES.READ],
        },
      },
      summary: `Get a full agent policy`,
      description: `Get a full agent policy by ID.`,
      options: {
        tags: ['oas-tag:Elastic Agent policies'],
      },
    })
    .addVersion(
      {
        version: API_VERSIONS.public.v1,
        validate: {
          request: GetFullAgentPolicyRequestSchema,
          response: {
            200: {
              body: () => GetFullAgentPolicyResponseSchema,
            },
            400: {
              body: genericErrorResponse,
            },
          },
        },
      },
      getFullAgentPolicy
    );

  // Download one full agent policy
  router.versioned
    .get({
      path: AGENT_POLICY_API_ROUTES.FULL_INFO_DOWNLOAD_PATTERN,
      security: {
        authz: {
          requiredPrivileges: [
            FLEET_API_PRIVILEGES.AGENT_POLICIES.READ,
            FLEET_API_PRIVILEGES.SETUP,
          ],
        },
      },
      enableQueryVersion: true,
      summary: `Download an agent policy`,
      description: `Download an agent policy by ID.`,
      options: {
        tags: ['oas-tag:Elastic Agent policies'],
      },
    })
    .addVersion(
      {
        version: API_VERSIONS.public.v1,
        validate: {
          request: GetFullAgentPolicyRequestSchema,
          response: {
            200: {
              body: () => DownloadFullAgentPolicyResponseSchema,
            },
            400: {
              body: genericErrorResponse,
            },
            404: {
              body: genericErrorResponse,
            },
          },
        },
      },
      downloadFullAgentPolicy
    );

  // Get agent manifest
  router.versioned
    .get({
      path: K8S_API_ROUTES.K8S_INFO_PATTERN,
      security: {
        authz: {
          requiredPrivileges: [
            FLEET_API_PRIVILEGES.AGENT_POLICIES.READ,
            FLEET_API_PRIVILEGES.SETUP,
          ],
        },
      },
      summary: `Get a full K8s agent manifest`,
      options: {
        tags: ['oas-tag:Elastic Agent policies'],
      },
    })
    .addVersion(
      {
        version: API_VERSIONS.public.v1,
        validate: {
          request: GetK8sManifestRequestSchema,
          response: {
            200: {
              body: () => GetK8sManifestResponseScheme,
            },
            400: {
              body: genericErrorResponse,
            },
          },
        },
      },
      getK8sManifest
    );

  // Download agent manifest
  router.versioned
    .get({
      path: K8S_API_ROUTES.K8S_DOWNLOAD_PATTERN,
      security: {
        authz: {
          requiredPrivileges: [
            FLEET_API_PRIVILEGES.AGENT_POLICIES.READ,
            FLEET_API_PRIVILEGES.SETUP,
          ],
        },
      },
      enableQueryVersion: true,
      summary: `Download an agent manifest`,
      options: {
        tags: ['oas-tag:Elastic Agent policies'],
      },
    })
    .addVersion(
      {
        version: API_VERSIONS.public.v1,
        validate: {
          request: GetK8sManifestRequestSchema,
          response: {
            200: {
              body: () => schema.string(),
            },
            400: {
              body: genericErrorResponse,
            },
            404: {
              body: genericErrorResponse,
            },
          },
        },
      },
      downloadK8sManifest
    );

  router.versioned
    .post({
      path: AGENT_POLICY_API_ROUTES.LIST_OUTPUTS_PATTERN,
      security: {
        authz: {
          requiredPrivileges: [
            FLEET_API_PRIVILEGES.AGENT_POLICIES.READ,
            FLEET_API_PRIVILEGES.SETTINGS.READ,
          ],
        },
      },
      summary: `Get outputs for agent policies`,
      description: `Get a list of outputs associated with agent policies.`,
      options: {
        tags: ['oas-tag:Elastic Agent policies'],
      },
    })
    .addVersion(
      {
        version: API_VERSIONS.public.v1,
        validate: {
          request: GetListAgentPolicyOutputsRequestSchema,
          response: {
            200: {
              body: () => GetListAgentPolicyOutputsResponseSchema,
            },
            400: {
              body: genericErrorResponse,
            },
          },
        },
      },
      GetListAgentPolicyOutputsHandler
    );

  router.versioned
    .get({
      path: AGENT_POLICY_API_ROUTES.INFO_OUTPUTS_PATTERN,
      security: {
        authz: {
          requiredPrivileges: [
            FLEET_API_PRIVILEGES.AGENT_POLICIES.READ,
            FLEET_API_PRIVILEGES.SETTINGS.READ,
          ],
        },
      },
      summary: `Get outputs for an agent policy`,
      description: `Get a list of outputs associated with agent policy by policy id.`,
      options: {
        tags: ['oas-tag:Elastic Agent policies'],
      },
    })
    .addVersion(
      {
        version: API_VERSIONS.public.v1,
        validate: {
          request: GetAgentPolicyOutputsRequestSchema,
          response: {
            200: {
              body: () => GetAgentPolicyOutputsResponseSchema,
            },
            400: {
              body: genericErrorResponse,
            },
          },
        },
      },
      GetAgentPolicyOutputsHandler
    );
};
