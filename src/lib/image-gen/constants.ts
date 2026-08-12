/**
 * Appended to every prompt sent to an image model — fresh generations and edits alike.
 * Product shots are the dominant use case, and models drift on brand marks unless told
 * to hold the product (and especially its logo) exactly as the references show it.
 */
export const PRODUCT_DETAIL_SUFFIX =
  "Reference the product as is and pay special attention to the details in the logo.";
