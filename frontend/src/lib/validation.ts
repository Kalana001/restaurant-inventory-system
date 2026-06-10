import { z } from 'zod';

// --- Reusable field schemas ---
const emailField = z
  .string()
  .min(1, 'Email is required')
  .max(254, 'Email is too long')
  .email('Please enter a valid email address');

const passwordField = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password is too long');

const usernameField = z
  .string()
  .min(2, 'Username must be at least 2 characters')
  .max(50, 'Username must not exceed 50 characters')
  .regex(/^[a-zA-Z0-9_ ]+$/, 'Username can only contain letters, numbers, spaces, and underscores');

const nameField = (label: string) =>
  z.string().min(1, `${label} is required`).max(100, `${label} is too long`);

// --- Form schemas ---
export const loginSchema = z.object({
  email: emailField,
  password: z.string().min(1, 'Password is required').max(128),
});

export const createUserSchema = z.object({
  email: emailField,
  username: usernameField,
  password: passwordField,
  roleId: z.string().min(1, 'Role is required'),
  status: z.enum(['ACTIVE', 'INACTIVE']),
});

export const updateUserSchema = z.object({
  username: usernameField,
  password: z.string().max(128).optional().or(z.literal('')),
  roleId: z.string().min(1, 'Role is required'),
  status: z.enum(['ACTIVE', 'INACTIVE']),
});

export const inventoryItemSchema = z.object({
  name: nameField('Item name'),
  sku: z.string().max(50, 'SKU too long').optional().or(z.literal('')),
  description: z.string().max(500, 'Description too long').optional().or(z.literal('')),
  categoryId: z.string().min(1, 'Category is required'),
  baseUnitId: z.string().optional(),
  minStock: z.coerce.number().min(0, 'Min stock cannot be negative'),
  maxStock: z.coerce.number().min(0, 'Max stock cannot be negative'),
  reorderLevel: z.coerce.number().min(0, 'Reorder level cannot be negative'),
  costPrice: z.coerce.number().min(0, 'Cost price cannot be negative'),
  sellingPrice: z.coerce.number().min(0, 'Selling price cannot be negative'),
});

export const categorySchema = z.object({
  name: nameField('Category name'),
});

export const supplierSchema = z.object({
  name: nameField('Supplier name'),
  email: emailField.optional().or(z.literal('')),
  phone: z.string().max(20, 'Phone number too long').optional().or(z.literal('')),
});

// Utility: format zod errors into a single readable string
export function formatZodError(result: z.SafeParseReturnType<any, any>): string {
  if (result.success) return '';
  return result.error.issues.map(i => i.message).join('. ');
}

export type LoginInput = z.infer<typeof loginSchema>;
export type CreateUserInput = z.infer<typeof createUserSchema>;
export type InventoryItemInput = z.infer<typeof inventoryItemSchema>;
