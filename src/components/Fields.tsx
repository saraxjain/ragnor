import { CDC_DANGER_SIGNS, FOUNDERS_RED_FLAGS_UNVALIDATED, GENERAL_SYMPTOMS_UNVALIDATED } from "@/lib/rules/symptoms";

export function FieldError({ id, message }: { id: string; message?: string }) {
  return message ? (
    <p id={id} className="error">
      {message}
    </p>
  ) : null;
}

export function ErrorSummary({ errors }: { errors: Record<string, string> }) {
  const list = Object.entries(errors);
  if (list.length === 0) return null;
  return (
    <div className="error-summary" role="alert">
      <strong>Please fix the following:</strong>
      <ul>
        {list.map(([k, m]) => (
          <li key={k}>{m}</li>
        ))}
      </ul>
    </div>
  );
}

const group = (title: string, hint: string, defs: { id: string; label: string }[]) => (
  <fieldset key={title}>
    <legend>{title}</legend>
    <p className="hint" style={{ marginTop: 0 }}>
      {hint}
    </p>
    <div className="checks">
      {defs.map((s) => (
        <label key={s.id} className="check">
          <input type="checkbox" name="symptoms" value={s.id} />
          <span>{s.label}</span>
        </label>
      ))}
    </div>
  </fieldset>
);

/** Symptom checklist: danger signs first, then everyday symptoms. Pure markup; usable in server or client forms. */
export function SymptomChecklist() {
  return (
    <>
      {group("Danger signs", "Tick any that apply right now. These always trigger an urgent message and alert your trainer.", [
        ...CDC_DANGER_SIGNS,
        ...FOUNDERS_RED_FLAGS_UNVALIDATED,
      ])}
      {group("Other symptoms", "Tick any you have today.", GENERAL_SYMPTOMS_UNVALIDATED)}
    </>
  );
}
