import { defineSettings } from "@getpaseo/plugin";
import { z } from "zod";
export const preferences = defineSettings({
  id: "display",
  scope: "host",
  version: 1,
  schema: z.object({
    language: z.enum(["system", "en", "zh-CN"]).default("system"),
  }),
});
