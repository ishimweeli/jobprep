import { Field } from '../../components/Field';

interface Props {
  value: string;
  onChange: (value: string) => void;
  error?: string | null;
  id?: string;
}

/** Email address input (replaces the phone field in the sign-up and sign-in layouts). */
export function EmailField({ value, onChange, error, id = 'email' }: Props) {
  return (
    <Field
      id={id}
      label="Email address"
      type="email"
      inputMode="email"
      autoComplete="email"
      autoCapitalize="none"
      spellCheck={false}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="you@example.com"
      error={error}
      className="text-[17px]"
    />
  );
}
