

## Problem: Excel Team Import Silently Fails

Two root causes:

### 1. No UNIQUE constraint on `email` column
The `upsert` call in `AdminControls.tsx` uses `onConflict: 'email'`, but the `employees` table has no `UNIQUE` constraint on the `email` column. Without this, the upsert cannot detect conflicts and the operation fails silently.

**Fix**: Add a database migration to create a unique constraint on `employees.email`.

### 2. RLS policies are RESTRICTIVE instead of PERMISSIVE
All RLS policies on the `employees` table are set to `RESTRICTIVE` (the `Permissive: No` in the policy listing). When multiple restrictive policies exist, ALL must pass. The `SELECT` policy with `USING (true)` combined with the `INSERT` policy requiring admin role — when both are restrictive, they conflict. The insert policy should be `PERMISSIVE` (which is the default for `CREATE POLICY`).

Looking at it more carefully, the policies were created without `AS RESTRICTIVE`, so they should be permissive by default. The display might just be showing metadata differently. The main issue is #1 — the missing unique constraint.

### 3. Error not surfaced to user
The code does `alert('Team imported successfully!')` even if individual upserts fail, because errors from individual `supabase.from('employees').upsert()` calls are not checked.

### Implementation Plan

1. **Database migration**: Add `UNIQUE` constraint on `employees.email`
2. **Code fix in `AdminControls.tsx`**: 
   - Check the `.error` response from each upsert call
   - Use batch upsert (single call with array) instead of looping one-by-one for better performance
   - Show accurate success/failure counts
   - Add flexible column detection for more robust Excel parsing

### Files to change
- **New migration SQL**: `ALTER TABLE public.employees ADD CONSTRAINT employees_email_unique UNIQUE (email);`
- **`src/components/AdminControls.tsx`**: Refactor `handleExcelImport` to batch upsert with error handling

