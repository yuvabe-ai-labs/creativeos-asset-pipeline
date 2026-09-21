export type ImageRole = "start_frame" | "end_frame" | "reference";

export type UpstreamImageRef = { nodeId: string; url: string; type?: string };

export type AssignedImageRoles = {
  startFrameUrl: string | undefined;
  endFrameUrl: string | undefined;
  referenceUrls: string[];
};

/**
 * Which upstream image plays which part in the request — assignment only, never inference.
 *
 * An image the operator has not given a role is DROPPED. The route used to default it to
 * `reference`, which put the server and the focus view on two different pictures of the same
 * node: `VideoGenConnectedSection` lights no chip for an unassigned image and
 * `buildConstraintState` counts it in nothing, so the client evaluated `referenceCount: 0`,
 * enabled Generate, and the server then built a state with references in it. On Veo Fast/Quality
 * that trips `refs-lock-duration-disable-frames` and the request is rejected with "Reference
 * images selected → duration locked to 8s, start/end frames unavailable" — on a shot the operator
 * gave nothing but a start frame. The images most often caught by this are the stills feeding the
 * video-prompt node, which the 2-level traversal picks up but which the operator never touched.
 *
 * Dropping is the correction rather than mirroring the UI's display default, because the UI has
 * no display default: unassigned reads as unassigned on both sides now. A model that cannot work
 * from the prompt alone still says so — its own rules disable Generate (Kling), and the provider
 * throws a named error for callers that bypass the UI.
 *
 * Frames are first-wins: only one image can be the first frame, and a surplus `start_frame` is
 * surplus, not a reference. Reference order follows the upstream order it was given.
 */
/**
 * Fill in a role for every image the operator has not assigned one to.
 *
 * The operator should not have to tag each picture before anything works — an attached image is
 * an input, and `reference` is what an untagged one almost always is.
 *
 * An explicit assignment ALWAYS wins, and a `start_frame` is only auto-assigned when the model
 * takes one and none is set: it is the exclusive role, and guessing it wrong changes the request's
 * whole shape (an image-to-video generation animates that frame; a reference only steers).
 *
 * The historical reason unassigned images used to be DROPPED was not the defaulting itself but the
 * DIVERGENCE it caused — the server defaulted, the client did not, so the client evaluated
 * `referenceCount: 0`, enabled Generate, and the server then built a state that tripped Veo's
 * `refs-lock-duration-disable-frames`. The fix is for both sides to run THIS function and persist
 * the result, so the constraint UI is evaluating the same roles the request will use.
 */
export function autoAssignImageRoles(
  images: UpstreamImageRef[],
  imageRoles: Record<string, ImageRole>,
  opts: { supportsStartFrame: boolean; supportsReferences: boolean } = {
    supportsStartFrame: true,
    supportsReferences: true,
  },
): Record<string, ImageRole> {
  const next: Record<string, ImageRole> = { ...imageRoles };
  let hasStart = Object.values(next).some((r) => r === "start_frame");

  // EVERY unassigned image defaults to `reference` on any model that can take one (operator
  // request 2026-09-09). Auto-promoting the first generated still to `start_frame` was implicit
  // magic: two identical-looking stills got different roles, and which one "won" depended on
  // upstream traversal order the operator never sees. Predictable beats clever here.
  //
  // On Seedance that promotion was not merely surprising, it was destructive. Frames and
  // references are mutually exclusive TASK TYPES on /contents/generations/tasks, so
  // buildSeedanceContent returns early on a start frame — a promoted still silently discarded
  // every reference, while the prompt it was written against still cited `@Image 1`, `@Image 2`.
  // No error, wrong output, billed.
  //
  // The one case still promoted: a model that accepts NO references at all. Veo Lite and Kling 3.0
  // both declare `maxReferenceImages: 0`, and Kling 3.0 additionally refuses to generate without a
  // start frame — defaulting their images to `reference` would splice them away to nothing, which
  // is a silent downgrade to text-to-video on one model and an ungenerateable node on the other.
  const promoteToStartFrame = opts.supportsStartFrame && !opts.supportsReferences;

  for (const { nodeId, type } of images) {
    if (next[nodeId]) continue;
    if (type === "image-gen" && promoteToStartFrame && !hasStart) {
      next[nodeId] = "start_frame";
      hasStart = true;
      continue;
    }
    next[nodeId] = "reference";
  }
  return next;
}

/**
 * Order images so the reference array matches the numbering the motion prompt already wrote.
 *
 * `<IMAGE_REF_N>` is assigned at the VIDEO-PROMPT node, over its own upstream images in its own
 * order. The Video Gen node reaches images by a two-level traversal that puts its DIRECT upstream
 * first and the prompt node's upstream second — so one image attached straight to Video Gen used
 * to take slot 0 and shift every token in the prompt onto the wrong picture. No error, no warning:
 * the clip just came back with the wrong product in it.
 *
 * Images the prompt node could see are therefore emitted FIRST, in that node's order; anything
 * only Video Gen can see follows, keeping its own relative order.
 */
export function orderImagesForPromptTokens(
  images: UpstreamImageRef[],
  promptUpstreamIds: string[],
): UpstreamImageRef[] {
  const rank = new Map(promptUpstreamIds.map((id, i) => [id, i]));
  return images
    .map((image, i) => ({ image, i }))
    .sort((a, b) => {
      const ra = rank.get(a.image.nodeId);
      const rb = rank.get(b.image.nodeId);
      if (ra !== undefined && rb !== undefined) return ra - rb;
      if (ra !== undefined) return -1; // prompt-visible images lead
      if (rb !== undefined) return 1;
      return a.i - b.i; // otherwise stable
    })
    .map((entry) => entry.image);
}

export function assignImageRoles(
  images: UpstreamImageRef[],
  imageRoles: Record<string, ImageRole>,
): AssignedImageRoles {
  let startFrameUrl: string | undefined;
  let endFrameUrl: string | undefined;
  const referenceUrls: string[] = [];

  for (const { nodeId, url } of images) {
    switch (imageRoles[nodeId]) {
      case "start_frame":
        startFrameUrl ??= url;
        break;
      case "end_frame":
        endFrameUrl ??= url;
        break;
      case "reference":
        referenceUrls.push(url);
        break;
      default:
        break; // unassigned — not an input
    }
  }

  return { startFrameUrl, endFrameUrl, referenceUrls };
}
