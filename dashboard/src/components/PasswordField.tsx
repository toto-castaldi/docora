import { useState, type InputHTMLAttributes } from "react";
import { Eye, EyeOff } from "lucide-react";
import styles from "./PasswordField.module.css";
import formStyles from "./FormField.module.css";

interface PasswordFieldProps {
  label: string;
  name: string;
  helperText?: string;
  error?: string;
  inputProps: Omit<InputHTMLAttributes<HTMLInputElement>, "type">;
}

export function PasswordField({
  label,
  name,
  helperText,
  error,
  inputProps,
}: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);
  const hasError = !!error;
  const inputClassName = `${formStyles.input} ${hasError ? formStyles.inputError : ""}`;

  return (
    <div className={formStyles.fieldGroup}>
      <label htmlFor={name} className={formStyles.label}>
        {label}
      </label>
      <div className={styles.wrapper}>
        <input
          id={name}
          name={name}
          type={visible ? "text" : "password"}
          className={inputClassName}
          {...inputProps}
        />
        <button
          type="button"
          className={styles.toggle}
          onClick={() => setVisible((v) => !v)}
          tabIndex={-1}
          aria-label={visible ? "Hide password" : "Show password"}
        >
          {visible ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
      {helperText && <p className={formStyles.helperText}>{helperText}</p>}
      {hasError && <p className={formStyles.errorMessage}>{error}</p>}
    </div>
  );
}
