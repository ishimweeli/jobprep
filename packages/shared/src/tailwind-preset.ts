import { colors, darkColors, fontFamily, radii } from './tokens';

/** Tailwind preset for apps/web — `presets: [jobprepPreset]`. Kept dependency-free on purpose. */
export const jobprepPreset = {
  theme: {
    extend: {
      colors: { ...colors, ...darkColors },
      fontFamily: { sans: [...fontFamily.sans] },
      borderRadius: { ...radii },
      minHeight: { touch: '44px' },
      minWidth: { touch: '44px' },
      ringColor: { DEFAULT: colors.brand.ring },
    },
  },
};

export default jobprepPreset;
