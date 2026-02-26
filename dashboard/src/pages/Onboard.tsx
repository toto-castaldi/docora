import { Loader2, AlertCircle } from "lucide-react";
import { FormField } from "../components/FormField.js";
import { PasswordField } from "../components/PasswordField.js";
import { CredentialsModal } from "../components/CredentialsModal.js";
import { useOnboardForm } from "../hooks/useOnboardForm.js";
import styles from "./Onboard.module.css";

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className={styles.errorBanner}>
      <AlertCircle size={18} />
      <span>{message}</span>
    </div>
  );
}

export function Onboard() {
  const {
    form, fieldErrors, apiError, isSubmitting,
    result, updateField, handleSubmit, dismissResult,
  } = useOnboardForm();

  const disabled = isSubmitting;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>Onboard New App</h1>
        <p className={styles.subtitle}>
          Register a new client application to receive webhook notifications from Docora.
        </p>
      </div>

      {apiError && <ErrorBanner message={apiError} />}

      <form onSubmit={handleSubmit} className={styles.form} noValidate>
        <FormField
          label="App Name" name="app_name"
          helperText="A human-readable name for this application (3-100 characters)"
          error={fieldErrors.app_name}
          inputProps={{
            type: "text", value: form.app_name, required: true,
            minLength: 3, maxLength: 100, disabled,
            onChange: (e) => updateField("app_name", e.target.value),
          }}
        />

        <FormField
          label="Webhook URL (Base URL)" name="base_url"
          helperText="The HTTPS endpoint where Docora will send file change notifications"
          error={fieldErrors.base_url}
          inputProps={{
            type: "url", value: form.base_url, required: true,
            maxLength: 2048, disabled, placeholder: "https://example.com/webhooks",
            onChange: (e) => updateField("base_url", e.target.value),
          }}
        />

        <FormField
          label="Contact Email" name="email"
          helperText="Email for operational notifications about this app"
          error={fieldErrors.email}
          inputProps={{
            type: "email", value: form.email, required: true,
            maxLength: 255, disabled,
            onChange: (e) => updateField("email", e.target.value),
          }}
        />

        <PasswordField
          label="Client Auth Key" name="client_auth_key"
          helperText="Secret key Docora uses to sign webhook calls to your app (min 16 characters)"
          error={fieldErrors.client_auth_key}
          inputProps={{
            value: form.client_auth_key, required: true,
            minLength: 16, maxLength: 500, disabled,
            onChange: (e) => updateField("client_auth_key", e.target.value),
          }}
        />

        <FormField
          label="Website" name="website" optional
          helperText="Public website for this application"
          inputProps={{
            type: "url", value: form.website ?? "", disabled,
            maxLength: 2048, placeholder: "https://example.com",
            onChange: (e) => updateField("website", e.target.value),
          }}
        />

        <FormField
          label="Description" name="description" optional as="textarea"
          helperText="Brief description of the application (max 500 characters)"
          inputProps={{
            value: form.description ?? "", disabled,
            maxLength: 500, rows: 3,
            onChange: (e) => updateField("description", e.target.value),
          }}
        />

        <button type="submit" className={styles.submitButton} disabled={disabled}>
          {isSubmitting ? (
            <>
              <Loader2 size={16} className={styles.spin} />
              Onboarding...
            </>
          ) : (
            "Onboard App"
          )}
        </button>
      </form>

      {result && (
        <CredentialsModal
          open={!!result}
          appId={result.app_id}
          token={result.token}
          onClose={dismissResult}
        />
      )}
    </div>
  );
}
