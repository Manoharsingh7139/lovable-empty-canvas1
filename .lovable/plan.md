

## Migration Plan: Firebase Attendance Tracker to Lovable Cloud

### What the App Does
A **Team Attendance Tracker** with:
- Google sign-in authentication
- Employee management (CRUD, Excel import)
- Monthly attendance grid (in-office / WFH / leave)
- Holiday management
- Org insights with manager hierarchy
- 70% in-office threshold tracking
- Admin vs member roles

### Database Tables to Create

**1. `employees` table**
- `id` (uuid, PK, default gen_random_uuid())
- `user_id` (uuid, nullable, references auth.users — for linked accounts)
- `name` (text)
- `email` (text)
- `designation`, `function_l2`, `gender` (text, nullable)
- `reporting_manager_code`, `reporting_manager_name` (text, nullable)
- `reporting_managers_manager_code`, `reporting_managers_manager_name` (text, nullable)
- `level`, `level_code`, `job_band`, `band_code`, `manager` (text, nullable)
- `work_type` (text, default 'local')
- `on_long_leave` (boolean, default false)
- `created_at` (timestamptz)

**2. `attendance` table**
- `id` (text, PK — composite `{date}_{employee_id}`)
- `employee_id` (uuid, references employees)
- `date` (date)
- `status` (text — 'in-office', 'wfh', 'leave')
- `updated_at` (timestamptz)

**3. `holidays` table**
- `date` (date, PK)
- `name` (text)

**4. `user_roles` table** (for admin/member roles, per security guidelines)
- `id` (uuid, PK)
- `user_id` (uuid, references auth.users)
- `role` (app_role enum: 'admin', 'member')

Plus a `has_role` security definer function and RLS policies on all tables.

Enable realtime on `employees`, `attendance`, and `holidays` tables.

### Authentication
- Replace Firebase Google sign-in with **email/password auth** (Lovable Cloud built-in)
- On first sign-in, auto-create an employee profile
- Admin role assigned via `user_roles` table

### Code Changes

**New packages needed:** `xlsx`, `motion` (framer-motion replacement)

**Files to create/modify:**

1. **`src/App.tsx`** — Update routing to include auth pages and main dashboard
2. **`src/pages/Auth.tsx`** — Login/signup page with email/password
3. **`src/pages/Dashboard.tsx`** — Main attendance tracker (ported from the Firebase App.tsx)
4. **`src/components/AttendanceGrid.tsx`** — The master attendance grid
5. **`src/components/AdminControls.tsx`** — Member & holiday management
6. **`src/components/OrgInsights.tsx`** — Org insights section
7. **`src/components/EmployeeModals.tsx`** — View/edit/delete employee modals
8. **`src/hooks/useAuth.tsx`** — Auth context replacing Firebase `onAuthStateChanged`
9. **`src/hooks/useAttendanceData.tsx`** — Realtime subscriptions for employees, attendance, holidays
10. **`src/lib/attendance-utils.ts`** — Shared calculation logic (stats, working days, etc.)

### Key Migration Mappings

| Firebase | Lovable Cloud |
|---|---|
| `signInWithPopup(GoogleAuthProvider)` | `supabase.auth.signInWithPassword()` |
| `onAuthStateChanged` | `supabase.auth.onAuthStateChange` |
| `setDoc(doc(db, 'employees', id), data)` | `supabase.from('employees').upsert(data)` |
| `onSnapshot(collection(db, 'employees'))` | Supabase realtime subscription |
| `deleteDoc` | `supabase.from('table').delete()` |
| Admin check by hardcoded email | `user_roles` table with `has_role()` function |

### Implementation Order
1. Create database tables + RLS policies + realtime
2. Create auth context and login/signup page
3. Port the attendance tracker UI, replacing all Firebase calls with database queries
4. Add Excel import functionality (using `xlsx` package)
5. Wire up realtime subscriptions for live updates

### Technical Notes
- The original app is a single 1500-line file — we'll split it into ~10 well-organized files
- The `motion` package import (`motion/react`) maps to `framer-motion` — we'll use `framer-motion` which is Lovable-compatible
- The hardcoded admin email check (`virajaiitk@gmail.com`) will be replaced with proper role-based access
- Excel import will work client-side with the `xlsx` library, same as the original

