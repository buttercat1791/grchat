/**
 * Database Service Validation Schemas
 *
 * Zod schemas for validating database service method parameters.
 */

import { z } from "zod";

export const HashFieldsSchema = z.record(z.string(), z.string());

export const ScoredMemberSchema = z.object({
  member: z.string(),
  score: z.number(),
});

export const SortedSetRangeOptionsSchema = z.object({
  withScores: z.boolean().optional(),
  reverse: z.boolean().optional(),
  limit: z.object({
    offset: z.number(),
    count: z.number(),
  }).optional(),
}).optional();

// String operation schemas
export const GetStringSchema = z.object({
  key: z.string(),
});

export const SetStringWithTTLSchema = z.object({
  key: z.string(),
  value: z.string(),
  ttlSeconds: z.number().positive(),
});

// Hash operation schemas
export const GetHashSchema = z.object({
  key: z.string(),
});

export const SetHashSchema = z.object({
  key: z.string(),
  fields: HashFieldsSchema,
});

export const SetHashWithTTLSchema = z.object({
  key: z.string(),
  fields: HashFieldsSchema,
  ttlSeconds: z.number().positive(),
});

export const GetHashFieldSchema = z.object({
  key: z.string(),
  field: z.string(),
});

export const SetHashFieldSchema = z.object({
  key: z.string(),
  field: z.string(),
  value: z.string(),
});

// Set operation schemas
export const SetAddSchema = z.object({
  key: z.string(),
  members: z.array(z.string()).min(1),
});

export const SetRemoveSchema = z.object({
  key: z.string(),
  members: z.array(z.string()).min(1),
});

export const SetIsMemberSchema = z.object({
  key: z.string(),
  member: z.string(),
});

export const SetMembersSchema = z.object({
  key: z.string(),
});

// Sorted set operation schemas
export const SortedSetAddSchema = z.object({
  key: z.string(),
  members: z.array(ScoredMemberSchema).min(1),
});

export const SortedSetRemoveSchema = z.object({
  key: z.string(),
  members: z.array(z.string()).min(1),
});

export const SortedSetRangeSchema = z.object({
  key: z.string(),
  start: z.number(),
  stop: z.number(),
  options: SortedSetRangeOptionsSchema,
});

export const SortedSetRangeByScoreSchema = z.object({
  key: z.string(),
  min: z.number(),
  max: z.number(),
  options: SortedSetRangeOptionsSchema,
});

export const SortedSetScoreSchema = z.object({
  key: z.string(),
  member: z.string(),
});

// Key operation schemas
export const DeleteSchema = z.object({
  key: z.string(),
});

export const ExistsSchema = z.object({
  key: z.string(),
});

export const TTLSchema = z.object({
  key: z.string(),
});

export const SetTTLSchema = z.object({
  key: z.string(),
  ttlSeconds: z.number().positive(),
});
