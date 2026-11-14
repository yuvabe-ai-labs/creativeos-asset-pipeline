"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { peopleService } from "@/services/people.service";
import { invalidateMe } from "@/hooks/queries/me";
import { ApiError } from "@/services/read-json";
import type { Permission } from "@/lib/permissions/model";
import type { AgencyPeople } from "@/lib/people/types";

// One people resource per agency (spec §10): the Team page, every Members list and the invite
// popup select from it. Keys are built here and nowhere else.
export const peopleKeys = {
  all: (orgId: string) => ["people", orgId] as const,
  list: (orgId: string) => [...peopleKeys.all(orgId), "list"] as const,
};

/** Seeded by the page's server render; refetched whenever a screen mounts, since another owner
 *  session (or Admin) may have changed it. */
export function usePeople(orgId: string, initialData?: AgencyPeople) {
  return useQuery({
    queryKey: peopleKeys.list(orgId),
    queryFn: () => peopleService.list(orgId),
    initialData,
    staleTime: 0,
    // A 403 or 404 won't pass on a second try; anything else gets the app's one retry.
    retry: (failureCount, error) =>
      !(error instanceof ApiError && error.status >= 400 && error.status < 500) && failureCount < 1,
  });
}

function useRefreshPeople(orgId: string, alsoMe = false) {
  const queryClient = useQueryClient();
  return async () => {
    await queryClient.invalidateQueries({ queryKey: peopleKeys.all(orgId) });
    // The header's Signed up count rides on /api/me.
    if (alsoMe) await invalidateMe(queryClient);
  };
}

export function useUpdatePermissions(orgId: string) {
  const refresh = useRefreshPeople(orgId, true);
  return useMutation({
    mutationFn: (v: { userId: string; permissions: Permission[]; giveAccess?: boolean }) =>
      peopleService.updatePermissions(orgId, v.userId, { permissions: v.permissions, giveAccess: v.giveAccess }),
    onSuccess: refresh,
  });
}

export function useRemovePerson(orgId: string) {
  const refresh = useRefreshPeople(orgId, true);
  return useMutation({ mutationFn: (userId: string) => peopleService.remove(orgId, userId), onSuccess: refresh });
}

export function useMakeOwner(orgId: string) {
  const refresh = useRefreshPeople(orgId);
  return useMutation({ mutationFn: (userId: string) => peopleService.makeOwner(orgId, userId), onSuccess: refresh });
}

export function useResendInvite(orgId: string) {
  const refresh = useRefreshPeople(orgId);
  return useMutation({
    mutationFn: (inviteId: string) => peopleService.resendInvite(orgId, inviteId),
    onSuccess: refresh,
  });
}

export function useCancelInvite(orgId: string) {
  const refresh = useRefreshPeople(orgId);
  return useMutation({ mutationFn: (inviteId: string) => peopleService.cancelInvite(orgId, inviteId), onSuccess: refresh });
}

export function useAddToClient(orgId: string, clientId: string) {
  const refresh = useRefreshPeople(orgId);
  return useMutation({ mutationFn: (userIds: string[]) => peopleService.addToClient(orgId, clientId, userIds), onSuccess: refresh });
}

export function useRemoveFromClient(orgId: string, clientId: string) {
  const refresh = useRefreshPeople(orgId);
  return useMutation({ mutationFn: (userId: string) => peopleService.removeFromClient(orgId, clientId, userId), onSuccess: refresh });
}

export function useInviteToClient(orgId: string, clientId: string) {
  const refresh = useRefreshPeople(orgId);
  return useMutation({ mutationFn: (email: string) => peopleService.inviteToClient(orgId, clientId, email), onSuccess: refresh });
}
