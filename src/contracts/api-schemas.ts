import { z } from 'zod';
import { FINDING_STATUSES, ORG_ROLES, SEVERITIES } from './enums';

/** Request validation schemas shared by the API (server-side enforcement) and clients (UX). */

const email = z.string().trim().toLowerCase().email().max(254);
const password = z
  .string()
  .min(10, 'Password must be at least 10 characters')
  .max(200)
  .refine((p) => /[a-z]/i.test(p) && /\d/.test(p), 'Password must contain letters and numbers');

export const RegisterSchema = z.object({
  email,
  password,
  name: z.string().trim().min(1).max(100).optional(),
  organizationName: z.string().trim().min(2).max(100).optional(),
});
export type RegisterInput = z.infer<typeof RegisterSchema>;

export const LoginSchema = z.object({ email, password: z.string().min(1).max(200) });
export type LoginInput = z.infer<typeof LoginSchema>;

export const PasswordResetRequestSchema = z.object({ email });
export const PasswordResetConfirmSchema = z.object({ token: z.string().min(20).max(200), password });

const id = z.string().min(1).max(64);

export const CreateProjectSchema = z.object({
  organizationId: id,
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).optional(),
});
export type CreateProjectInput = z.infer<typeof CreateProjectSchema>;

export const UpdateProjectSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(1000).optional(),
  settings: z
    .object({
      excludePaths: z.array(z.string().max(300)).max(100).optional(),
      secretAllowlist: z.array(z.string().max(300)).max(100).optional(),
      enableAi: z.boolean().optional(),
      enableHistory: z.boolean().optional(),
    })
    .optional(),
});

export const ScanOptionsSchema = z
  .object({
    /** Opt-in: send masked snippets of non-secret findings to the configured AI provider. */
    enableAi: z.boolean().default(false),
    /** Include commit-history analysis (repository scans only). */
    includeHistory: z.boolean().default(false),
    historyDepth: z.number().int().min(1).max(500).default(50),
    excludePaths: z.array(z.string().max(300)).max(100).default([]),
  })
  .default({});
export type ScanOptions = z.infer<typeof ScanOptionsSchema>;

const projectTarget = z
  .object({
    projectId: id.optional(),
    organizationId: id.optional(),
    /** If no projectId is given, a project is created (or reused) with this name. */
    projectName: z.string().trim().min(1).max(120).optional(),
  })
  .refine((v) => v.projectId || v.organizationId, 'projectId or organizationId is required');

export const UrlScanSchema = z.object({
  target: projectTarget,
  url: z.string().url().max(2048),
  options: ScanOptionsSchema,
  /** Explicit consent flag required by the extension before private-source upload. */
  consent: z.boolean().optional(),
});
export type UrlScanInput = z.infer<typeof UrlScanSchema>;

export const RepositoryScanSchema = z.object({
  target: projectTarget,
  url: z.string().url().max(2048),
  /** Specific branch/tag/commit. Defaults to the repository's default branch. */
  ref: z.string().min(1).max(255).optional(),
  /** Scan several branches (one scan per branch, grouped). "ALL" = all accessible branches up to plan limits. */
  branches: z.union([z.literal('ALL'), z.array(z.string().min(1).max(255)).min(1).max(50)]).optional(),
  /** When set, only this path (file or folder) is scanned. */
  path: z.string().max(1024).optional(),
  options: ScanOptionsSchema,
  consent: z.boolean().optional(),
});
export type RepositoryScanInput = z.infer<typeof RepositoryScanSchema>;

export const PullRequestScanSchema = z.object({
  target: projectTarget,
  url: z.string().url().max(2048),
  options: ScanOptionsSchema,
  consent: z.boolean().optional(),
});
export type PullRequestScanInput = z.infer<typeof PullRequestScanSchema>;

export const UploadScanFieldsSchema = z.object({
  projectId: id.optional(),
  organizationId: id.optional(),
  projectName: z.string().trim().min(1).max(120).optional(),
  enableAi: z.enum(['true', 'false']).optional(),
  /** For folder uploads the browser sends relative paths alongside each file. */
  relativePaths: z.string().max(2_000_000).optional(),
});

export const UpdateFindingStatusSchema = z.object({
  status: z.enum(FINDING_STATUSES),
  note: z.string().trim().max(2000).optional(),
  /** Apply to the same fingerprint in future scans of this project (suppression). */
  applyToFuture: z.boolean().default(false),
});

export const FindingsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
  severity: z.enum(SEVERITIES).optional(),
  category: z.string().max(64).optional(),
  status: z.enum(FINDING_STATUSES).optional(),
  classification: z.string().max(64).optional(),
  search: z.string().max(200).optional(),
  onlyNew: z.enum(['true', 'false']).optional(),
});

export const InviteMemberSchema = z.object({ email, role: z.enum(ORG_ROLES).exclude(['OWNER']) });
export const UpdateMemberSchema = z.object({ role: z.enum(ORG_ROLES) });
export const CreateOrganizationSchema = z.object({ name: z.string().trim().min(2).max(100) });

export const ScheduleSchema = z.object({
  projectSourceId: id,
  /** Interval in hours (minimum 1, maximum 30 days). */
  intervalHours: z.number().int().min(1).max(720),
  enabled: z.boolean().default(true),
});

export const NotificationPreferencesSchema = z.object({
  emailEnabled: z.boolean(),
  inAppEnabled: z.boolean(),
  minSeverity: z.enum(SEVERITIES),
});
