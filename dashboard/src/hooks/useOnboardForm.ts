import { useState, type FormEvent } from "react";
import { onboardApp, ApiError } from "../api/admin.js";
import type { OnboardFormData, OnboardResult } from "../api/admin.js";

interface FieldErrors {
  app_name?: string;
  base_url?: string;
  email?: string;
  client_auth_key?: string;
}

const INITIAL_FORM: OnboardFormData = {
  app_name: "",
  base_url: "",
  email: "",
  client_auth_key: "",
  website: "",
  description: "",
};

function validateFields(form: OnboardFormData): FieldErrors {
  const errors: FieldErrors = {};
  if (!form.app_name.trim()) errors.app_name = "App name is required";
  else if (form.app_name.length < 3) errors.app_name = "At least 3 characters";

  if (!form.base_url.trim()) errors.base_url = "Webhook URL is required";
  if (!form.email.trim()) errors.email = "Email is required";

  if (!form.client_auth_key.trim()) errors.client_auth_key = "Auth key is required";
  else if (form.client_auth_key.length < 16) errors.client_auth_key = "At least 16 characters";

  return errors;
}

function stripOptionalBlanks(form: OnboardFormData): OnboardFormData {
  const clean = { ...form };
  if (!clean.website?.trim()) delete clean.website;
  if (!clean.description?.trim()) delete clean.description;
  return clean;
}

export function useOnboardForm() {
  const [form, setForm] = useState<OnboardFormData>(INITIAL_FORM);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [apiError, setApiError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<OnboardResult | null>(null);

  function updateField(name: string, value: string) {
    setForm((prev) => ({ ...prev, [name]: value }));
    setFieldErrors((prev) => ({ ...prev, [name]: undefined }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setApiError(null);

    const errors = validateFields(form);
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setIsSubmitting(true);
    try {
      const data = await onboardApp(stripOptionalBlanks(form));
      setResult(data);
      setForm(INITIAL_FORM);
      console.log("Onboard success:", data);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "An unexpected error occurred";
      setApiError(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  function dismissResult() {
    setResult(null);
  }

  return {
    form,
    fieldErrors,
    apiError,
    isSubmitting,
    result,
    updateField,
    handleSubmit,
    dismissResult,
  };
}
