import { WindowState, WindowType } from "./window-types.ts";
import { z } from "zod";

const stateSchema = z.enum(Object.values(WindowState));
const typeSchema = z.enum(Object.values(WindowType));
const pixelSchema = z.number().int();
const sizeSchema = z.number().int().positive();

export const updateSchema = z.object({
  left: pixelSchema.optional(),
  top: pixelSchema.optional(),
  width: sizeSchema.optional(),
  height: sizeSchema.optional(),
  focused: z.boolean().optional(),
  drawAttention: z.boolean().optional(),
  state: stateSchema.optional()
});

export const createSchema = updateSchema.extend({
  url: z.union([z.string(), z.array(z.string())]).optional(),
  tabId: z.number().int().optional(),
  incognito: z.boolean().optional(),
  type: typeSchema.optional(),
  setSelfAsOpener: z.boolean().optional()
});

export const getInfoSchema = z.object({
  populate: z.boolean().optional(),
  windowTypes: z.array(typeSchema).optional()
}).optional();

export const windowIdSchema = z.number().int();
