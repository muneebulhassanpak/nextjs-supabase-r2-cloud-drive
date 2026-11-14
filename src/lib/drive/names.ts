import { z } from "zod";

/**
 * The rules for file and folder names, the same as the database's `items_name_valid` check, so
 * people see why a name won't work before it's sent.
 */
export const itemNameSchema = z
  .string()
  .trim()
  .min(1, "Enter a name.")
  .max(255, "Keep it under 255 characters.")
  .refine((name) => !name.includes("/"), { message: "Names can't contain “/”." })

  .refine((name) => !/[\u0000-\u001f\u007f]/.test(name), {
    message: "Names can't contain control characters.",
  })
  .refine((name) => name !== "." && name !== "..", { message: "That name is reserved." });

/** Most items one trash request takes; the browser sends bigger selections in batches. */
export const TRASH_BATCH_SIZE = 100;
