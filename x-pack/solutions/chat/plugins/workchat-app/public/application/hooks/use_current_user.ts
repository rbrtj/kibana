/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../query_keys';
import { useKibana } from './use_kibana';

export const useCurrentUser = () => {
  const {
    services: { security },
  } = useKibana();

  const { data: user } = useQuery({
    queryKey: queryKeys.users.current,
    queryFn: async () => {
      return security.authc.getCurrentUser();
    },
  });

  return user;
};
