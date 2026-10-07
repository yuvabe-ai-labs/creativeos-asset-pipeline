// Everything image analysis says to people (D312). Plain words only: no model or provider names,
// no error text; causes go to the server log.
export const imageAnalysisCopy = {
  starting: "Getting ready to read the images…",
  reading: (count: number) => (count === 1 ? "Reading 1 image…" : `Reading ${count} images…`),
  writing: "Writing the image analysis…",
  done: (counted: number) => (counted === 1 ? "Built from 1 image" : `Built from ${counted} images`),
  upToDate: (counted: number) => (counted === 1 ? "Up to date with 1 image" : `Up to date with ${counted} images`),
  failed: "The image analysis didn't finish. Try again in a few minutes.",
  couldNotStart: "The image analysis couldn't start. Try again.",
};
