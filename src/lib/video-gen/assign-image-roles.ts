export type ImageRole = "start_frame" | "end_frame" | "reference";

export type UpstreamImageRef = { nodeId: string; url: string };

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
