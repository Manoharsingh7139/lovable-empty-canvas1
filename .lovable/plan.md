

## Plan: Filter Manage Team list & exclude remote/long-leave from attendance

### Current State
- `displayEmployees` (line 404-408) already filters out remote and long-leave employees for the attendance grid
- The Manage Team section (line 882) reuses `displayEmployees`, so remote/long-leave employees are hidden there too — this needs to change

### Changes (all in `src/App.tsx`)

**1. Add a team filter state**
- New state: `teamFilter: 'all' | 'remote' | 'long-leave'` (default `'all'`)

**2. Compute filtered lists**
- `attendanceEmployees` — excludes remote + long-leave (current `displayEmployees` logic, used for grid/stats)
- `manageTeamEmployees` — filtered by `teamFilter` state:
  - `'all'` → all employees (minus admin email)
  - `'remote'` → only `workType === 'remote'`
  - `'long-leave'` → only `onLongLeave === true`
- Precompute counts: `remoteCount`, `longLeaveCount`, `allCount`

**3. Add circular filter buttons to Manage Team header**
- Three pill/circle buttons between the title and the add/import buttons:
  - **All** (count) — default selected
  - **Remote** (count)
  - **Long Leave** (count)
- Styled as small circular badges with counts, highlighted when active (emerald bg when selected, stone-100 otherwise)

**4. Use correct list in each context**
- Attendance grid + daily stats + employee stats → `attendanceEmployees`
- Manage Team member list → `manageTeamEmployees`
- Org chart + total employee counts → all employees (no filter)

