// Extraction (D213): the annotation canvas now serves review annotations too, so it
// lives in src/components/review-annotations/. Edit mode keeps its import path.
export {
  ReviewAnnotationCanvas as ImageGenAnnotationCanvas,
  type AnnotationHandle,
} from "@/components/review-annotations/review-annotation-canvas";
