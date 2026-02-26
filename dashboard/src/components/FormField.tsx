import type { InputHTMLAttributes, TextareaHTMLAttributes } from "react";
import styles from "./FormField.module.css";

interface BaseFieldProps {
  label: string;
  name: string;
  helperText?: string;
  error?: string;
  optional?: boolean;
}

interface InputFieldProps extends BaseFieldProps {
  as?: "input";
  inputProps: InputHTMLAttributes<HTMLInputElement>;
}

interface TextareaFieldProps extends BaseFieldProps {
  as: "textarea";
  inputProps: TextareaHTMLAttributes<HTMLTextAreaElement>;
}

type FormFieldProps = InputFieldProps | TextareaFieldProps;

export function FormField({
  label,
  name,
  helperText,
  error,
  optional,
  ...rest
}: FormFieldProps) {
  const hasError = !!error;
  const inputClassName = `${styles.input} ${hasError ? styles.inputError : ""}`;

  return (
    <div className={styles.fieldGroup}>
      <label htmlFor={name} className={styles.label}>
        {label}
        {optional && <span className={styles.optionalBadge}>(optional)</span>}
      </label>
      {rest.as === "textarea" ? (
        <textarea
          id={name}
          name={name}
          className={`${inputClassName} ${styles.textarea}`}
          {...rest.inputProps}
        />
      ) : (
        <input
          id={name}
          name={name}
          className={inputClassName}
          {...rest.inputProps}
        />
      )}
      {helperText && <p className={styles.helperText}>{helperText}</p>}
      {hasError && <p className={styles.errorMessage}>{error}</p>}
    </div>
  );
}
