/** Copy of the Change goal screen (C15). One screen, two moods: changing a goal, or choosing one after a country switch. */
export function goalScreenCopy(input: { hasGoal: boolean; countryName: string }): { title: string; lead: string; button: string; keep: string } {
  if (input.hasGoal) {
    return {
      title: 'Change your goal',
      lead: `Job categories in ${input.countryName}. We show these mock tests and recommendations first. Your past results stay as they are.`,
      button: 'Save goal',
      keep: 'Keep my current goal',
    };
  }
  return {
    title: 'Choose your goal',
    lead: `You have no exam goal for ${input.countryName} yet. Pick the job category you are preparing for and we will recommend your first tests.`,
    button: 'Save goal',
    keep: 'Not now',
  };
}

/** The dashboard prompt for a person with no goal (for example right after a country switch). */
export const CHOOSE_GOAL_PROMPT = { text: 'No exam goal yet.', link: 'Choose your goal' };
