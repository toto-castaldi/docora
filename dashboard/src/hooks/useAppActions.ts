import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import {
  retryNotification,
  bulkRetryByApp,
  resyncRepository,
  resyncByApp,
} from "../api/admin";

export function useAppActions(appId: string) {
  const queryClient = useQueryClient();

  const [showRetryConfirm, setShowRetryConfirm] = useState(false);
  const [bulkRetryOperationId, setBulkRetryOperationId] = useState<string | null>(null);
  const [showResyncConfirm, setShowResyncConfirm] = useState(false);
  const [resyncOperationId, setResyncOperationId] = useState<string | null>(null);
  const [pendingResync, setPendingResync] = useState<{ repositoryId: string; repoName: string } | null>(null);

  const invalidateApp = () => {
    queryClient.invalidateQueries({ queryKey: ["app", appId] });
  };

  const retryMutation = useMutation({
    mutationFn: ({ repositoryId }: { repositoryId: string }) =>
      retryNotification(appId, repositoryId),
    onSuccess: () => {
      toast.success("Retry queued successfully");
      invalidateApp();
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to queue retry");
    },
  });

  const resyncMutation = useMutation({
    mutationFn: ({ repositoryId }: { repositoryId: string }) =>
      resyncRepository(appId, repositoryId),
    onSuccess: () => {
      toast.success("Re-sync queued");
      invalidateApp();
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to queue re-sync");
    },
  });

  const handleBulkRetry = async () => {
    setShowRetryConfirm(false);
    try {
      const result = await bulkRetryByApp(appId);
      setBulkRetryOperationId(result.operation_id);
      toast.success(`Retrying ${result.total} failed notifications...`);
    } catch (err) {
      toast.error((err as Error).message || "Failed to start bulk retry");
    }
  };

  const handleBulkRetryComplete = () => {
    setBulkRetryOperationId(null);
    invalidateApp();
    queryClient.invalidateQueries({ queryKey: ["overview"] });
  };

  const handleBulkRetryCancel = () => {
    setBulkRetryOperationId(null);
    invalidateApp();
  };

  const handleResyncRepo = (repositoryId: string, repoName: string) => {
    setPendingResync({ repositoryId, repoName });
  };

  const confirmResyncRepo = () => {
    if (pendingResync) {
      resyncMutation.mutate({ repositoryId: pendingResync.repositoryId });
      setPendingResync(null);
    }
  };

  const cancelResyncRepo = () => {
    setPendingResync(null);
  };

  const handleBulkResync = async () => {
    setShowResyncConfirm(false);
    try {
      const result = await resyncByApp(appId);
      setResyncOperationId(result.operation_id);
      toast.success(`Re-syncing ${result.total} repositories...`);
    } catch (err) {
      toast.error((err as Error).message || "Failed to start bulk re-sync");
    }
  };

  const handleBulkResyncComplete = () => {
    setResyncOperationId(null);
    invalidateApp();
    queryClient.invalidateQueries({ queryKey: ["overview"] });
  };

  const handleBulkResyncCancel = () => {
    setResyncOperationId(null);
    invalidateApp();
  };

  return {
    retryMutation,
    resyncMutation,
    showRetryConfirm,
    setShowRetryConfirm,
    bulkRetryOperationId,
    handleBulkRetry,
    handleBulkRetryComplete,
    handleBulkRetryCancel,
    showResyncConfirm,
    setShowResyncConfirm,
    resyncOperationId,
    handleResyncRepo,
    pendingResync,
    confirmResyncRepo,
    cancelResyncRepo,
    handleBulkResync,
    handleBulkResyncComplete,
    handleBulkResyncCancel,
  };
}
