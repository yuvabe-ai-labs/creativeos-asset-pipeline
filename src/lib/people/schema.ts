import * as z from "zod";
import { PERMISSIONS } from "@/lib/permissions/model";
import { NewPasswordField, PASSWORDS_DONT_MATCH, passwordsMatch } from "@/lib/auth/change-password-schema";

export const UpdatePermissionsSchema = z.object({
  permissions: z.array(z.enum(PERMISSIONS)).max(PERMISSIONS.length),
  giveAccess: z.boolean().optional(),
});

/** Ids from the browser: checked against the agency before any write (performance rule 14). */
export const AddMembersSchema = z.object({ userIds: z.array(z.uuid()).min(1).max(200) });

/** The email's wording is checked in the ops, so the refusal is the spec's sentence. */
export const InviteSchema = z.object({ email: z.string().max(320) });

/** The password rule and the confirmation check are the change-password ones (D598). */
export const AcceptInviteSchema = z
  .object({
    name: z.string().trim().min(2, { error: "Enter your name." }).max(80),
    password: NewPasswordField,
    confirmPassword: z.string(),
  })
  .refine(passwordsMatch, PASSWORDS_DONT_MATCH);

/** An agency id from the browser (Admin's Resend and Invite an owner), checked before any read. */
export const AgencyIdSchema = z.uuid();

export const CreateAgencySchema = z.object({
  name: z.string().trim().min(2, { error: "Enter the agency's name." }).max(80),
  email: z.email({ error: "Enter a valid email." }).trim(),
});
