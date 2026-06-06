export type ModuleKey =
  | "brand_voice"
  | "visual_identity"
  | "image_analysis"
  | "audience_casting"
  | "image_direction"
  | "video_direction"
  | "compliance";

export type FieldPath = string[];

export type StagedChanges = {
  pendingDocRemovals: Set<string>;
  pendingImageRemovals: Set<string>;
  newlyAddedDocIds: Set<string>;
  newlyAddedImageIds: Set<string>;
};
