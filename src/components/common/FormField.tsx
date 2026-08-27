import type { ReactNode } from 'react'

interface FormFieldProps {
  label: string
  htmlFor: string
  required?: boolean
  error?: string
  children: ReactNode
  hint?: string
}

export function FormField({ label, htmlFor, required, error, children, hint }: FormFieldProps) {
  return (
    <div className={`form-field ${error ? 'form-field--error' : ''}`}>
      <label htmlFor={htmlFor}>
        {label}
        {required && (
          <span className="form-field__required" aria-hidden="true">
            {' '}
            *
          </span>
        )}
      </label>
      {children}
      {hint && !error && <p className="form-field__hint">{hint}</p>}
      {error && (
        <p className="form-field__error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
