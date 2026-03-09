import React, { useState, useEffect, useMemo, Component, ReactNode } from 'react';
import { 
  auth, db, handleFirestoreError, OperationType 
} from './firebase';
import { 
  signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut, User 
} from 'firebase/auth';
import { 
  collection, doc, getDocs, setDoc, onSnapshot, query, where, Timestamp, deleteDoc
} from 'firebase/firestore';
import { 
  format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, 
  isAfter, isBefore, startOfDay, addDays, subDays, parseISO, isWeekend
} from 'date-fns';
import * as XLSX from 'xlsx';
import { 
  Users, Calendar, CheckCircle2, XCircle, AlertCircle, 
  LogOut, Shield, User as UserIcon, ChevronLeft, ChevronRight, ChevronDown,
  Home, Briefcase, Plane, Plus, Trash2, Info, Umbrella,
  FileSpreadsheet, Eye, Edit2, X
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Utility for tailwind classes
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Types
type AttendanceStatus = 'in-office' | 'wfh' | 'leave';

interface Employee {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'member';
  designation?: string;
  functionL2?: string;
  gender?: string;
  reportingManagerCode?: string;
  reportingManagerName?: string;
  reportingManagersManagerCode?: string;
  reportingManagersManagerName?: string;
  level?: string;
  levelCode?: string;
  jobBand?: string;
  bandCode?: string;
  manager?: string;
  workType?: 'local' | 'remote';
  onLongLeave?: boolean;
}

interface AttendanceRecord {
  employeeId: string;
  date: string; // YYYY-MM-DD
  status: AttendanceStatus;
  updatedAt: string;
}

interface Holiday {
  date: string;
  name: string;
}

// Error Boundary Component
interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: any;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  render() {
    const { hasError, error } = this.state;
    if (hasError) {
      let message = "Something went wrong.";
      try {
        const parsed = JSON.parse(error.message);
        if (parsed.error) message = parsed.error;
      } catch (e) {
        message = error?.message || message;
      }

      return (
        <div className="min-h-screen flex items-center justify-center bg-red-50 p-4">
          <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full border border-red-100">
            <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Application Error</h1>
            <p className="text-gray-600 mb-6">{message}</p>
            <button 
              onClick={() => window.location.reload()}
              className="w-full py-3 bg-red-600 text-white rounded-xl font-semibold hover:bg-red-700 transition-colors"
            >
              Reload Application
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const AttendanceTracker = () => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Employee | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [activeTab, setActiveTab] = useState<'grid' | 'org'>('grid');
  const [selectedManagerId, setSelectedManagerId] = useState<string | null>(null);
  const [teamFilter, setTeamFilter] = useState<'all' | 'remote' | 'long-leave'>('all');
  
  // UI States
  const [showAddMember, setShowAddMember] = useState(false);
  const [newMember, setNewMember] = useState({ 
    name: '', 
    email: '', 
    role: 'member' as const, 
    designation: '', 
    functionL2: '',
    gender: '',
    reportingManagerCode: '',
    reportingManagerName: '',
    reportingManagersManagerCode: '',
    reportingManagersManagerName: '',
    level: '',
    levelCode: '',
    jobBand: '', 
    bandCode: '',
    manager: '' 
  });
  const [showAddHoliday, setShowAddHoliday] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [viewingEmployee, setViewingEmployee] = useState<Employee | null>(null);
  const [deletingEmployee, setDeletingEmployee] = useState<Employee | null>(null);
  const [newHoliday, setNewHoliday] = useState({ date: format(new Date(), 'yyyy-MM-dd'), name: '' });

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        try {
          const employeeRef = doc(db, 'employees', u.uid);
          const snap = await getDocs(query(collection(db, 'employees'), where('id', '==', u.uid)));
          
          if (snap.empty) {
            const newProfile: Employee = {
              id: u.uid,
              name: u.displayName || 'Anonymous',
              email: u.email || '',
              role: u.email === 'virajaiitk@gmail.com' ? 'admin' : 'member'
            };
            await setDoc(employeeRef, newProfile);
            setProfile(newProfile);
          } else {
            setProfile(snap.docs[0].data() as Employee);
          }
        } catch (error) {
          handleFirestoreError(error, OperationType.GET, 'employees');
        }
      } else {
        setProfile(null);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Data Listeners
  useEffect(() => {
    if (!user) return;

    const unsubEmployees = onSnapshot(collection(db, 'employees'), (snap) => {
      setEmployees(snap.docs.map(doc => doc.data() as Employee));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'employees'));

    const unsubAttendance = onSnapshot(collection(db, 'attendance'), (snap) => {
      setAttendance(snap.docs.map(doc => doc.data() as AttendanceRecord));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'attendance'));

    const unsubHolidays = onSnapshot(collection(db, 'holidays'), (snap) => {
      setHolidays(snap.docs.map(doc => doc.data() as Holiday));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'holidays'));

    return () => {
      unsubEmployees();
      unsubAttendance();
      unsubHolidays();
    };
  }, [user]);

  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Login failed", error);
    }
  };

  const handleLogout = () => signOut(auth);

  const markAttendance = async (employeeId: string, date: Date, status: AttendanceStatus) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    const recordId = `${dateStr}_${employeeId}`;
    const record: AttendanceRecord = {
      employeeId,
      date: dateStr,
      status,
      updatedAt: new Date().toISOString()
    };

    try {
      await setDoc(doc(db, 'attendance', recordId), record);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `attendance/${recordId}`);
    }
  };

  const updateEmployee = async (emp: Employee) => {
    try {
      await setDoc(doc(db, 'employees', emp.id), emp);
      setEditingEmployee(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `employees/${emp.id}`);
    }
  };

  const addManualMember = async () => {
    if (!newMember.name || !newMember.email) return;
    const id = `manual_${Date.now()}`;
    const employee: Employee = {
      id,
      name: newMember.name,
      email: newMember.email,
      role: newMember.role,
      designation: newMember.designation,
      functionL2: newMember.functionL2,
      gender: newMember.gender,
      reportingManagerCode: newMember.reportingManagerCode,
      reportingManagerName: newMember.reportingManagerName,
      reportingManagersManagerCode: newMember.reportingManagersManagerCode,
      reportingManagersManagerName: newMember.reportingManagersManagerName,
      level: newMember.level,
      levelCode: newMember.levelCode,
      jobBand: newMember.jobBand,
      bandCode: newMember.bandCode,
      manager: newMember.manager
    };
    try {
      await setDoc(doc(db, 'employees', id), employee);
      setShowAddMember(false);
      setNewMember({ 
        name: '', 
        email: '', 
        role: 'member', 
        designation: '', 
        functionL2: '',
        gender: '',
        reportingManagerCode: '',
        reportingManagerName: '',
        reportingManagersManagerCode: '',
        reportingManagersManagerName: '',
        level: '',
        levelCode: '',
        jobBand: '', 
        bandCode: '',
        manager: '' 
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `employees/${id}`);
    }
  };

  const deleteMember = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'employees', id));
      setDeletingEmployee(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `employees/${id}`);
    }
  };

  const addHoliday = async () => {
    if (!newHoliday.date || !newHoliday.name) return;
    try {
      await setDoc(doc(db, 'holidays', newHoliday.date), newHoliday);
      setShowAddHoliday(false);
      setNewHoliday({ date: format(new Date(), 'yyyy-MM-dd'), name: '' });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `holidays/${newHoliday.date}`);
    }
  };

  const deleteHoliday = async (date: string) => {
    try {
      await deleteDoc(doc(db, 'holidays', date));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `holidays/${date}`);
    }
  };

  const handleExcelImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws) as any[];

        for (const row of data) {
          const rawEmail = row.Email || row.email;
          if (!rawEmail) continue;
          const email = String(rawEmail).trim().toLowerCase();

          // Generate a deterministic ID from email for manual imports
          const id = `manual_${btoa(email).replace(/=/g, '')}`;
          const newEmp: Employee = {
            id,
            name: String(row.Employee_Name || row.Name || row.name || 'Unknown').trim(),
            email: email,
            role: ['admin', 'member'].includes(String(row.Role || row.role || '').toLowerCase()) 
              ? String(row.Role || row.role).toLowerCase() as 'admin' | 'member'
              : 'member',
            designation: String(row.Designation || row.designation || '').trim(),
            functionL2: String(row['Function(L2)'] || '').trim(),
            gender: String(row.Gender || '').trim(),
            reportingManagerCode: String(row.ReportingManager_Code || '').trim(),
            reportingManagerName: String(row.ReportingManager_Name || '').trim(),
            reportingManagersManagerCode: String(row.ReportingManagersManagerCode || '').trim(),
            reportingManagersManagerName: String(row.ReportingManagersManagerName || '').trim(),
            level: String(row.Level || '').trim(),
            levelCode: String(row.Level_Code || '').trim(),
            jobBand: String(row.Band || row.JobBand || row.jobBand || row['Job Band'] || '').trim(),
            bandCode: String(row.Band_Code || '').trim(),
            manager: String(row.ReportingManager_Name || row.Manager || row.manager || '').trim()
          };

          try {
            await setDoc(doc(db, 'employees', id), newEmp);
          } catch (err) {
            handleFirestoreError(err, OperationType.WRITE, `employees/${id}`);
          }
        }
        alert('Team imported successfully!');
      } catch (error) {
        console.error('Error importing Excel:', error);
        alert('Failed to import Excel file. Please check the format.');
      }
    };
    reader.readAsBinaryString(file);
  };

  // Calculations
  const daysInMonth = useMemo(() => {
    return eachDayOfInterval({
      start: startOfMonth(currentMonth),
      end: endOfMonth(currentMonth)
    });
  }, [currentMonth]);

  const isHoliday = (date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return holidays.some(h => h.date === dateStr);
  };

  const isWorkingDay = (date: Date) => {
    return !isWeekend(date) && !isHoliday(date);
  };

  const getAttendanceStatus = (employeeId: string, date: Date): AttendanceStatus | 'weekend' | 'holiday' | 'unmarked' => {
    if (isWeekend(date)) return 'weekend';
    if (isHoliday(date)) return 'holiday';

    const dateStr = format(date, 'yyyy-MM-dd');
    const record = attendance.find(a => a.employeeId === employeeId && a.date === dateStr);
    if (record) return record.status;
    
    return 'unmarked';
  };

  // For attendance grid: exclude remote & long-leave
  const attendanceEmployees = useMemo(() => {
    return employees
      .filter(emp => emp.email !== 'virajaiitk@gmail.com' && emp.workType !== 'remote' && !emp.onLongLeave)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [employees]);

  // For manage team: filter by teamFilter state
  const allTeamEmployees = useMemo(() => {
    return employees.filter(emp => emp.email !== 'virajaiitk@gmail.com').sort((a, b) => a.name.localeCompare(b.name));
  }, [employees]);

  const remoteCount = useMemo(() => allTeamEmployees.filter(e => e.workType === 'remote').length, [allTeamEmployees]);
  const longLeaveCount = useMemo(() => allTeamEmployees.filter(e => e.onLongLeave).length, [allTeamEmployees]);

  const manageTeamEmployees = useMemo(() => {
    if (teamFilter === 'remote') return allTeamEmployees.filter(e => e.workType === 'remote');
    if (teamFilter === 'long-leave') return allTeamEmployees.filter(e => e.onLongLeave);
    return allTeamEmployees;
  }, [allTeamEmployees, teamFilter]);

  const dailyStats = useMemo(() => {
    return daysInMonth.map(date => {
      const status = isWeekend(date) ? 'weekend' : isHoliday(date) ? 'holiday' : 'workday';
      
      if (status !== 'workday') {
        return { date, percentage: 0, isBelowThreshold: false, type: status };
      }

      const statuses = attendanceEmployees.map(e => getAttendanceStatus(e.id, date));
      const inOfficeCount = statuses.filter(s => s === 'in-office' || s === 'unmarked').length;
      const percentage = attendanceEmployees.length > 0 ? (inOfficeCount / attendanceEmployees.length) * 100 : 0;
      return {
        date,
        percentage,
        isBelowThreshold: percentage < 70,
        type: 'workday'
      };
    });
  }, [daysInMonth, displayEmployees, attendance, holidays]);

  const employeeStats = useMemo(() => {
    const workingDays = daysInMonth.filter(isWorkingDay);
    return displayEmployees.map(emp => {
      const statuses = workingDays.map(date => getAttendanceStatus(emp.id, date));
      const inOfficeCount = statuses.filter(s => s === 'in-office' || s === 'unmarked').length;
      const percentage = workingDays.length > 0 ? (inOfficeCount / workingDays.length) * 100 : 0;
      return {
        ...emp,
        percentage,
        isBelowThreshold: percentage < 70
      };
    });
  }, [daysInMonth, displayEmployees, attendance, holidays]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50">
        <motion.div 
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full"
        />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-stone-50 flex flex-col items-center justify-center p-6">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full bg-white p-10 rounded-[2rem] shadow-2xl shadow-stone-200/50 text-center border border-stone-100"
        >
          <div className="w-20 h-20 bg-emerald-50 rounded-3xl flex items-center justify-center mx-auto mb-8">
            <Users className="w-10 h-10 text-emerald-600" />
          </div>
          <h1 className="text-4xl font-bold text-stone-900 mb-4 tracking-tight">Team Attendance</h1>
          <p className="text-stone-500 mb-10 leading-relaxed">
            Track daily attendance, monitor thresholds, and ensure team compliance with ease.
          </p>
          <button 
            onClick={handleLogin}
            className="w-full py-4 bg-stone-900 text-white rounded-2xl font-semibold hover:bg-stone-800 transition-all active:scale-95 flex items-center justify-center gap-3 shadow-lg shadow-stone-900/20"
          >
            <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-6 h-6" alt="Google" />
            Sign in with Google
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900 font-sans pb-20">
      {/* Header */}
      <header className="bg-white border-b border-stone-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-emerald-600 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-600/20">
              <Users className="text-white w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">Attendance Tracker</h1>
              <p className="text-xs text-stone-400 font-medium uppercase tracking-wider">Team Compliance Dashboard</p>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="hidden sm:flex flex-col items-end">
              <span className="text-sm font-semibold">{profile?.name}</span>
              <span className="text-xs text-stone-400 capitalize">{profile?.role}</span>
            </div>
            <button 
              onClick={handleLogout}
              className="p-2 hover:bg-stone-100 rounded-lg text-stone-400 hover:text-red-500 transition-colors"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Month Selector */}
        <div className="bg-white p-6 rounded-3xl border border-stone-200 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setCurrentMonth(subDays(startOfMonth(currentMonth), 1))}
              className="p-2 hover:bg-stone-100 rounded-xl transition-colors"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
            <h2 className="text-2xl font-bold min-w-[180px] text-center">
              {format(currentMonth, 'MMMM yyyy')}
            </h2>
            <button 
              onClick={() => setCurrentMonth(addDays(endOfMonth(currentMonth), 1))}
              className="p-2 hover:bg-stone-100 rounded-xl transition-colors"
            >
              <ChevronRight className="w-6 h-6" />
            </button>
          </div>
            <div className="flex gap-2">
              <div className="px-4 py-2 bg-emerald-50 text-emerald-700 rounded-xl text-sm font-semibold border border-emerald-100">
                Threshold: 70%
              </div>
              <div className="px-4 py-2 bg-stone-100 text-stone-600 rounded-xl text-sm font-semibold">
                {displayEmployees.length} Employees
              </div>
            </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex p-1 bg-stone-200/50 rounded-2xl w-fit">
          <button
            onClick={() => setActiveTab('grid')}
            className={cn(
              "px-6 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2",
              activeTab === 'grid' 
                ? "bg-white text-stone-900 shadow-sm" 
                : "text-stone-500 hover:text-stone-700"
            )}
          >
            <Calendar className="w-4 h-4" />
            Master Grid
          </button>
          <button
            onClick={() => setActiveTab('org')}
            className={cn(
              "px-6 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2",
              activeTab === 'org' 
                ? "bg-white text-stone-900 shadow-sm" 
                : "text-stone-500 hover:text-stone-700"
            )}
          >
            <Users className="w-4 h-4" />
            Org Insights
          </button>
        </div>

        {activeTab === 'grid' ? (
          <>
            {/* Master Attendance Grid */}
            <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold flex items-center gap-2">
              <Calendar className="w-5 h-5 text-emerald-600" />
              Attendance Master Grid
            </h3>
            <div className="flex gap-3">
              <div className="flex items-center gap-1.5 text-[10px] font-bold text-stone-400 uppercase">
                <div className="w-3 h-3 bg-emerald-500 rounded-sm" /> In-Office
              </div>
              <div className="flex items-center gap-1.5 text-[10px] font-bold text-stone-400 uppercase">
                <div className="w-3 h-3 bg-blue-500 rounded-sm" /> WFH
              </div>
              <div className="flex items-center gap-1.5 text-[10px] font-bold text-stone-400 uppercase">
                <div className="w-3 h-3 bg-orange-500 rounded-sm" /> Leave
              </div>
              <div className="flex items-center gap-1.5 text-[10px] font-bold text-stone-400 uppercase">
                <div className="w-3 h-3 bg-stone-200 rounded-sm" /> Weekend/Holiday
              </div>
            </div>
          </div>

          <div className="bg-white rounded-3xl border border-stone-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-max">
                <thead>
                  <tr className="bg-stone-50/50 border-b border-stone-100">
                    <th className="sticky left-0 z-20 bg-stone-50/50 px-6 py-4 text-xs font-bold text-stone-400 uppercase tracking-widest border-r border-stone-100">Employee</th>
                    <th className="px-4 py-4 text-xs font-bold text-stone-400 uppercase tracking-widest border-r border-stone-100 text-center">Avg</th>
                    {daysInMonth.map((date, i) => (
                      <th 
                        key={i} 
                        className={cn(
                          "px-2 py-4 text-[10px] font-bold text-center min-w-[40px] border-r border-stone-100 last:border-r-0",
                          isWeekend(date) || isHoliday(date) ? "bg-stone-100/50 text-stone-300" : "text-stone-400"
                        )}
                      >
                        <div className="uppercase">{format(date, 'EEE')}</div>
                        <div className="text-sm">{format(date, 'dd')}</div>
                      </th>
                    ))}
                  </tr>
                  {/* Team Daily Stats Row */}
                  <tr className="bg-stone-50/30 border-b border-stone-100">
                    <td className="sticky left-0 z-10 bg-stone-50/30 px-6 py-3 border-r border-stone-100">
                      <div className="flex items-center gap-2">
                        <Users className="w-4 h-4 text-emerald-600" />
                        <span className="text-xs font-bold text-stone-600">Team Daily %</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 border-r border-stone-100 text-center">
                      {/* Empty for Avg column in team row */}
                    </td>
                    {dailyStats.map((stat, i) => (
                      <td 
                        key={i} 
                        className={cn(
                          "px-1 py-3 border-r border-stone-100 last:border-r-0 text-center",
                          stat.type !== 'workday' && "bg-stone-100/20"
                        )}
                      >
                        {stat.type === 'workday' && (
                          <span className={cn(
                            "text-[10px] font-black px-1.5 py-0.5 rounded-md",
                            stat.isBelowThreshold ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"
                          )}>
                            {Math.round(stat.percentage)}%
                          </span>
                        )}
                      </td>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {employeeStats.map((emp) => (
                    <tr key={emp.id} className="hover:bg-stone-50/50 transition-colors group">
                      <td className="sticky left-0 z-10 bg-white group-hover:bg-stone-50 transition-colors px-6 py-4 border-r border-stone-100">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-stone-100 rounded-full flex items-center justify-center text-stone-500 font-bold text-xs">
                            {emp.name.charAt(0)}
                          </div>
                          <div>
                            <p className="text-sm font-bold text-stone-900 leading-none">{emp.name}</p>
                            <p className="text-[10px] text-stone-400 mt-1">{emp.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4 border-r border-stone-100 text-center">
                        <span className={cn(
                          "text-xs font-black px-2 py-1 rounded-lg",
                          emp.isBelowThreshold ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-600"
                        )}>
                          {Math.round(emp.percentage)}%
                        </span>
                      </td>
                      {daysInMonth.map((date, i) => {
                        const status = getAttendanceStatus(emp.id, date);
                        const isWorkDay = isWorkingDay(date);
                        const canEdit = (profile?.role === 'admin' || emp.id === user.uid) && isWorkDay;
                        
                        return (
                          <td 
                            key={i} 
                            className={cn(
                              "p-1 border-r border-stone-100 last:border-r-0 text-center",
                              !isWorkDay && "bg-stone-50/30"
                            )}
                          >
                            <div className="relative flex items-center justify-center group/cell">
                              {status === 'weekend' || status === 'holiday' ? (
                                <div className="w-6 h-6 rounded-md flex items-center justify-center">
                                  {status === 'holiday' && <Umbrella className="w-3 h-3 text-stone-300" />}
                                </div>
                              ) : (
                                <button
                                  disabled={!canEdit}
                                  onClick={() => {
                                    if (!canEdit) return;
                                    const nextStatus: Record<AttendanceStatus | 'unmarked', AttendanceStatus> = {
                                      'unmarked': 'wfh',
                                      'in-office': 'wfh',
                                      'wfh': 'leave',
                                      'leave': 'in-office'
                                    };
                                    markAttendance(emp.id, date, nextStatus[status as AttendanceStatus | 'unmarked']);
                                  }}
                                  className={cn(
                                    "w-8 h-8 rounded-lg flex items-center justify-center transition-all",
                                    status === 'in-office' && "bg-emerald-500 text-white shadow-sm shadow-emerald-500/20",
                                    status === 'wfh' && "bg-blue-500 text-white shadow-sm shadow-blue-500/20",
                                    status === 'leave' && "bg-orange-500 text-white shadow-sm shadow-orange-500/20",
                                    status === 'unmarked' && "bg-stone-100/50 text-stone-300",
                                    canEdit && "hover:scale-110 active:scale-90 cursor-pointer",
                                    !canEdit && "opacity-80"
                                  )}
                                >
                                  {status === 'in-office' && <Briefcase className="w-4 h-4" />}
                                  {status === 'wfh' && <Home className="w-4 h-4" />}
                                  {status === 'leave' && <Plane className="w-4 h-4" />}
                                  {status === 'unmarked' && <div className="w-1 h-1 bg-stone-300 rounded-full" />}
                                </button>
                              )}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* Admin Controls */}
        {profile?.role === 'admin' && (
          <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Manage Members */}
            <div className="bg-white p-6 rounded-3xl border border-stone-200 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-bold flex items-center gap-2">
                  <UserIcon className="w-5 h-5 text-emerald-600" />
                  Manage Team
                </h3>
                <div className="flex items-center gap-2">
                  <label className="p-2 bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-100 transition-colors cursor-pointer" title="Import from Excel">
                    <FileSpreadsheet className="w-5 h-5" />
                    <input 
                      type="file" 
                      accept=".xlsx, .xls" 
                      className="hidden" 
                      onChange={handleExcelImport}
                    />
                  </label>
                  <button 
                    onClick={() => setShowAddMember(!showAddMember)}
                    className="p-2 bg-emerald-50 text-emerald-600 rounded-xl hover:bg-emerald-100 transition-colors"
                  >
                    <Plus className="w-5 h-5" />
                  </button>
                </div>
              </div>

              <AnimatePresence>
                {showAddMember && (
                  <motion.div 
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden space-y-3 bg-stone-50 p-4 rounded-2xl border border-stone-100"
                  >
                    <input 
                      placeholder="Name"
                      value={newMember.name}
                      onChange={e => setNewMember({...newMember, name: e.target.value})}
                      className="w-full px-4 py-2 bg-white border border-stone-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                    <input 
                      placeholder="Email"
                      value={newMember.email}
                      onChange={e => setNewMember({...newMember, email: e.target.value})}
                      className="w-full px-4 py-2 bg-white border border-stone-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <input 
                        placeholder="Designation"
                        value={newMember.designation}
                        onChange={e => setNewMember({...newMember, designation: e.target.value})}
                        className="px-4 py-2 bg-white border border-stone-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                      <input 
                        placeholder="Function (L2)"
                        value={newMember.functionL2}
                        onChange={e => setNewMember({...newMember, functionL2: e.target.value})}
                        className="px-4 py-2 bg-white border border-stone-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <input 
                        placeholder="Job Band"
                        value={newMember.jobBand}
                        onChange={e => setNewMember({...newMember, jobBand: e.target.value})}
                        className="px-4 py-2 bg-white border border-stone-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                      <input 
                        placeholder="Band Code"
                        value={newMember.bandCode}
                        onChange={e => setNewMember({...newMember, bandCode: e.target.value})}
                        className="px-4 py-2 bg-white border border-stone-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <input 
                        placeholder="Level"
                        value={newMember.level}
                        onChange={e => setNewMember({...newMember, level: e.target.value})}
                        className="px-4 py-2 bg-white border border-stone-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                      <input 
                        placeholder="Level Code"
                        value={newMember.levelCode}
                        onChange={e => setNewMember({...newMember, levelCode: e.target.value})}
                        className="px-4 py-2 bg-white border border-stone-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <input 
                        placeholder="Reporting Manager"
                        value={newMember.reportingManagerName}
                        onChange={e => setNewMember({...newMember, reportingManagerName: e.target.value})}
                        className="px-4 py-2 bg-white border border-stone-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                      <input 
                        placeholder="RM Code"
                        value={newMember.reportingManagerCode}
                        onChange={e => setNewMember({...newMember, reportingManagerCode: e.target.value})}
                        className="px-4 py-2 bg-white border border-stone-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <input 
                        placeholder="Manager's Manager"
                        value={newMember.reportingManagersManagerName}
                        onChange={e => setNewMember({...newMember, reportingManagersManagerName: e.target.value})}
                        className="px-4 py-2 bg-white border border-stone-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                      <input 
                        placeholder="MM Code"
                        value={newMember.reportingManagersManagerCode}
                        onChange={e => setNewMember({...newMember, reportingManagersManagerCode: e.target.value})}
                        className="px-4 py-2 bg-white border border-stone-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <input 
                        placeholder="Manager"
                        value={newMember.manager}
                        onChange={e => setNewMember({...newMember, manager: e.target.value})}
                        className="px-4 py-2 bg-white border border-stone-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                      <input 
                        placeholder="Gender"
                        value={newMember.gender}
                        onChange={e => setNewMember({...newMember, gender: e.target.value})}
                        className="px-4 py-2 bg-white border border-stone-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>
                    <div className="flex gap-2">
                      <select 
                        value={newMember.role}
                        onChange={e => setNewMember({...newMember, role: e.target.value as any})}
                        className="flex-1 px-4 py-2 bg-white border border-stone-200 rounded-xl text-sm outline-none"
                      >
                        <option value="member">Member</option>
                        <option value="admin">Admin</option>
                      </select>
                      <button 
                        onClick={addManualMember}
                        className="px-6 py-2 bg-emerald-600 text-white rounded-xl text-sm font-bold"
                      >
                        Add
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="max-h-60 overflow-y-auto space-y-2 pr-2">
                {displayEmployees.map(emp => (
                  <div 
                    key={emp.id} 
                    onClick={() => setEditingEmployee(emp)}
                    className="flex items-center justify-between p-3 bg-stone-50 rounded-2xl group cursor-pointer hover:bg-stone-100 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-white rounded-full flex items-center justify-center text-xs font-bold text-stone-400">
                        {emp.name.charAt(0)}
                      </div>
                      <div>
                        <p className="text-sm font-bold">{emp.name}</p>
                        <p className="text-[10px] text-stone-400">{emp.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeletingEmployee(emp);
                        }}
                        className="p-2 text-stone-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                        title="Delete Member"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Manage Holidays */}
            <div className="bg-white p-6 rounded-3xl border border-stone-200 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-bold flex items-center gap-2">
                  <Umbrella className="w-5 h-5 text-emerald-600" />
                  Official Holidays
                </h3>
                <button 
                  onClick={() => setShowAddHoliday(!showAddHoliday)}
                  className="p-2 bg-emerald-50 text-emerald-600 rounded-xl hover:bg-emerald-100 transition-colors"
                >
                  <Plus className="w-5 h-5" />
                </button>
              </div>

              <AnimatePresence>
                {showAddHoliday && (
                  <motion.div 
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden space-y-3 bg-stone-50 p-4 rounded-2xl border border-stone-100"
                  >
                    <input 
                      type="date"
                      value={newHoliday.date}
                      onChange={e => setNewHoliday({...newHoliday, date: e.target.value})}
                      className="w-full px-4 py-2 bg-white border border-stone-200 rounded-xl text-sm outline-none"
                    />
                    <div className="flex gap-2">
                      <input 
                        placeholder="Holiday Name"
                        value={newHoliday.name}
                        onChange={e => setNewHoliday({...newHoliday, name: e.target.value})}
                        className="flex-1 px-4 py-2 bg-white border border-stone-200 rounded-xl text-sm outline-none"
                      />
                      <button 
                        onClick={addHoliday}
                        className="px-6 py-2 bg-emerald-600 text-white rounded-xl text-sm font-bold"
                      >
                        Add
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="max-h-60 overflow-y-auto space-y-2 pr-2">
                {holidays.sort((a,b) => a.date.localeCompare(b.date)).map(h => (
                  <div key={h.date} className="flex items-center justify-between p-3 bg-stone-50 rounded-2xl group">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-emerald-100 rounded-lg flex items-center justify-center">
                        <Umbrella className="w-4 h-4 text-emerald-600" />
                      </div>
                      <div>
                        <p className="text-sm font-bold">{h.name}</p>
                        <p className="text-[10px] text-stone-400">{format(parseISO(h.date), 'MMM dd, yyyy')}</p>
                      </div>
                    </div>
                    <button 
                      onClick={() => deleteHoliday(h.date)}
                      className="p-2 text-stone-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                {holidays.length === 0 && (
                  <div className="text-center py-8 text-stone-400 text-sm italic">
                    No holidays added for this period
                  </div>
                )}
              </div>
            </div>
          </section>
        )}
          </>
        ) : (
          <OrgInsightsSection 
            employees={displayEmployees}
            attendance={attendance}
            daysInMonth={daysInMonth}
            isWorkingDay={isWorkingDay}
            getAttendanceStatus={getAttendanceStatus}
            selectedManagerId={selectedManagerId}
            setSelectedManagerId={setSelectedManagerId}
          />
        )}
      </main>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {deletingEmployee && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-stone-900/40 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white w-full max-w-md rounded-[2rem] shadow-2xl overflow-hidden border border-stone-100"
            >
              <div className="p-8 text-center space-y-4">
                <div className="w-16 h-16 bg-red-100 rounded-2xl flex items-center justify-center text-red-600 mx-auto">
                  <Trash2 className="w-8 h-8" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-xl font-bold text-stone-900">Remove Team Member?</h3>
                  <p className="text-stone-500 text-sm">
                    Are you sure you want to remove <span className="font-bold text-stone-700">{deletingEmployee.name}</span>? This action cannot be undone.
                  </p>
                </div>
              </div>
              <div className="p-6 bg-stone-50 border-t border-stone-100 flex gap-3">
                <button 
                  onClick={() => deleteMember(deletingEmployee.id)}
                  className="flex-1 py-3 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 transition-all shadow-lg shadow-red-600/20"
                >
                  Delete
                </button>
                <button 
                  onClick={() => setDeletingEmployee(null)}
                  className="flex-1 py-3 bg-white text-stone-600 border border-stone-200 rounded-xl font-bold hover:bg-stone-100 transition-all"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* View Employee Modal */}
      <AnimatePresence>
        {viewingEmployee && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/40 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white w-full max-w-2xl rounded-[2.5rem] shadow-2xl overflow-hidden border border-stone-100"
            >
              <div className="p-8 border-b border-stone-100 flex items-center justify-between bg-stone-50/50">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 bg-emerald-100 rounded-2xl flex items-center justify-center text-emerald-600 font-bold text-2xl">
                    {viewingEmployee.name.charAt(0)}
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold text-stone-900">{viewingEmployee.name}</h3>
                    <p className="text-stone-500">{viewingEmployee.designation || 'No Designation'}</p>
                  </div>
                </div>
                <button 
                  onClick={() => setViewingEmployee(null)}
                  className="p-2 hover:bg-stone-200 rounded-xl transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
              <div className="p-8 grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-1">
                  <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Email Address</p>
                  <p className="text-sm font-medium text-stone-700">{viewingEmployee.email}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Role</p>
                  <p className="text-sm font-medium text-stone-700 capitalize">{viewingEmployee.role}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Function (L2)</p>
                  <p className="text-sm font-medium text-stone-700">{viewingEmployee.functionL2 || '-'}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Gender</p>
                  <p className="text-sm font-medium text-stone-700">{viewingEmployee.gender || '-'}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Reporting Manager</p>
                  <p className="text-sm font-medium text-stone-700">{viewingEmployee.reportingManagerName || '-'}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Manager's Manager</p>
                  <p className="text-sm font-medium text-stone-700">{viewingEmployee.reportingManagersManagerName || '-'}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Job Band</p>
                  <p className="text-sm font-medium text-stone-700">{viewingEmployee.jobBand || '-'}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Band Code</p>
                  <p className="text-sm font-medium text-stone-700">{viewingEmployee.bandCode || '-'}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Level</p>
                  <p className="text-sm font-medium text-stone-700">{viewingEmployee.level || '-'}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Level Code</p>
                  <p className="text-sm font-medium text-stone-700">{viewingEmployee.levelCode || '-'}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Reporting Manager Code</p>
                  <p className="text-sm font-medium text-stone-700">{viewingEmployee.reportingManagerCode || '-'}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Manager's Manager Code</p>
                  <p className="text-sm font-medium text-stone-700">{viewingEmployee.reportingManagersManagerCode || '-'}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Manager</p>
                  <p className="text-sm font-medium text-stone-700">{viewingEmployee.manager || '-'}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Work Type</p>
                  <p className="text-sm font-medium text-stone-700 capitalize">{viewingEmployee.workType || 'local'}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Long Leave</p>
                  <p className="text-sm font-medium text-stone-700">{viewingEmployee.onLongLeave ? 'Yes' : 'No'}</p>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Edit Employee Modal */}
      <AnimatePresence>
        {editingEmployee && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/40 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white w-full max-w-2xl rounded-[2.5rem] shadow-2xl overflow-hidden border border-stone-100"
            >
              <div className="p-8 border-b border-stone-100 flex items-center justify-between">
                <h3 className="text-2xl font-bold text-stone-900">Edit Employee</h3>
                <button 
                  onClick={() => setEditingEmployee(null)}
                  className="p-2 hover:bg-stone-100 rounded-xl transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
              <div className="p-8 max-h-[70vh] overflow-y-auto space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Name</label>
                    <input 
                      type="text" 
                      value={editingEmployee.name}
                      onChange={(e) => setEditingEmployee({...editingEmployee, name: e.target.value})}
                      className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Email</label>
                    <input 
                      type="email" 
                      value={editingEmployee.email}
                      onChange={(e) => setEditingEmployee({...editingEmployee, email: e.target.value})}
                      className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Designation</label>
                    <input 
                      type="text" 
                      value={editingEmployee.designation || ''}
                      onChange={(e) => setEditingEmployee({...editingEmployee, designation: e.target.value})}
                      className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Role</label>
                    <select 
                      value={editingEmployee.role}
                      onChange={(e) => setEditingEmployee({...editingEmployee, role: e.target.value as 'admin' | 'member'})}
                      className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                    >
                      <option value="member">Member</option>
                      <option value="admin">Admin</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Function (L2)</label>
                    <input 
                      type="text" 
                      value={editingEmployee.functionL2 || ''}
                      onChange={(e) => setEditingEmployee({...editingEmployee, functionL2: e.target.value})}
                      className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Job Band</label>
                    <input 
                      type="text" 
                      value={editingEmployee.jobBand || ''}
                      onChange={(e) => setEditingEmployee({...editingEmployee, jobBand: e.target.value})}
                      className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Reporting Manager</label>
                    <input 
                      type="text" 
                      value={editingEmployee.reportingManagerName || ''}
                      onChange={(e) => setEditingEmployee({...editingEmployee, reportingManagerName: e.target.value})}
                      className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Reporting Manager Code</label>
                    <input 
                      type="text" 
                      value={editingEmployee.reportingManagerCode || ''}
                      onChange={(e) => setEditingEmployee({...editingEmployee, reportingManagerCode: e.target.value})}
                      className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Manager's Manager</label>
                    <input 
                      type="text" 
                      value={editingEmployee.reportingManagersManagerName || ''}
                      onChange={(e) => setEditingEmployee({...editingEmployee, reportingManagersManagerName: e.target.value})}
                      className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Manager's Manager Code</label>
                    <input 
                      type="text" 
                      value={editingEmployee.reportingManagersManagerCode || ''}
                      onChange={(e) => setEditingEmployee({...editingEmployee, reportingManagersManagerCode: e.target.value})}
                      className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Level</label>
                    <input 
                      type="text" 
                      value={editingEmployee.level || ''}
                      onChange={(e) => setEditingEmployee({...editingEmployee, level: e.target.value})}
                      className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Level Code</label>
                    <input 
                      type="text" 
                      value={editingEmployee.levelCode || ''}
                      onChange={(e) => setEditingEmployee({...editingEmployee, levelCode: e.target.value})}
                      className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Band Code</label>
                    <input 
                      type="text" 
                      value={editingEmployee.bandCode || ''}
                      onChange={(e) => setEditingEmployee({...editingEmployee, bandCode: e.target.value})}
                      className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Gender</label>
                    <input 
                      type="text" 
                      value={editingEmployee.gender || ''}
                      onChange={(e) => setEditingEmployee({...editingEmployee, gender: e.target.value})}
                      className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Manager</label>
                    <input 
                      type="text" 
                      value={editingEmployee.manager || ''}
                      onChange={(e) => setEditingEmployee({...editingEmployee, manager: e.target.value})}
                      className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Work Type</label>
                    <div className="flex gap-4 p-1 bg-stone-50 border border-stone-200 rounded-xl">
                      <button
                        type="button"
                        onClick={() => setEditingEmployee({...editingEmployee, workType: 'local'})}
                        className={cn(
                          "flex-1 py-2 rounded-lg text-sm font-bold transition-all",
                          (editingEmployee.workType === 'local' || !editingEmployee.workType) 
                            ? "bg-white text-stone-900 shadow-sm" 
                            : "text-stone-400 hover:text-stone-600"
                        )}
                      >
                        Local
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingEmployee({...editingEmployee, workType: 'remote'})}
                        className={cn(
                          "flex-1 py-2 rounded-lg text-sm font-bold transition-all",
                          editingEmployee.workType === 'remote' 
                            ? "bg-white text-stone-900 shadow-sm" 
                            : "text-stone-400 hover:text-stone-600"
                        )}
                      >
                        Remote
                      </button>
                    </div>
                  </div>
                  <div className="space-y-2 flex items-center gap-3 pt-6">
                    <input 
                      type="checkbox" 
                      id="onLongLeave"
                      checked={editingEmployee.onLongLeave || false}
                      onChange={(e) => setEditingEmployee({...editingEmployee, onLongLeave: e.target.checked})}
                      className="w-5 h-5 rounded border-stone-300 text-emerald-600 focus:ring-emerald-500"
                    />
                    <label htmlFor="onLongLeave" className="text-xs font-bold text-stone-400 uppercase tracking-widest cursor-pointer">On Long Leave</label>
                  </div>
                </div>
              </div>
              <div className="p-8 bg-stone-50 border-t border-stone-100 flex gap-4">
                <button 
                  onClick={() => updateEmployee(editingEmployee)}
                  className="flex-1 py-4 bg-emerald-600 text-white rounded-2xl font-bold hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-600/20"
                >
                  Save Changes
                </button>
                <button 
                  onClick={() => setEditingEmployee(null)}
                  className="flex-1 py-4 bg-white text-stone-600 border border-stone-200 rounded-2xl font-bold hover:bg-stone-100 transition-all"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

const OrgInsightsSection = ({ 
  employees, 
  attendance, 
  daysInMonth, 
  isWorkingDay, 
  getAttendanceStatus,
  selectedManagerId,
  setSelectedManagerId
}: any) => {
  const managers = useMemo(() => {
    const managerNames = new Set(employees.map(e => e.reportingManagerName).filter(Boolean));
    return employees.filter(e => managerNames.has(e.name)).sort((a,b) => a.name.localeCompare(b.name));
  }, [employees]);

  const getDirectReports = (managerName: string) => {
    return employees.filter(e => e.reportingManagerName === managerName);
  };

  const getSubOrgAttendance = (managerName: string, date: Date, depth = 0): any[] => {
    if (depth >= 2) return [];
    const directs = getDirectReports(managerName);
    let statuses = directs.map(d => getAttendanceStatus(d.id, date));
    
    directs.forEach(d => {
      statuses = [...statuses, ...getSubOrgAttendance(d.name, date, depth + 1)];
    });
    
    return statuses;
  };

  const selectedManager = managers.find(m => m.id === selectedManagerId);
  const directReports = selectedManager ? getDirectReports(selectedManager.name) : [];

  return (
    <div className="space-y-8">
      {/* Manager Selection */}
      <div className="bg-white p-6 rounded-3xl border border-stone-200 shadow-sm">
        <label className="block text-xs font-bold text-stone-400 uppercase tracking-widest mb-3">Select Manager</label>
        <div className="relative">
          <select 
            value={selectedManagerId || ''}
            onChange={(e) => setSelectedManagerId(e.target.value)}
            className="w-full p-4 bg-stone-50 border border-stone-200 rounded-2xl appearance-none outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
          >
            <option value="">Select a manager to view their org insights...</option>
            {managers.map(m => (
              <option key={m.id} value={m.id}>{m.name} ({m.designation})</option>
            ))}
          </select>
          <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-stone-400 pointer-events-none" />
        </div>
      </div>

      {selectedManager && (
        <div className="space-y-8">
          {/* Org Chart Visualization (Simplified) */}
          <div className="bg-white p-8 rounded-3xl border border-stone-200 shadow-sm overflow-x-auto">
            <h3 className="text-lg font-bold mb-8 flex items-center gap-2">
              <Users className="w-5 h-5 text-emerald-600" />
              Reporting Structure
            </h3>
            <div className="flex flex-col items-center">
              <div className="p-4 bg-stone-900 text-white rounded-2xl shadow-xl mb-8 min-w-[200px] text-center">
                <p className="font-bold">{selectedManager.name}</p>
                <p className="text-[10px] opacity-70 uppercase tracking-widest">{selectedManager.designation}</p>
              </div>
              <div className="relative flex gap-8">
                {directReports.map((report) => (
                  <div key={report.id} className="flex flex-col items-center">
                    <div className="w-px h-8 bg-stone-200 mb-4" />
                    <div className="p-4 bg-white border border-stone-200 rounded-2xl shadow-sm min-w-[180px] text-center">
                      <p className="text-sm font-bold">{report.name}</p>
                      <p className="text-[10px] text-stone-400 uppercase tracking-widest">{report.designation}</p>
                    </div>
                    {/* Level 2 */}
                    <div className="flex gap-4 mt-4">
                      {getDirectReports(report.name).map(l2 => (
                        <div key={l2.id} className="flex flex-col items-center">
                          <div className="w-px h-4 bg-stone-100 mb-2" />
                          <div className="p-2 bg-stone-50 border border-stone-100 rounded-xl text-[10px] font-medium text-stone-600 min-w-[100px] text-center">
                            {l2.name}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Direct Reports Org Attendance Grid */}
          <div className="bg-white rounded-3xl border border-stone-200 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-stone-100">
              <h3 className="text-lg font-bold flex items-center gap-2">
                <Calendar className="w-5 h-5 text-emerald-600" />
                Direct Reports Team Trends
              </h3>
              <p className="text-xs text-stone-400 mt-1">Showing average attendance percentage of each direct report's entire sub-org (up to 2 levels deep)</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-stone-50/50">
                    <th className="sticky left-0 z-10 bg-stone-50/50 px-6 py-4 text-left text-[10px] font-bold text-stone-400 uppercase tracking-widest border-r border-stone-100 min-w-[200px]">Direct Report</th>
                    {daysInMonth.map((date, i) => (
                      <th key={i} className="px-2 py-4 text-center min-w-[45px] border-r border-stone-100 last:border-r-0">
                        <span className="text-[10px] font-bold text-stone-400 block">{format(date, 'dd')}</span>
                        <span className="text-[8px] text-stone-300 block uppercase">{format(date, 'EEE').charAt(0)}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {directReports.map(report => (
                    <tr key={report.id} className="hover:bg-stone-50/50 transition-colors group">
                      <td className="sticky left-0 z-10 bg-white group-hover:bg-stone-50 transition-colors px-6 py-4 border-r border-stone-100">
                        <p className="text-sm font-bold text-stone-900">{report.name}</p>
                        <p className="text-[10px] text-stone-400">Team Size: {getSubOrgAttendance(report.name, new Date()).length + 1}</p>
                      </td>
                      {daysInMonth.map((date, i) => {
                        const isWorkDay = isWorkingDay(date);
                        const subOrgStatuses = getSubOrgAttendance(report.name, date);
                        // Include the report themselves in the calculation
                        const reportStatus = getAttendanceStatus(report.id, date);
                        const allStatuses = [reportStatus, ...subOrgStatuses];
                        
                        const inOfficeCount = allStatuses.filter(s => s === 'in-office' || s === 'unmarked').length;
                        const percentage = allStatuses.length > 0 ? (inOfficeCount / allStatuses.length) * 100 : 0;
                        
                        return (
                          <td 
                            key={i} 
                            className={cn(
                              "p-1 border-r border-stone-100 last:border-r-0 text-center",
                              !isWorkDay && "bg-stone-50/30"
                            )}
                          >
                            {isWorkDay && allStatuses.length > 0 ? (
                              <div className={cn(
                                "w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-black mx-auto",
                                percentage < 70 ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-600"
                              )}>
                                {Math.round(percentage)}%
                              </div>
                            ) : isWorkDay ? (
                              <div className="w-8 h-8 flex items-center justify-center">
                                <span className="text-[10px] text-stone-200">-</span>
                              </div>
                            ) : null}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default function App() {
  return (
    <ErrorBoundary>
      <AttendanceTracker />
    </ErrorBoundary>
  );
}
