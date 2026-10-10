"use client";

import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { clientsService } from "@/services/clients.service";

// A client's name and logo are read by Server Components (the clients list, the client page, the
// KB page), so a write refreshes the route rather than a query cache.

export function useRenameClient(clientId: string) {
  const router = useRouter();
  return useMutation({
    mutationFn: (name: string) => clientsService.rename(clientId, name),
    onSuccess: () => router.refresh(),
  });
}

export function useUploadClientLogo(clientId: string) {
  const router = useRouter();
  return useMutation({
    mutationFn: (file: File) => clientsService.uploadLogo(clientId, file),
    onSuccess: () => router.refresh(),
  });
}
