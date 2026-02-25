import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { deleteApp, fetchAppDetail } from "../api/admin";
import type { AppDetail } from "@docora/shared-types";

interface DeleteTarget {
  appId: string;
  appName: string;
  repositoryCount: number;
  snapshotCount: number;
  deliveryCount: number;
}

interface UseDeleteAppOptions {
  onSuccess?: () => void;
}

export function useDeleteApp(options?: UseDeleteAppOptions) {
  const queryClient = useQueryClient();
  const [pendingDelete, setPendingDelete] = useState<DeleteTarget | null>(null);

  const deleteMutation = useMutation({
    mutationFn: (appId: string) => deleteApp(appId),
    onSuccess: () => {
      toast.success(`${pendingDelete?.appName} deleted successfully`);
      queryClient.invalidateQueries({ queryKey: ["apps"] });
      queryClient.invalidateQueries({ queryKey: ["overview"] });
      if (pendingDelete) {
        queryClient.invalidateQueries({ queryKey: ["app", pendingDelete.appId] });
      }
      setPendingDelete(null);
      options?.onSuccess?.();
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to delete app");
    },
  });

  const requestDelete = async (appId: string, appName: string, detail?: AppDetail) => {
    if (detail) {
      setPendingDelete({
        appId,
        appName,
        repositoryCount: detail.repository_count,
        snapshotCount: detail.snapshot_count,
        deliveryCount: detail.delivery_count,
      });
    } else {
      try {
        const appDetail = await fetchAppDetail(appId);
        setPendingDelete({
          appId,
          appName,
          repositoryCount: appDetail.repository_count,
          snapshotCount: appDetail.snapshot_count,
          deliveryCount: appDetail.delivery_count,
        });
      } catch {
        toast.error("Failed to load app details");
      }
    }
  };

  const confirmDelete = () => {
    if (pendingDelete) {
      deleteMutation.mutate(pendingDelete.appId);
    }
  };

  const cancelDelete = () => {
    if (!deleteMutation.isPending) {
      setPendingDelete(null);
    }
  };

  return {
    pendingDelete,
    isPending: deleteMutation.isPending,
    requestDelete,
    confirmDelete,
    cancelDelete,
  };
}
