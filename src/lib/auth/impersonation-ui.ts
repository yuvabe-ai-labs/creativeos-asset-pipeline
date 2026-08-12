// Pure presentation decisions for the impersonation banner (D139). Kept out of the
// components so they are unit-testable under this repo's node-environment vitest
// setup — there is no DOM test stack here by design.

export type ImpersonationBannerPresentation = {
  /** Small-caps label; rendered through `.text-eyebrow`, which uppercases it. */
  eyebrow: string;
  stateLabel: string;
  /** Background + border for the bar. */
  barClass: string;
  /** The 3px left rule — the state's strongest colour signal. */
  ruleClass: string;
  showEnableEditing: boolean;
};

export function bannerPresentation(
  elevated: boolean,
): ImpersonationBannerPresentation {
  if (elevated) {
    // Brand yellow as a soft ~10% tint only, per the design system's "yellow only as
    // a soft glow" rule — enough to change the bar's temperature, never a flat fill.
    return {
      eyebrow: "Editing as",
      // Parallel to "Read-only", and deliberately plain: the eyebrow already reads
      // "EDITING AS <org>", so this only has to name the mode, not narrate it.
      stateLabel: "Editing",
      barClass: "bg-[#ffca2d]/10 border-[#ffca2d]/40",
      ruleClass: "bg-[#ffca2d]",
      showEnableEditing: false,
    };
  }
  return {
    eyebrow: "Viewing as",
    stateLabel: "Read-only",
    barClass: "bg-background border-border",
    ruleClass: "bg-primary",
    showEnableEditing: true,
  };
}

// The banner is `sticky top-0 h-11`, so the header has to start below it — otherwise
// the two overlap and the banner is the one that loses.
export function headerTopClass(isImpersonating: boolean): string {
  return isImpersonating ? "top-11" : "top-0";
}
