import { Field } from '../../components/Field';
import { groupNational, nationalDigits } from '../../lib/phone';

interface Props {
  country: { code: string; dialCode: string };
  national: string;
  onChange: (national: string) => void;
  error?: string | null;
  id?: string;
  /** Rendered instead of the static prefix chip when several countries can be chosen. */
  prefixOverride?: React.ReactNode;
}

/** Phone number input with the country's dial-code prefix chip (design: "RW +250 | 788 123 456"). */
export function PhoneField({ country, national, onChange, error, id = 'phone', prefixOverride }: Props) {
  return (
    <Field
      id={id}
      label="Phone number"
      type="tel"
      inputMode="numeric"
      autoComplete="tel-national"
      value={groupNational(national)}
      onChange={(e) => onChange(nationalDigits(e.target.value, country.dialCode).slice(0, 9))}
      placeholder="788 123 456"
      error={error}
      className="text-lg"
      leading={
        prefixOverride ?? (
          <span className="inline-flex h-[52px] flex-none items-center gap-1.5 rounded-control border border-zinc-300 bg-soft px-3 font-bold">
            <span className="rounded bg-ink px-1 text-[11px] text-white">{country.code}</span>
            {country.dialCode}
          </span>
        )
      }
    />
  );
}
