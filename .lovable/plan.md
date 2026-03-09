

## Analysis

The app is **still fully using Firebase** for both authentication and data (Firestore). The `src/App.tsx` imports Firebase auth (`signInWithEmailAndPassword`, `onAuthStateChanged`, etc.) and Firestore (`collection`, `onSnapshot`, `setDoc`, etc.). The switch to Supabase auth was never completed in the code.

Additionally, the `build:dev` script is missing from `package.json`.

## Plan

### 1. Fix build error — Add missing `build:dev` script
Add `"build:dev": "vite build --mode development"` to `package.json` scripts.

### 2. Switch authentication from Firebase to Supabase
Replace Firebase auth with Supabase auth throughout `src/App.tsx`:

- **Remove** Firebase auth imports (`signInWithEmailAndPassword`, `createUserWithEmailAndPassword`, `onAuthStateChanged`, `signOut`, `updateProfile`)
- **Import** `supabase` from `@/integrations/supabase/client`
- **Replace** `onAuthStateChanged` with `supabase.auth.onAuthStateChange` + `supabase.auth.getSession()`
- **Replace** `signInWithEmailAndPassword` with `supabase.auth.signInWithPassword`
- **Replace** `createUserWithEmailAndPassword` with `supabase.auth.signUp`
- **Replace** `signOut(auth)` with `supabase.auth.signOut()`
- **Update** the `User` type from Firebase to Supabase's `User` type
- **Update** profile loading to query from the Supabase `employees` table instead of Firestore
- **Check** admin role via the `user_roles` table and `has_role` function instead of hardcoded email

### 3. Switch data operations from Firestore to Supabase
Replace all Firestore reads/writes with Supabase queries:

- **Employees**: `supabase.from('employees').select('*')` instead of Firestore `onSnapshot`
- **Attendance**: `supabase.from('attendance').select('*')` instead of Firestore `onSnapshot`
- **Holidays**: `supabase.from('holidays').select('*')` instead of Firestore `onSnapshot`
- **Writes** (`setDoc` → `supabase.from('table').upsert(...)`)
- **Deletes** (`deleteDoc` → `supabase.from('table').delete().eq(...)`)
- For realtime updates, use Supabase Realtime channels subscribing to `postgres_changes`

### 4. Map field names to database columns
The Supabase `employees` table uses snake_case columns while the app uses camelCase. Create a mapping layer:
- `functionL2` → `function_l2`
- `reportingManagerCode` → `reporting_manager_code`
- `workType` → `work_type`
- `onLongLeave` → `on_long_leave`
- etc.

### 5. Remove Firebase dependency (optional cleanup)
- Remove `src/firebase.ts` import from App.tsx (keep the file for now in case other parts reference it)
- The Firebase package can remain installed but won't be used for auth/data

### Technical Notes
- The database already has the correct tables (`employees`, `attendance`, `holidays`, `user_roles`) with RLS policies
- A `handle_new_user` trigger exists but has no trigger attached — we should note this but the profile creation on signup should work via the app code
- The `has_role` function is available for admin checks
- Auth logs show a user (`manohar.singh@u-next.com`) has already logged in via Supabase, confirming the backend is ready

