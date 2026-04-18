import { z } from "zod";

import { confidenceSchema, timestampSchema } from "./primitives.js";

export const schemaVersionSchema = z.literal("1.0.0");

export const isoUtcSchema = timestampSchema;

export const localDateSchema = z.iso.date();

export const uuidSchema = z.uuid();

export const opaqueIdSchema = z.string().min(1);

export const sequenceNumberSchema = z.number().int().positive();

export const ratioSchema = confidenceSchema;

export const durationSecondsSchema = z.number().int().nonnegative();

export const severitySchema = z.enum(["info", "warning", "critical"]);

export const colorTokenSchema = z.enum(["green", "blue", "yellow", "red", "gray"]);

export const riskLevelSchema = z.enum(["low", "medium", "high"]);

export const progressKindSchema = z.enum([
  "time_based",
  "milestone_based",
  "artifact_based",
  "hybrid",
]);

export type SchemaVersion = z.infer<typeof schemaVersionSchema>;
export type IsoUtc = z.infer<typeof isoUtcSchema>;
export type LocalDate = z.infer<typeof localDateSchema>;
export type UUID = z.infer<typeof uuidSchema>;
export type OpaqueId = z.infer<typeof opaqueIdSchema>;
export type SequenceNumber = z.infer<typeof sequenceNumberSchema>;
export type Ratio = z.infer<typeof ratioSchema>;
export type DurationSeconds = z.infer<typeof durationSecondsSchema>;
export type Severity = z.infer<typeof severitySchema>;
export type ColorToken = z.infer<typeof colorTokenSchema>;
export type RiskLevel = z.infer<typeof riskLevelSchema>;
export type ProgressKind = z.infer<typeof progressKindSchema>;
