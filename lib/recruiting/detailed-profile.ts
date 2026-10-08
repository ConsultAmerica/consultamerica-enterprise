/**
 * The candidate-reviewed professional profile shared by Detailed Apply
 * snapshots, application drafts and résumé-library corrections. Plain module
 * (no server-only) so client forms and server actions validate the same shape.
 */

import { z } from "zod";

const text = (max: number) => z.string().trim().max(max);

export const detailedProfileSchema = z.object({
  summary: text(1500).optional().default(""),
  skills: z.array(text(80).min(1)).max(60).default([]),
  experience: z
    .array(
      z.object({
        title: text(160).min(1),
        company: text(160).default(""),
        startDate: text(20).default(""),
        endDate: text(20).default(""),
        isCurrent: z.boolean().default(false),
      }),
    )
    .max(20)
    .default([]),
  education: z
    .array(
      z.object({
        institution: text(160).default(""),
        degree: text(120).default(""),
        fieldOfStudy: text(120).default(""),
        endDate: text(20).default(""),
      }),
    )
    .max(10)
    .default([]),
  certifications: z.array(text(160).min(1)).max(20).default([]),
  portfolioUrl: text(300).optional().default(""),
});
export type DetailedProfile = z.infer<typeof detailedProfileSchema>;
