// TypeScript shapes for our Supabase rows. snake_case = the actual DB columns.
// (Later we can auto-generate these with `supabase gen types`; hand-written is fine now.)

export type ClientRow = {
  id: string;
  slug: string;
  name: string;
  logo: string | null;
  context_notes: string;
  created_at: string;
  updated_at: string;
};
