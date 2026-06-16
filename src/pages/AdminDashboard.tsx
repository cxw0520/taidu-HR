import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getApps, initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { db, auth } from '../firebase';
import { collection, query, where, orderBy, onSnapshot, doc, setDoc, deleteDoc, updateDoc, getDocs } from 'firebase/firestore';
import './AdminDashboard.css';

const secondaryAppConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

const getSecondaryAuth = () => {
  const apps = getApps();
  const secondaryApp = apps.find(app => app.name === 'secondary') || initializeApp(secondaryAppConfig, 'secondary');
  return getAuth(secondaryApp);
};

const LEAVE_TYPES = [
  { value: 'sick', label: '病假 (半薪)' },
  { value: 'personal', label: '事假 (無薪)' },
  { value: 'annual', label: '特別休假' },
  { value: 'official', label: '公假' },
  { value: 'marriage', label: '婚假' },
  { value: 'bereavement', label: '喪假' },
  { value: 'menstrual', label: '生理假' },
  { value: 'prenatal', label: '產前假' },
];

const AdminDashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'attendance' | 'employees' | 'schedules' | 'payroll' | 'settings'>('attendance');
  const [attendance, setAttendance] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // 新增員工帳號 Form states
  const [showAddModal, setShowAddModal] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState('工程師');
  const [roles, setRoles] = useState(['工程師', '設計師', '行銷', '專案經理', '行政總務']);
  const [showAddRoleInput, setShowAddRoleInput] = useState(false);
  const [customRoleName, setCustomRoleName] = useState('');
  const [addError, setAddError] = useState('');
  const [addSuccess, setAddSuccess] = useState('');
  const [creating, setCreating] = useState(false);

  // 系統設定狀態與監聽
  const [shifts, setShifts] = useState<any[]>([]);
  const [insuranceRates, setInsuranceRates] = useState<any>({
    laborRate: 0.12,
    nhiRate: 0.0517,
    nhiAvgDependents: 0.56,
    employerLaborRatio: 0.7,
    employeeLaborRatio: 0.2,
    employerNhiRatio: 0.6,
    employeeNhiRatio: 0.3
  });

  const [holidays, setHolidays] = useState<any[]>([]);

  // 國定假日與挪移管理專用 UI inputs
  const [newHolidayName, setNewHolidayName] = useState('');
  const [newHolidayDate, setNewHolidayDate] = useState('');
  const [newHolidayMovedDate, setNewHolidayMovedDate] = useState('');

  // 系統設定專用 UI inputs
  const [newShiftName, setNewShiftName] = useState('');
  const [newShiftStart, setNewShiftStart] = useState('09:00');
  const [newShiftEnd, setNewShiftEnd] = useState('18:00');
  const [newShiftBreakStart, setNewShiftBreakStart] = useState('');
  const [newShiftBreakEnd, setNewShiftBreakEnd] = useState('');

  // 保費費率與規則輸入 Form states
  const [cfgLaborRate, setCfgLaborRate] = useState(0.12);
  const [cfgNhiRate, setCfgNhiRate] = useState(0.0517);
  const [cfgNhiAvgDeps, setCfgNhiAvgDeps] = useState(0.56);
  const [cfgEmpLaborRatio, setCfgEmpLaborRatio] = useState(0.2);
  const [cfgEmprLaborRatio, setCfgEmprLaborRatio] = useState(0.7);
  const [cfgEmpNhiRatio, setCfgEmpNhiRatio] = useState(0.3);
  const [cfgEmprNhiRatio, setCfgEmprNhiRatio] = useState(0.6);
  const [cfgToleranceHours, setCfgToleranceHours] = useState(4);

  const [settingsSaveMsg, setSettingsSaveMsg] = useState({ type: '', text: '' });

  // 台灣勞基法合規新增欄位 states
  const [newIdentityNumber, setNewIdentityNumber] = useState('');
  const [newOnboardDate, setNewOnboardDate] = useState(new Date().toISOString().substring(0, 10));
  const [newBankAccount, setNewBankAccount] = useState('');
  const [newMonthlySalary, setNewMonthlySalary] = useState<number>(32000);
  const [newLaborSub, setNewLaborSub] = useState<number>(31800);
  const [newNhiSub, setNewNhiSub] = useState<number>(31800);
  const [newPensionSub, setNewPensionSub] = useState<number>(31800);
  const [newSupervisorId, setNewSupervisorId] = useState('');
  const [newSalaryType, setNewSalaryType] = useState<'monthly' | 'hourly'>('monthly');
  const [newNhiDependents, setNewNhiDependents] = useState<number>(0);
  const [newMealAllowance, setNewMealAllowance] = useState<number>(0);
  const [newAttendanceBonus, setNewAttendanceBonus] = useState<number>(0);
  const [newOtherAllowance, setNewOtherAllowance] = useState<number>(0);
  const [newFileIdCard, setNewFileIdCard] = useState<string>('');
  const [newFileBankbook, setNewFileBankbook] = useState<string>('');
  const [newFileContract, setNewFileContract] = useState<string>('');

  // 從 Firestore 同步職務列表
  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, 'settings', 'roles'), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data && Array.isArray(data.list)) {
          setRoles(data.list);
        }
      } else {
        setDoc(doc(db, 'settings', 'roles'), {
          list: ['工程師', '設計師', '行銷', '專案經理', '行政總務']
        }).catch(err => console.error("Initialize roles error:", err));
      }
    });
    return () => unsubscribe();
  }, []);

  const handleAddCustomRole = async (e: React.MouseEvent) => {
    e.preventDefault();
    const cleanRoleName = customRoleName.trim();
    if (cleanRoleName) {
      if (!roles.includes(cleanRoleName)) {
        const updatedRoles = [...roles, cleanRoleName];
        setRoles(updatedRoles);
        setNewRole(cleanRoleName);
        setCustomRoleName('');
        setShowAddRoleInput(false);
        try {
          await setDoc(doc(db, 'settings', 'roles'), { list: updatedRoles });
        } catch (err) {
          console.error("Failed to save roles:", err);
        }
      } else {
        setAddError('該職務名稱已存在');
      }
    }
  };

  const handleDeleteRole = async (roleToDelete: string) => {
    if (roles.length <= 1) {
      alert('必須保留至少一個職位類別');
      return;
    }
    if (!window.confirm(`確定要刪除「${roleToDelete}」這個職務選項嗎？`)) return;
    const updatedRoles = roles.filter(r => r !== roleToDelete);
    setRoles(updatedRoles);
    setNewRole(updatedRoles[0]);
    try {
      await setDoc(doc(db, 'settings', 'roles'), { list: updatedRoles });
    } catch (err) {
      console.error("Failed to delete role:", err);
      alert('刪除失敗，請確認資料庫權限');
    }
  };

  useEffect(() => {
    const q = query(collection(db, 'attendance'), orderBy('timestamp', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const records = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      // 如果資料庫是空的，則顯示 Mock 資料
      if (records.length === 0) {
        setAttendance([
          { id: '1', empName: '王小明', date: '2023-10-27', time: '08:55', type: '上班', status: '正常' },
          { id: '2', empName: '李大華', date: '2023-10-27', time: '18:30', type: '下班', status: '正常' },
        ]);
      } else {
        setAttendance(records);
      }
    }, (error) => {
      console.error("Firestore read error:", error);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const q = query(collection(db, 'employees'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const records = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      if (records.length === 0) {
        setEmployees([
          { id: 'EMP001', name: '王小明', role: '工程師', status: 'active' },
          { id: 'EMP002', name: '李大華', role: '設計師', status: 'active' },
          { id: 'EMP003', name: '張小芬', role: '行銷', status: 'inactive' },
        ]);
      } else {
        setEmployees(records);
      }
    });
    return () => unsubscribe();
  }, []);

  const handleCreateEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddError('');
    setAddSuccess('');
    setCreating(true);

    try {
      const secondaryAuth = getSecondaryAuth();
      // 1. 在 Firebase Auth 建立帳號
      const userCredential = await createUserWithEmailAndPassword(secondaryAuth, newEmail, newPassword);
      const uid = userCredential.user.uid;

      // 2. 在 Firestore 新增該員工的基本資料
      await setDoc(doc(db, 'employees', uid), {
        id: uid,
        name: newName,
        email: newEmail,
        role: newRole,
        status: 'active',
        identityNumber: newIdentityNumber,
        onboardDate: newOnboardDate,
        resignDate: null,
        bankAccount: newBankAccount,
        monthlySalary: Number(newMonthlySalary),
        laborSub: Number(newLaborSub),
        nhiSub: Number(newNhiSub),
        pensionSub: Number(newPensionSub),
        supervisorId: newSupervisorId,
        salaryType: newSalaryType,
        nhiDependents: Number(newNhiDependents),
        mealAllowance: Number(newMealAllowance),
        attendanceBonus: Number(newAttendanceBonus),
        otherAllowance: Number(newOtherAllowance),
        fileIdCard: newFileIdCard,
        fileBankbook: newFileBankbook,
        fileContract: newFileContract
      });

      // 3. 次要 App 實體登出，防止干涉主要 auth 狀態
      const { signOut: secondarySignOut } = await import('firebase/auth');
      await secondarySignOut(secondaryAuth);

      setAddSuccess(`帳號 ${newEmail} 建立成功！`);
      setNewEmail('');
      setNewPassword('');
      setNewName('');
      setNewIdentityNumber('');
      setNewBankAccount('');
      setNewMonthlySalary(32000);
      setNewLaborSub(31800);
      setNewNhiSub(31800);
      setNewPensionSub(31800);
      setNewSupervisorId('');
      setNewSalaryType('monthly');
      setNewNhiDependents(0);
      setNewMealAllowance(0);
      setNewAttendanceBonus(0);
      setNewOtherAllowance(0);
      setNewFileIdCard('');
      setNewFileBankbook('');
      setNewFileContract('');
      setTimeout(() => {
        setShowAddModal(false);
        setAddSuccess('');
      }, 1500);
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/email-already-in-use') {
        setAddError('該電子信箱已被註冊使用');
      } else if (err.code === 'auth/weak-password') {
        setAddError('密碼強度太弱 (至少需要 6 個字元)');
      } else {
        setAddError(err.message || '建立失敗，請稍後再試');
      }
    } finally {
      setCreating(false);
    }
  };

  const handleSignOut = () => {
    signOut(auth);
  };

  // 出勤搜尋與篩選 States
  const [filterDate, setFilterDate] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  
  // 編輯出勤紀錄 States
  const [showEditAttendanceModal, setShowEditAttendanceModal] = useState(false);
  const [editAttendanceId, setEditAttendanceId] = useState('');
  const [editAttName, setEditAttName] = useState('');
  const [editAttDate, setEditAttDate] = useState('');
  const [editAttTime, setEditAttTime] = useState('');
  const [editAttType, setEditAttType] = useState('上班');
  const [editAttStatus, setEditAttStatus] = useState('正常');

  // 編輯員工 States
  const [showEditEmployeeModal, setShowEditEmployeeModal] = useState(false);
  const [editEmployeeId, setEditEmployeeId] = useState('');
  const [editEmpName, setEditEmpName] = useState('');
  const [editEmpRole, setEditEmpRole] = useState('工程師');
  const [editEmpStatus, setEditEmpStatus] = useState('active');
  const [editIdentityNumber, setEditIdentityNumber] = useState('');
  const [editOnboardDate, setEditOnboardDate] = useState('');
  const [editResignDate, setEditResignDate] = useState('');
  const [editBankAccount, setEditBankAccount] = useState('');
  const [editMonthlySalary, setEditMonthlySalary] = useState<number>(32000);
  const [editLaborSub, setEditLaborSub] = useState<number>(31800);
  const [editNhiSub, setEditNhiSub] = useState<number>(31800);
  const [editPensionSub, setEditPensionSub] = useState<number>(31800);
  const [editSupervisorId, setEditSupervisorId] = useState('');
  const [editSalaryType, setEditSalaryType] = useState<'monthly' | 'hourly'>('monthly');
  const [editNhiDependents, setEditNhiDependents] = useState<number>(0);
  const [editMealAllowance, setEditMealAllowance] = useState<number>(0);
  const [editAttendanceBonus, setEditAttendanceBonus] = useState<number>(0);
  const [editOtherAllowance, setEditOtherAllowance] = useState<number>(0);
  const [editFileIdCard, setEditFileIdCard] = useState<string>('');
  const [editFileBankbook, setEditFileBankbook] = useState<string>('');
  const [editFileContract, setEditFileContract] = useState<string>('');

  // 日曆式排班與快速排班狀態
  const [viewYear, setViewYear] = useState<number>(new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState<number>(new Date().getMonth() + 1);
  const [isQuickSchedMode, setIsQuickSchedMode] = useState<boolean>(false);
  const [quickSchedEmpId, setQuickSchedEmpId] = useState<string>('');
  const [quickSchedShift, setQuickSchedShift] = useState<string>('');
  const [quickSchedStatus, setQuickSchedStatus] = useState<string>('已確認');

  // 薪資篩選與月份 States
  const [payMonthFilter, setPayMonthFilter] = useState(new Date().toISOString().substring(0, 7));
  const [viewPayMonth, setViewPayMonth] = useState('');

  // 排班與薪資 State
  const [schedules, setSchedules] = useState<any[]>([]);
  const [payroll, setPayroll] = useState<any[]>([]);

  // 請假與加班審核 State
  const [leaves, setLeaves] = useState<any[]>([]);
  const [overtimeReqs, setOvertimeReqs] = useState<any[]>([]);

  // 排班彈窗與 Form states
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [schedEmployeeId, setSchedEmployeeId] = useState('');
  const [schedDate, setSchedDate] = useState('');
  const [schedShift, setSchedShift] = useState('早班 (09:00 - 18:00)');
  const [schedError, setSchedError] = useState('');
  const [schedSuccess, setSchedSuccess] = useState('');
  const [creatingSchedule, setCreatingSchedule] = useState(false);

  // 編輯排班 states
  const [showEditScheduleModal, setShowEditScheduleModal] = useState(false);
  const [editScheduleId, setEditScheduleId] = useState('');
  const [editSchedEmployeeId, setEditSchedEmployeeId] = useState('');
  const [editSchedDate, setEditSchedDate] = useState('');
  const [editSchedShift, setEditSchedShift] = useState('');
  const [editSchedStatus, setEditSchedStatus] = useState('');

  // 薪資計算 states
  const [generatingPayroll, setGeneratingPayroll] = useState(false);
  const [payError, setPayError] = useState('');
  const [paySuccess, setPaySuccess] = useState('');

  // 手動新增薪資單 states
  const [showAddPayrollModal, setShowAddPayrollModal] = useState(false);
  const [addPayEmployeeId, setAddPayEmployeeId] = useState('');
  const [addPayMonth, setAddPayMonth] = useState('');
  const [addPayBaseSalary, setAddPayBaseSalary] = useState<number>(32000);
  const [addPayOvertime, setAddPayOvertime] = useState<number>(0);
  const [addPayDeductions, setAddPayDeductions] = useState<number>(1200);

  // 編輯薪資單 states
  const [showEditPayrollModal, setShowEditPayrollModal] = useState(false);
  const [editPayrollId, setEditPayrollId] = useState('');
  const [editPayEmployeeName, setEditPayEmployeeName] = useState('');
  const [editPayMonth, setEditPayMonth] = useState('');
  const [editPayBaseSalary, setEditPayBaseSalary] = useState<number>(0);
  const [editPayOvertime, setEditPayOvertime] = useState<number>(0);
  const [editPayDeductions, setEditPayDeductions] = useState<number>(0);
  const [editPayStatus, setEditPayStatus] = useState('');

  // 從 Firestore 同步班別設定
  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, 'settings', 'shifts'), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data && Array.isArray(data.list)) {
          setShifts(data.list);
        }
      } else {
        const defaultShifts = [
          { name: '早班', startTime: '09:00', endTime: '18:00' },
          { name: '中班', startTime: '13:00', endTime: '22:00' },
          { name: '晚班', startTime: '18:00', endTime: '02:00' }
        ];
        setShifts(defaultShifts);
        setDoc(doc(db, 'settings', 'shifts'), { list: defaultShifts })
          .catch(err => console.error("Initialize shifts error:", err));
      }
    });
    return () => unsubscribe();
  }, []);

  // 從 Firestore 同步保費費率與差勤規則
  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, 'settings', 'insurance'), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setInsuranceRates(data);
        setCfgLaborRate(data.laborRate);
        setCfgNhiRate(data.nhiRate);
        setCfgNhiAvgDeps(data.nhiAvgDependents);
        setCfgEmpLaborRatio(data.employeeLaborRatio);
        setCfgEmprLaborRatio(data.employerLaborRatio);
        setCfgEmpNhiRatio(data.employeeNhiRatio);
        setCfgEmprNhiRatio(data.employerNhiRatio);
      } else {
        const defaultRates = {
          laborRate: 0.12,
          nhiRate: 0.0517,
          nhiAvgDependents: 0.56,
          employerLaborRatio: 0.7,
          employeeLaborRatio: 0.2,
          employerNhiRatio: 0.6,
          employeeNhiRatio: 0.3
        };
        setInsuranceRates(defaultRates);
        setDoc(doc(db, 'settings', 'insurance'), defaultRates)
          .catch(err => console.error("Initialize insurance error:", err));
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, 'settings', 'rules'), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setCfgToleranceHours(data.toleranceHours);
      } else {
        const defaultRules = {
          toleranceHours: 4
        };
        setDoc(doc(db, 'settings', 'rules'), defaultRules)
          .catch(err => console.error("Initialize rules error:", err));
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, 'settings', 'holidays'), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data && Array.isArray(data.list)) {
          const normalized = data.list.map((h: any) => ({
            ...h,
            movedDate: h.movedDate || h.date
          }));
          setHolidays(normalized);
        }
      } else {
        const defaultHolidays = [
          // 2025
          { date: '2025-01-01', name: '元旦' },
          { date: '2025-01-26', name: '小年夜' },
          { date: '2025-01-27', name: '除夕' },
          { date: '2025-01-28', name: '春節初一' },
          { date: '2025-01-29', name: '春節初二' },
          { date: '2025-01-30', name: '春節初三' },
          { date: '2025-02-28', name: '和平紀念日' },
          { date: '2025-04-03', name: '兒童節' },
          { date: '2025-04-04', name: '清明節' },
          { date: '2025-05-01', name: '勞動節' },
          { date: '2025-05-31', name: '端午節' },
          { date: '2025-09-28', name: '教師節' },
          { date: '2025-10-06', name: '中秋節' },
          { date: '2025-10-10', name: '國慶日' },
          { date: '2025-10-25', name: '臺灣光復節' },
          { date: '2025-12-25', name: '行憲紀念日' },
          // 2026
          { date: '2026-01-01', name: '元旦' },
          { date: '2026-02-15', name: '小年夜' },
          { date: '2026-02-16', name: '除夕' },
          { date: '2026-02-17', name: '春節初一' },
          { date: '2026-02-18', name: '春節初二' },
          { date: '2026-02-19', name: '春節初三' },
          { date: '2026-02-28', name: '和平紀念日' },
          { date: '2026-04-03', name: '兒童節' },
          { date: '2026-04-04', name: '清明節' },
          { date: '2026-05-01', name: '勞動節' },
          { date: '2026-06-19', name: '端午節' },
          { date: '2026-09-25', name: '中秋節' },
          { date: '2026-09-28', name: '教師節' },
          { date: '2026-10-10', name: '國慶日' },
          { date: '2026-10-25', name: '臺灣光復節' },
          { date: '2026-12-25', name: '行憲紀念日' }
        ];
        const defaultHolidaysWithMoved = defaultHolidays.map((h: any) => ({
          ...h,
          movedDate: h.date
        }));
        setHolidays(defaultHolidaysWithMoved);
        setDoc(doc(db, 'settings', 'holidays'), { list: defaultHolidaysWithMoved })
          .catch(err => console.error("Initialize holidays error:", err));
      }
    });
    return () => unsubscribe();
  }, []);

  // 當 shifts 載入完畢，設定預設排班班別
  useEffect(() => {
    if (shifts.length > 0) {
      const firstShiftStr = `${shifts[0].name} (${shifts[0].startTime} - ${shifts[0].endTime})`;
      if (!schedShift || !shifts.some(s => `${s.name} (${s.startTime} - ${s.endTime})` === schedShift)) {
        setSchedShift(firstShiftStr);
      }
      if (!quickSchedShift || !shifts.some(s => `${s.name} (${s.startTime} - ${s.endTime})` === quickSchedShift)) {
        setQuickSchedShift(firstShiftStr);
      }
    }
  }, [shifts, schedShift, quickSchedShift]);

  const handleAddShift = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newShiftName.trim();
    if (!name) return;
    const start = newShiftStart.trim();
    const end = newShiftEnd.trim();
    
    if (shifts.some(s => s.name === name)) {
      alert('該班別名稱已經存在');
      return;
    }
    
    const updatedShifts = [...shifts, { 
      name, 
      startTime: start, 
      endTime: end,
      breakStartTime: newShiftBreakStart.trim(),
      breakEndTime: newShiftBreakEnd.trim()
    }];
    setShifts(updatedShifts);
    setNewShiftName('');
    setNewShiftBreakStart('');
    setNewShiftBreakEnd('');
    try {
      await setDoc(doc(db, 'settings', 'shifts'), { list: updatedShifts });
    } catch (err) {
      console.error("Failed to save shifts:", err);
      alert('儲存班別失敗');
    }
  };

  const handleDeleteShift = async (shiftName: string) => {
    if (shifts.length <= 1) {
      alert('必須保留至少一個班別');
      return;
    }
    if (!window.confirm(`確定要刪除「${shiftName}」班別嗎？`)) return;
    
    const updatedShifts = shifts.filter(s => s.name !== shiftName);
    setShifts(updatedShifts);
    try {
      await setDoc(doc(db, 'settings', 'shifts'), { list: updatedShifts });
    } catch (err) {
      console.error("Failed to delete shift:", err);
      alert('刪除班別失敗');
    }
  };

  const handleSaveInsuranceAndRules = async (e: React.FormEvent) => {
    e.preventDefault();
    setSettingsSaveMsg({ type: '', text: '' });
    
    const insData = {
      laborRate: Number(cfgLaborRate),
      nhiRate: Number(cfgNhiRate),
      nhiAvgDependents: Number(cfgNhiAvgDeps),
      employeeLaborRatio: Number(cfgEmpLaborRatio),
      employerLaborRatio: Number(cfgEmprLaborRatio),
      employeeNhiRatio: Number(cfgEmpNhiRatio),
      employerNhiRatio: Number(cfgEmprNhiRatio)
    };
    
    const rulesData = {
      toleranceHours: Number(cfgToleranceHours)
    };
    
    try {
      await setDoc(doc(db, 'settings', 'insurance'), insData);
      await setDoc(doc(db, 'settings', 'rules'), rulesData);
      setSettingsSaveMsg({ type: 'success', text: '設定已成功儲存至雲端資料庫！' });
      setTimeout(() => setSettingsSaveMsg({ type: '', text: '' }), 4000);
    } catch (err) {
      console.error("Failed to save settings:", err);
      setSettingsSaveMsg({ type: 'error', text: '儲存失敗，請檢查權限或連線。' });
    }
  };

  const handleSaveOrMoveHoliday = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newHolidayName.trim();
    const date = newHolidayDate.trim();
    const movedDate = newHolidayMovedDate.trim() || date;
    if (!name || !date) return;

    let updatedList;
    const existingIndex = holidays.findIndex(h => h.name.toLowerCase() === name.toLowerCase());
    
    const newItem = { name, date, movedDate };
    
    if (existingIndex >= 0) {
      // 挪移日期
      updatedList = [...holidays];
      updatedList[existingIndex] = newItem;
    } else {
      // 新增假日
      updatedList = [...holidays, newItem];
    }

    updatedList.sort((a, b) => a.date.localeCompare(b.date));

    setHolidays(updatedList);
    setNewHolidayName('');
    setNewHolidayDate('');
    setNewHolidayMovedDate('');
    
    try {
      await setDoc(doc(db, 'settings', 'holidays'), { list: updatedList });
      alert(`國定假日「${name}」已成功設定為：原始 ${date}，月薪挪移至 ${movedDate}！`);
    } catch (err) {
      console.error("Failed to save holiday:", err);
      alert('儲存假日失敗');
    }
  };

  const handleDeleteHoliday = async (holidayName: string) => {
    if (!window.confirm(`確定要刪除「${holidayName}」國定假日嗎？`)) return;
    const updatedList = holidays.filter(h => h.name !== holidayName);
    setHolidays(updatedList);
    try {
      await setDoc(doc(db, 'settings', 'holidays'), { list: updatedList });
    } catch (err) {
      console.error("Failed to delete holiday:", err);
      alert('刪除失敗');
    }
  };

  useEffect(() => {
    const q = query(collection(db, 'schedules'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const records = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as any[];
      if (records.length === 0) {
        setSchedules([
          { id: '1', empName: '王小明', date: '2023-11-01', shift: '早班 (09:00 - 18:00)', status: '已確認' },
          { id: '2', empName: '李大華', date: '2023-11-01', shift: '晚班 (13:00 - 22:00)', status: '待確認' },
        ]);
      } else {
        // 按照時間戳排序
        records.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        setSchedules(records);
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const q = query(collection(db, 'payroll'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const records = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as any[];
      if (records.length === 0) {
        setPayroll([
          { id: '1', empName: '王小明', month: '2023-10', baseSalary: 45000, overtime: 1500, deductions: 1200, netSalary: 45300, status: '已發放' },
          { id: '2', empName: '李大華', month: '2023-10', baseSalary: 38000, overtime: 0, deductions: 1200, netSalary: 36800, status: '待審核' },
        ]);
      } else {
        records.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        setPayroll(records);
      }
    });
    return () => unsubscribe();
  }, []);

  // 監聽請假與加班申請
  useEffect(() => {
    const qLeaves = query(collection(db, 'leaves'));
    const unsubLeaves = onSnapshot(qLeaves, (snap) => {
      const records = snap.docs.map(d => ({ id: d.id, ...d.data() })) as any[];
      records.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
      setLeaves(records);
    });
    const qOT = query(collection(db, 'overtime_requests'));
    const unsubOT = onSnapshot(qOT, (snap) => {
      const records = snap.docs.map(d => ({ id: d.id, ...d.data() })) as any[];
      records.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
      setOvertimeReqs(records);
    });
    return () => { unsubLeaves(); unsubOT(); };
  }, []);

  // 薪資自動計算：當出勤、請假、排班、員工資料或月份改變時，自動於背景計算薪資
  useEffect(() => {
    if (employees.length === 0) return;
    const delayDebounce = setTimeout(() => {
      runPayrollCalculation(payMonthFilter, true);
    }, 1500);
    return () => clearTimeout(delayDebounce);
  }, [attendance, leaves, schedules, employees, payMonthFilter]);

  const handleDeleteAttendance = async (id: string) => {
    if (id === '1' || id === '2') {
      alert('模擬資料無法刪除。');
      return;
    }
    if (!window.confirm('確定要刪除此筆出勤紀錄嗎？此動作無法復原。')) return;
    try {
      await deleteDoc(doc(db, 'attendance', id));
    } catch (err) {
      console.error("Failed to delete attendance record:", err);
      alert('刪除失敗，請檢查權限');
    }
  };

  const handleCreateSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    setSchedError('');
    setSchedSuccess('');
    setCreatingSchedule(true);

    if (!schedEmployeeId) {
      setSchedError('請選擇員工');
      setCreatingSchedule(false);
      return;
    }

    const emp = employees.find(e => e.id === schedEmployeeId);
    if (!emp) {
      setSchedError('找不到該員工資料');
      setCreatingSchedule(false);
      return;
    }

    try {
      // 防呆檢核
      const targetDate = schedDate || new Date().toLocaleDateString('sv');
      const warnings = checkScheduleWarnings(schedEmployeeId, targetDate, schedShift);
      if (warnings.length > 0) {
        const proceed = window.confirm(
          '⚠️ 排班防呆警示：\n\n' + warnings.join('\n') + '\n\n您確定仍要建立此排班嗎？'
        );
        if (!proceed) { setCreatingSchedule(false); return; }
      }
      await setDoc(doc(collection(db, 'schedules')), {
        empName: emp.name,
        employeeId: schedEmployeeId,
        date: targetDate,
        shift: schedShift,
        status: '待確認',
        timestamp: new Date().getTime()
      });
      setSchedSuccess('排班建立成功！');
      setSchedEmployeeId('');
      setSchedDate('');
      setTimeout(() => {
        setShowScheduleModal(false);
        setSchedSuccess('');
      }, 1500);
    } catch (err: any) {
      console.error(err);
      setSchedError(err.message || '建立失敗');
    } finally {
      setCreatingSchedule(false);
    }
  };



  const handleDeleteSchedule = async (id: string) => {
    if (id === '1' || id === '2') {
      alert('模擬資料無法刪除。');
      return;
    }
    if (!window.confirm('確定要刪除此排班紀錄嗎？')) return;
    try {
      await deleteDoc(doc(db, 'schedules', id));
    } catch (err) {
      console.error("Failed to delete schedule:", err);
      alert('刪除失敗，請檢查權限');
    }
  };

  // ===== 請假/加班審核處理 =====
  const handleApproveLeave = async (id: string) => {
    try { await updateDoc(doc(db, 'leaves', id), { status: 'approved' }); }
    catch (err) { console.error(err); alert('操作失敗'); }
  };
  const handleRejectLeave = async (id: string) => {
    try { await updateDoc(doc(db, 'leaves', id), { status: 'rejected' }); }
    catch (err) { console.error(err); alert('操作失敗'); }
  };
  const handleApproveOT = async (id: string) => {
    try { await updateDoc(doc(db, 'overtime_requests', id), { status: 'approved' }); }
    catch (err) { console.error(err); alert('操作失敗'); }
  };
  const handleRejectOT = async (id: string) => {
    try { await updateDoc(doc(db, 'overtime_requests', id), { status: 'rejected' }); }
    catch (err) { console.error(err); alert('操作失敗'); }
  };

  // ===== 排班防呆檢核 =====
  /**
   * 回傳防呆警示訊息陣列 (空陣列 = 無問題)
   * @param empId 員工ID
   * @param dateStr 欲排班日期 YYYY-MM-DD
   * @param shiftStr 班別字串 e.g. '早班 (09:00 - 18:00)'
   */
  const checkScheduleWarnings = (empId: string, dateStr: string, shiftStr: string): string[] => {
    const warnings: string[] = [];

    // 1. 請假衝突防呆
    const hasApprovedLeave = leaves.some(
      l => l.employeeId === empId && l.status === 'approved' &&
           l.startDate <= dateStr && l.endDate >= dateStr
    );
    if (hasApprovedLeave) {
      warnings.push('⚠️ 請假衝突：該員工此日已有核准的請假紀錄！');
    }

    // 2. 七休一防呆：取前後7天檢查連續工作天
    const empSchedules = schedules.filter(s => s.employeeId === empId);
    const datesToCheck: string[] = [];
    for (let i = -6; i <= 6; i++) {
      const d = new Date(dateStr);
      d.setDate(d.getDate() + i);
      datesToCheck.push(d.toLocaleDateString('sv'));
    }
    // 加入欲排班日期後重新計算連續天數
    const allDates = [...new Set([...empSchedules.map((s: any) => s.date), dateStr])].sort();
    let maxStreak = 0;
    let streak = 0;
    let prevDate: string | null = null;
    for (const d of allDates) {
      if (prevDate) {
        const diff = (new Date(d).getTime() - new Date(prevDate).getTime()) / 86400000;
        if (diff === 1) { streak++; } else { streak = 1; }
      } else { streak = 1; }
      maxStreak = Math.max(maxStreak, streak);
      prevDate = d;
    }
    if (maxStreak > 6) {
      warnings.push('🔴 七休一違規：該員工已連續排班超過 6 天，違反勞基法第 36 條！');
    }

    // 3. 11小時輪班間隔防呆
    const parseShiftEnd = (shift: string): number | null => {
      const match = shift.match(/(\d{2}):(\d{2})\s*\)\s*$/);
      if (!match) return null;
      return parseInt(match[1]) + parseInt(match[2]) / 60;
    };
    const parseShiftStart = (shift: string): number | null => {
      const match = shift.match(/\((\d{2}):(\d{2})/);
      if (!match) return null;
      return parseInt(match[1]) + parseInt(match[2]) / 60;
    };
    // 前一天
    const prevDay = new Date(dateStr);
    prevDay.setDate(prevDay.getDate() - 1);
    const prevDayStr = prevDay.toLocaleDateString('sv');
    const prevSched = empSchedules.find((s: any) => s.date === prevDayStr);
    if (prevSched) {
      let prevEnd = parseShiftEnd(prevSched.shift) ?? 18;
      const todayStart = parseShiftStart(shiftStr) ?? 9;
      // 若下班時間 < 上班時間 → 跨夜
      const prevShiftStart = parseShiftStart(prevSched.shift) ?? 9;
      if (prevEnd < prevShiftStart) prevEnd += 24;
      const gap = (todayStart + 24) - prevEnd;
      const adjustedGap = gap > 24 ? gap - 24 : gap;
      if (adjustedGap < 11) {
        warnings.push(`🟡 輪班間隔不足：距前一天下班時間僅 ${adjustedGap.toFixed(1)} 小時（法規要求 ≥ 11 小時）`);
      }
    }

    return warnings;
  };

  // ===== CSV 匯出工具 =====
  const exportCSV = (headers: string[], rows: string[][], filename: string) => {
    const BOM = '\uFEFF';
    const csvContent = BOM + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportAttendanceCSV = () => {
    const headers = ['員工姓名', '日期', '時間', '類型', '狀態'];
    const rows = filteredAttendance.map((r: any) => [
      `"${r.empName || ''}"`, r.date || '', r.time || '', r.type || '', r.status || ''
    ]);
    exportCSV(headers, rows, `出勤紀錄_${filterDate || new Date().toLocaleDateString('sv')}.csv`);
  };

  const handleExportInsuranceEnrollmentCSV = () => {
    const headers = ['員工姓名', '身分證字號', '到職日期', '勞保投保薪資', '健保投保薪資', '實際眷屬數'];
    const rows = employees.map((emp: any) => [
      `"${emp.name || ''}"`,
      `"${emp.identityNumber || ''}"`,
      `"${emp.onboardDate || ''}"`,
      emp.laborSub || 0,
      emp.nhiSub || 0,
      emp.nhiDependents || 0
    ]);
    exportCSV(headers, rows, `勞健保加保申報表_${new Date().toLocaleDateString('sv')}.csv`);
  };

  const handleExportPayrollCSV = () => {
    const headers = ['員工姓名', '結算月份', '底薪', '伙食津貼', '全勤獎金', '其他津貼', '加班費', '請假扣薪', '勞保自付', '健保自付', '實發薪資', '狀態'];
    const rows = filteredPayroll.map((r: any) => [
      `"${r.empName || ''}"`,
      r.month || '',
      r.baseSalary || 0,
      r.mealAllowance || 0,
      r.attendanceBonus || 0,
      r.otherAllowance || 0,
      r.overtime || 0,
      r.leaveDeduction || 0,
      r.employeeLabor || 0,
      r.employeeNhi || 0,
      r.netSalary || 0,
      `"${r.status || ''}"`
    ]);
    exportCSV(headers, rows, `薪資總表_${payMonthFilter}.csv`);
  };

  // 快速排班與日曆輔助函式
  const handlePrevMonth = () => {
    if (viewMonth === 1) {
      setViewMonth(12);
      setViewYear(prev => prev - 1);
    } else {
      setViewMonth(prev => prev - 1);
    }
  };

  const handleNextMonth = () => {
    if (viewMonth === 12) {
      setViewMonth(1);
      setViewYear(prev => prev + 1);
    } else {
      setViewMonth(prev => prev + 1);
    }
  };

  const handleQuickAddSchedule = async (dateStr: string) => {
    if (!quickSchedEmpId) {
      alert('請先選擇員工以啟用快速排班模式。');
      return;
    }
    const emp = employees.find(e => e.id === quickSchedEmpId);
    if (!emp) {
      alert('找不到該員工資料');
      return;
    }
    const currentShift = quickSchedShift || (shifts.length > 0 ? `${shifts[0].name} (${shifts[0].startTime} - ${shifts[0].endTime})` : '早班 (09:00 - 18:00)');
    
    // 檢查該日期是否已有此員工排班，若是則點擊變為「刪除」（開關切換效果）
    const existing = schedules.find(s => s.employeeId === quickSchedEmpId && s.date === dateStr);
    if (existing) {
      if (existing.id === '1' || existing.id === '2') {
        alert('模擬排班無法刪除。');
        return;
      }
      if (window.confirm(`${emp.name} 在 ${dateStr} 已經有排班 (${existing.shift})，確定要刪除此排班嗎？`)) {
        try {
          await deleteDoc(doc(db, 'schedules', existing.id));
        } catch (err) {
          console.error("Failed to delete quick schedule:", err);
        }
      }
      return;
    }

    try {
      // 防呆檢核
      const warnings = checkScheduleWarnings(quickSchedEmpId, dateStr, currentShift);
      if (warnings.length > 0) {
        const proceed = window.confirm(
          '⚠️ 排班防呆警示：\n\n' + warnings.join('\n') + '\n\n您確定仍要建立此排班嗎？'
        );
        if (!proceed) return;
      }
      await setDoc(doc(collection(db, 'schedules')), {
        empName: emp.name,
        employeeId: quickSchedEmpId,
        date: dateStr,
        shift: currentShift,
        status: quickSchedStatus || '已確認',
        timestamp: new Date().getTime()
      });
    } catch (err) {
      console.error("Failed to quick add schedule:", err);
      alert('建立排班失敗');
    }
  };

  const handleOpenEditSchedule = (schedule: any) => {
    if (schedule.id === '1' || schedule.id === '2') {
      alert('模擬資料無法編輯。請新增真實資料以測試完整編輯功能。');
      return;
    }
    setEditScheduleId(schedule.id);
    setEditSchedEmployeeId(schedule.employeeId);
    setEditSchedDate(schedule.date);
    setEditSchedShift(schedule.shift);
    setEditSchedStatus(schedule.status);
    setShowEditScheduleModal(true);
  };

  const handleUpdateSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      // 防呆檢核
      const warnings = checkScheduleWarnings(editSchedEmployeeId, editSchedDate, editSchedShift);
      if (warnings.length > 0) {
        const proceed = window.confirm(
          '⚠️ 排班防呆警示：\n\n' + warnings.join('\n') + '\n\n您確定仍要更新此排班嗎？'
        );
        if (!proceed) return;
      }

      const emp = employees.find(e => e.id === editSchedEmployeeId);
      const empName = emp ? emp.name : '未知員工';
      
      await updateDoc(doc(db, 'schedules', editScheduleId), {
        employeeId: editSchedEmployeeId,
        empName: empName,
        date: editSchedDate,
        shift: editSchedShift,
        status: editSchedStatus
      });
      setShowEditScheduleModal(false);
    } catch (err) {
      console.error("Failed to update schedule:", err);
      alert('更新失敗，請檢查權限');
    }
  };

  // 出勤編輯與更新 Logic
  const handleOpenEditAttendance = (record: any) => {
    if (record.id === '1' || record.id === '2') {
      alert('模擬資料無法編輯。請新增真實資料進行操作。');
      return;
    }
    setEditAttendanceId(record.id);
    setEditAttName(record.empName);
    setEditAttDate(record.date);
    setEditAttTime(record.time);
    setEditAttType(record.type);
    setEditAttStatus(record.status);
    setShowEditAttendanceModal(true);
  };

  const handleUpdateAttendance = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await updateDoc(doc(db, 'attendance', editAttendanceId), {
        date: editAttDate,
        time: editAttTime,
        type: editAttType,
        status: editAttStatus
      });
      setShowEditAttendanceModal(false);
    } catch (err) {
      console.error("Failed to update attendance:", err);
      alert('更新失敗，請檢查權限');
    }
  };

  // 員工編輯與刪除 Logic
  const handleOpenEditEmployee = (emp: any) => {
    if (emp.id === 'EMP001' || emp.id === 'EMP002' || emp.id === 'EMP003') {
      alert('模擬資料無法編輯。請使用新增帳號建立真實資料進行操作。');
      return;
    }
    setEditEmployeeId(emp.id);
    setEditEmpName(emp.name || '');
    setEditEmpRole(emp.role || '工程師');
    setEditEmpStatus(emp.status || 'active');
    setEditIdentityNumber(emp.identityNumber || '');
    setEditOnboardDate(emp.onboardDate || '');
    setEditResignDate(emp.resignDate || '');
    setEditBankAccount(emp.bankAccount || '');
    setEditMonthlySalary(emp.monthlySalary || 32000);
    setEditLaborSub(emp.laborSub || 31800);
    setEditNhiSub(emp.nhiSub || 31800);
    setEditPensionSub(emp.pensionSub || 31800);
    setEditSupervisorId(emp.supervisorId || '');
    setEditSalaryType(emp.salaryType || 'monthly');
    setEditNhiDependents(emp.nhiDependents || 0);
    setEditMealAllowance(emp.mealAllowance || 0);
    setEditAttendanceBonus(emp.attendanceBonus || 0);
    setEditOtherAllowance(emp.otherAllowance || 0);
    setEditFileIdCard(emp.fileIdCard || '');
    setEditFileBankbook(emp.fileBankbook || '');
    setEditFileContract(emp.fileContract || '');
    setShowEditEmployeeModal(true);
  };

  const handleUpdateEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await updateDoc(doc(db, 'employees', editEmployeeId), {
        name: editEmpName,
        role: editEmpRole,
        status: editEmpStatus,
        identityNumber: editIdentityNumber,
        onboardDate: editOnboardDate,
        resignDate: editResignDate || null,
        bankAccount: editBankAccount,
        monthlySalary: Number(editMonthlySalary),
        laborSub: Number(editLaborSub),
        nhiSub: Number(editNhiSub),
        pensionSub: Number(editPensionSub),
        supervisorId: editSupervisorId,
        salaryType: editSalaryType,
        nhiDependents: Number(editNhiDependents),
        mealAllowance: Number(editMealAllowance),
        attendanceBonus: Number(editAttendanceBonus),
        otherAllowance: Number(editOtherAllowance),
        fileIdCard: editFileIdCard,
        fileBankbook: editFileBankbook,
        fileContract: editFileContract
      });
      setShowEditEmployeeModal(false);
    } catch (err) {
      console.error("Failed to update employee:", err);
      alert('更新失敗，請檢查權限');
    }
  };

  const handleDeleteEmployee = async (id: string) => {
    if (id === 'EMP001' || id === 'EMP002' || id === 'EMP003') {
      alert('模擬資料無法刪除。');
      return;
    }
    if (!window.confirm('確定要刪除此員工帳號與資料嗎？此動作將只刪除 Firestore 資料，Auth 帳號需由管理員至 Firebase 控制台管理。')) return;
    try {
      await deleteDoc(doc(db, 'employees', id));
    } catch (err) {
      console.error("Failed to delete employee:", err);
      alert('刪除失敗，請檢查權限');
    }
  };

  const runPayrollCalculation = async (monthStr: string, silent: boolean = false) => {
    if (!silent) {
      setPayError('');
      setPaySuccess('');
      setGeneratingPayroll(true);
    }

    try {
      let employeesList = employees;
      if (employeesList.length === 0 || employeesList[0].id === 'EMP001') {
        const querySnapshot = await getDocs(collection(db, 'employees'));
        employeesList = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() as any }));
      }

      if (employeesList.length === 0) {
        if (!silent) setPayError('目前沒有已註冊的員工，請先新增員工帳號。');
        return;
      }

      const attendanceSnapshot = await getDocs(collection(db, 'attendance'));
      const attendanceRecords = attendanceSnapshot.docs.map(doc => doc.data() as any);

      const leavesSnapshot = await getDocs(collection(db, 'leaves'));
      const approvedLeaves = leavesSnapshot.docs.map(d => d.data() as any).filter(l => l.status === 'approved');

      const { calculatePayrollInsurance, calculateOvertimePay } = await import('../utils/taiwanHrEngine');

      for (const emp of employeesList) {
        const isMock = emp.id === 'EMP001' || emp.id === 'EMP002' || emp.id === 'EMP003';
        
        let monthlySalary = emp.monthlySalary || 32000;
        let laborSub = emp.laborSub || 31800;
        let nhiSub = emp.nhiSub || 31800;
        let pensionSub = emp.pensionSub || 31800;
        let onboardDateStr = emp.onboardDate || '2025-01-01';
        let resignDateStr = emp.resignDate || null;
        const salaryType = emp.salaryType || 'monthly';
        const nhiDependents = emp.nhiDependents || 0;
        const mealAllowance = emp.mealAllowance || 0;
        const attendanceBonus = emp.attendanceBonus || 0;
        const otherAllowance = emp.otherAllowance || 0;

        if (isMock) {
          if (emp.role && emp.role.includes('工程師')) {
            monthlySalary = 45000; laborSub = 45800; nhiSub = 45800; pensionSub = 45800;
          } else if (emp.role && emp.role.includes('設計師')) {
            monthlySalary = 38000; laborSub = 38200; nhiSub = 38200; pensionSub = 38200;
          }
        }

        const isHourly = salaryType === 'hourly';
        const hourlyRate = isHourly ? monthlySalary : (monthlySalary / 240);

        const empAttendance = attendanceRecords.filter((rec: any) => 
          rec.employeeId === emp.id && 
          rec.date && rec.date.startsWith(monthStr)
        );

        const daysWorked = new Set(empAttendance.map((rec: any) => rec.date)).size;
        
        let calculatedBaseSalary = isHourly ? 0 : monthlySalary;
        let overtimePay = 0;
        
        const attendanceByDate: { [date: string]: any[] } = {};
        empAttendance.forEach((rec: any) => {
          if (!rec.date) return;
          if (!attendanceByDate[rec.date]) attendanceByDate[rec.date] = [];
          attendanceByDate[rec.date].push(rec);
        });

        Object.keys(attendanceByDate).forEach(date => {
          const dayRecords = attendanceByDate[date];
          const inRec = dayRecords.find(r => r.type === '上班');
          const outRec = dayRecords.find(r => r.type === '下班');
          if (inRec && outRec && inRec.time && outRec.time) {
            const parseTime = (timeStr: string) => {
              const [h, m] = timeStr.split(':').map(Number);
              return h + m / 60;
            };
            const inTime = parseTime(inRec.time);
            let outTime = parseTime(outRec.time);
            if (outTime < inTime) outTime += 24;

            if (outTime > inTime) {
              let hours = outTime - inTime;
              
              // 扣除排班中空/休息時間
              const dateSched = schedules.find((s: any) => s.employeeId === emp.id && s.date === date);
              if (dateSched) {
                const shiftName = dateSched.shift.split(' (')[0];
                const shiftDef = shifts.find(s => s.name === shiftName);
                if (shiftDef && shiftDef.breakStartTime && shiftDef.breakEndTime) {
                  const bStart = parseTime(shiftDef.breakStartTime);
                  let bEnd = parseTime(shiftDef.breakEndTime);
                  if (bEnd < bStart) bEnd += 24;
                  
                  let adjustedBStart = bStart;
                  let adjustedBEnd = bEnd;
                  if (adjustedBStart < inTime && adjustedBStart + 24 >= inTime && adjustedBStart + 24 <= outTime) {
                    adjustedBStart += 24;
                    adjustedBEnd += 24;
                  } else if (adjustedBStart + 24 >= inTime && adjustedBStart + 24 <= outTime) {
                    adjustedBStart += 24;
                    adjustedBEnd += 24;
                  } else if (adjustedBStart - 24 >= inTime) {
                    adjustedBStart -= 24;
                    adjustedBEnd -= 24;
                  }
                  
                  const startOverlap = Math.max(inTime, adjustedBStart);
                  const endOverlap = Math.min(outTime, adjustedBEnd);
                  const overlap = Math.max(0, endOverlap - startOverlap);
                  hours = Math.max(0, hours - overlap);
                }
              }

              if (isHourly) {
                const isOriginalHoliday = holidays.some(h => h.date === date);
                if (isOriginalHoliday) {
                  const regHours = Math.min(hours, 8);
                  calculatedBaseSalary += regHours * hourlyRate;
                  overtimePay += regHours * hourlyRate;
                  if (hours > 8) overtimePay += calculateOvertimePay(hourlyRate, hours - 8, 'regular');
                } else {
                  calculatedBaseSalary += Math.min(hours, 8) * hourlyRate;
                  if (hours > 8) overtimePay += calculateOvertimePay(hourlyRate, hours - 8, 'regular');
                }
              } else {
                const isMonthlyHoliday = holidays.some(h => h.movedDate ? h.movedDate === date : h.date === date);
                if (isMonthlyHoliday) {
                  overtimePay += calculateOvertimePay(hourlyRate, hours, 'holiday');
                } else if (hours > 8) {
                  const overtimeHours = hours - 8;
                  const d = new Date(date);
                  const dayOfWeek = d.getDay();
                  let dayType: 'regular' | 'rest' | 'holiday' = 'regular';
                  if (dayOfWeek === 6) dayType = 'rest';
                  else if (dayOfWeek === 0) dayType = 'holiday';
                  overtimePay += calculateOvertimePay(hourlyRate, overtimeHours, dayType);
                }
              }
            }
          }
        });

        if (daysWorked === 0) {
          overtimePay = 0;
        }

        const dailyRate = monthlySalary / 30;
        let personalLeaveDays = 0;
        let sickLeaveDays = 0;
        
        const empLeaves = approvedLeaves.filter(l => l.employeeId === emp.id);
        for (const lv of empLeaves) {
          const lvStart = lv.startDate || '';
          const lvEnd = lv.endDate || '';
          if (!lvStart || !lvEnd) continue;
          
          const monthStartStr = `${monthStr}-01`;
          const [yr, mo] = monthStr.split('-').map(Number);
          const monthEndDate = new Date(yr, mo, 0);
          const monthEndStr = monthEndDate.toLocaleDateString('sv');
          
          const effectiveStart = lvStart < monthStartStr ? monthStartStr : lvStart;
          const effectiveEnd = lvEnd > monthEndStr ? monthEndStr : lvEnd;
          if (effectiveStart > effectiveEnd) continue;
          
          const days = Math.round((new Date(effectiveEnd).getTime() - new Date(effectiveStart).getTime()) / 86400000) + 1;
          
          if (lv.leaveType === 'personal') personalLeaveDays += days;
          else if (lv.leaveType === 'sick') sickLeaveDays += days;
        }
        
        const leaveDeduction = Math.round(personalLeaveDays * dailyRate * 1.0 + sickLeaveDays * dailyRate * 0.5);

        const ins = calculatePayrollInsurance(
          onboardDateStr,
          resignDateStr,
          monthStr,
          { laborSub, nhiSub, pensionSub, nhiDependents },
          insuranceRates
        );

        const deductions = ins.employeeLabor + ins.employeeNhi + leaveDeduction;
        const totalAllowance = mealAllowance + attendanceBonus + otherAllowance;
        const netSalary = calculatedBaseSalary + totalAllowance + overtimePay - deductions;
        
        const payrollId = `${emp.id}-${monthStr}`;
        const existingRecord = payroll.find(p => p.id === payrollId);
        const isPublished = existingRecord ? (existingRecord.isPublished ?? false) : false;

        await setDoc(doc(db, 'payroll', payrollId), {
          empName: emp.name,
          employeeId: emp.id,
          month: monthStr,
          baseSalary: calculatedBaseSalary,
          mealAllowance,
          attendanceBonus,
          otherAllowance,
          overtime: overtimePay,
          leaveDeduction,
          personalLeaveDays,
          sickLeaveDays,
          deductions,
          netSalary,
          status: existingRecord ? existingRecord.status : '待審核',
          isPublished,
          timestamp: new Date().getTime(),
          laborDays: ins.laborDays,
          employeeLabor: ins.employeeLabor,
          employerLabor: ins.employerLabor,
          employeeNhi: ins.employeeNhi,
          employerNhi: ins.employerNhi,
          employerPension: ins.employerPension,
          laborSub,
          nhiSub,
          pensionSub,
          nhiDependents
        });
      }

      if (!silent) {
        setPaySuccess(`${monthStr} 薪資計算生成完成！`);
        setTimeout(() => setPaySuccess(''), 3000);
      }
    } catch (err: any) {
      console.error(err);
      if (!silent) setPayError(err.message || '計算失敗');
    } finally {
      if (!silent) setGeneratingPayroll(false);
    }
  };

  const handleGeneratePayroll = async () => {
    await runPayrollCalculation(payMonthFilter, false);
  };

  const handlePublishSchedules = async () => {
    const monthStr = `${viewYear}-${String(viewMonth).padStart(2, '0')}`;
    if (!window.confirm(`確定要發佈 ${monthStr} 的所有排班表給員工檢視嗎？`)) return;
    try {
      const querySnapshot = await getDocs(
        query(collection(db, 'schedules'))
      );
      const batchDocs = querySnapshot.docs.filter(doc => {
        const data = doc.data();
        return data.date && data.date.startsWith(monthStr);
      });
      
      let count = 0;
      for (const d of batchDocs) {
        await updateDoc(doc(db, 'schedules', d.id), { isPublished: true });
        count++;
      }
      alert(`已成功發佈 ${count} 筆排班紀錄！`);
    } catch (err) {
      console.error(err);
      alert('發佈失敗，請稍後再試');
    }
  };

  const handleUnpublishSchedules = async () => {
    const monthStr = `${viewYear}-${String(viewMonth).padStart(2, '0')}`;
    if (!window.confirm(`確定要取消發佈 ${monthStr} 的所有排班表嗎？員工將無法查看。`)) return;
    try {
      const querySnapshot = await getDocs(
        query(collection(db, 'schedules'))
      );
      const batchDocs = querySnapshot.docs.filter(doc => {
        const data = doc.data();
        return data.date && data.date.startsWith(monthStr);
      });
      
      let count = 0;
      for (const d of batchDocs) {
        await updateDoc(doc(db, 'schedules', d.id), { isPublished: false });
        count++;
      }
      alert(`已取消發佈 ${count} 筆排班紀錄！`);
    } catch (err) {
      console.error(err);
      alert('操作失敗，請稍後再試');
    }
  };

  const handlePublishPayroll = async () => {
    const monthStr = payMonthFilter;
    if (!window.confirm(`確定要發佈 ${monthStr} 的所有薪資單給員工檢視嗎？`)) return;
    try {
      const querySnapshot = await getDocs(
        query(collection(db, 'payroll'), where('month', '==', monthStr))
      );
      let count = 0;
      for (const d of querySnapshot.docs) {
        await updateDoc(doc(db, 'payroll', d.id), { isPublished: true });
        count++;
      }
      alert(`已成功發佈 ${count} 筆薪資單！`);
    } catch (err) {
      console.error(err);
      alert('發佈失敗，請稍後再試');
    }
  };

  const handleUnpublishPayroll = async () => {
    const monthStr = payMonthFilter;
    if (!window.confirm(`確定要取消發佈 ${monthStr} 的所有薪資單嗎？`)) return;
    try {
      const querySnapshot = await getDocs(
        query(collection(db, 'payroll'), where('month', '==', monthStr))
      );
      let count = 0;
      for (const d of querySnapshot.docs) {
        await updateDoc(doc(db, 'payroll', d.id), { isPublished: false });
        count++;
      }
      alert(`已取消發佈 ${count} 筆薪資單！`);
    } catch (err) {
      console.error(err);
      alert('操作失敗，請稍後再試');
    }
  };

  const handleTogglePayrollPublish = async (id: string, currentPublished: boolean) => {
    if (id === '1' || id === '2') {
      alert('模擬資料無法直接修改。請使用真實資料進行操作。');
      return;
    }
    try {
      await updateDoc(doc(db, 'payroll', id), {
        isPublished: !currentPublished
      });
    } catch (err) {
      console.error("Failed to toggle payroll publication:", err);
    }
  };

  const handleTogglePayrollStatus = async (id: string, currentStatus: string) => {
    if (id === '1' || id === '2') {
      alert('模擬資料無法直接修改，請建立真實資料進行操作。');
      return;
    }
    try {
      const newStatus = currentStatus === '已發放' ? '待審核' : '已發放';
      await updateDoc(doc(db, 'payroll', id), {
        status: newStatus
      });
    } catch (err) {
      console.error("Failed to update payroll status:", err);
    }
  };

  const handleDeletePayroll = async (id: string) => {
    if (id === '1' || id === '2') {
      alert('模擬資料無法刪除。');
      return;
    }
    if (!window.confirm('確定要刪除此薪資單嗎？')) return;
    try {
      await deleteDoc(doc(db, 'payroll', id));
    } catch (err) {
      console.error("Failed to delete payroll:", err);
      alert('刪除失敗，請檢查權限');
    }
  };

  const handleOpenEditPayroll = (record: any) => {
    if (record.id === '1' || record.id === '2') {
      alert('模擬資料無法編輯。請新增真實資料以測試完整編輯功能。');
      return;
    }
    setEditPayrollId(record.id);
    setEditPayEmployeeName(record.empName);
    setEditPayMonth(record.month);
    setEditPayBaseSalary(record.baseSalary || 0);
    setEditPayOvertime(record.overtime || 0);
    setEditPayDeductions(record.deductions || 0);
    setEditPayStatus(record.status);
    setShowEditPayrollModal(true);
  };

  const handleUpdatePayroll = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const net = Number(editPayBaseSalary) + Number(editPayOvertime) - Number(editPayDeductions);
      await updateDoc(doc(db, 'payroll', editPayrollId), {
        baseSalary: Number(editPayBaseSalary),
        overtime: Number(editPayOvertime),
        deductions: Number(editPayDeductions),
        netSalary: net,
        status: editPayStatus
      });
      setShowEditPayrollModal(false);
    } catch (err) {
      console.error("Failed to update payroll:", err);
      alert('更新失敗，請檢查權限');
    }
  };

  const handleCreatePayrollManual = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addPayEmployeeId) {
      alert('請選擇員工');
      return;
    }
    try {
      const emp = employees.find(e => e.id === addPayEmployeeId);
      const empName = emp ? emp.name : '未知員工';
      const monthStr = addPayMonth || new Date().toISOString().substring(0, 7);
      const net = Number(addPayBaseSalary) + Number(addPayOvertime) - Number(addPayDeductions);
      const payrollId = `${addPayEmployeeId}-${monthStr}`;

      await setDoc(doc(db, 'payroll', payrollId), {
        empName: empName,
        employeeId: addPayEmployeeId,
        month: monthStr,
        baseSalary: Number(addPayBaseSalary),
        overtime: Number(addPayOvertime),
        deductions: Number(addPayDeductions),
        netSalary: net,
        status: '待審核',
        isPublished: false,
        timestamp: new Date().getTime()
      });

      setShowAddPayrollModal(false);
      setAddPayEmployeeId('');
      setAddPayBaseSalary(32000);
      setAddPayOvertime(0);
      setAddPayDeductions(1200);
    } catch (err) {
      console.error("Failed to create payroll manually:", err);
      alert('建立失敗，此月份薪資單可能已存在，或無寫入權限');
    }
  };

  // 記憶體過濾變數
  const filteredAttendance = attendance.filter(record => {
    const matchesDate = filterDate ? record.date === filterDate : true;
    const matchesName = searchTerm ? record.empName?.toLowerCase().includes(searchTerm.toLowerCase()) : true;
    return matchesDate && matchesName;
  });

  const filteredPayroll = payroll.filter(p => {
    return viewPayMonth ? p.month === viewPayMonth : true;
  });

  // 簽核與行政警示計算
  const pendingLeaves = leaves.filter(l => l.status === 'pending');
  const pendingOvertimes = overtimeReqs.filter(o => o.status === 'pending');
  
  const today = new Date();
  const probationEmployees = employees.filter(emp => {
    if (!emp.onboardDate) return false;
    const onboardTime = new Date(emp.onboardDate).getTime();
    const diffTime = today.getTime() - onboardTime;
    const diffDays = diffTime / (1000 * 60 * 60 * 24);
    // 試用期為 90 天
    return diffDays >= 0 && diffDays <= 90;
  });
  
  const missingBankEmployees = employees.filter(emp => !emp.bankAccount || emp.bankAccount.trim() === '');

  const attendanceExceptions = React.useMemo(() => {
    const list: Array<{ empName: string; date: string; type: string; message: string }> = [];
    const todayStr = new Date().toLocaleDateString('sv');
    
    // Group attendance by employeeId and date
    const attMap: { [empId: string]: { [date: string]: any[] } } = {};
    attendance.forEach(rec => {
      if (!rec.employeeId || !rec.date) return;
      if (!attMap[rec.employeeId]) attMap[rec.employeeId] = {};
      if (!attMap[rec.employeeId][rec.date]) attMap[rec.employeeId][rec.date] = [];
      attMap[rec.employeeId][rec.date].push(rec);
    });
    
    // Group leaves by employeeId
    const leavesMap: { [empId: string]: any[] } = {};
    leaves.forEach(l => {
      if (!l.employeeId) return;
      if (!leavesMap[l.employeeId]) leavesMap[l.employeeId] = [];
      leavesMap[l.employeeId].push(l);
    });
    
    // Scan schedules
    schedules.filter(s => s.date < todayStr).forEach(sched => {
      const empId = sched.employeeId;
      const date = sched.date;
      const empLeaves = leavesMap[empId] || [];
      
      const hasLeave = empLeaves.some(l => l.startDate <= date && l.endDate >= date && l.status === 'approved');
      if (hasLeave) return;
      
      const dayAtt = (attMap[empId] && attMap[empId][date]) || [];
      const inRec = dayAtt.find(r => r.type === '上班');
      const outRec = dayAtt.find(r => r.type === '下班');
      
      if (!inRec && !outRec) {
        list.push({
          empName: sched.empName,
          date,
          type: '曠職',
          message: `無打卡紀錄 (${sched.shift})`
        });
      } else if (!inRec || !outRec) {
        list.push({
          empName: sched.empName,
          date,
          type: '缺卡',
          message: `${inRec ? '缺下班卡' : '缺上班卡'} (${sched.shift})`
        });
      } else {
        const statuses = dayAtt.map(r => r.status).filter(s => s && s !== '正常');
        if (statuses.length > 0) {
          list.push({
            empName: sched.empName,
            date,
            type: statuses.join('、'),
            message: `上班 ${inRec.time || '-'} / 下班 ${outRec.time || '-'} (班表: ${sched.shift})`
          });
        }
      }
    });
    
    return list.sort((a, b) => b.date.localeCompare(a.date));
  }, [schedules, attendance, leaves]);

  // 取得當月天數與首日星期
  const daysInMonth = new Date(viewYear, viewMonth, 0).getDate();
  const firstDayOfWeek = new Date(viewYear, viewMonth - 1, 1).getDay(); // 0 = Sun, 6 = Sat

  // 建立日曆網格格子
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDayOfWeek; i++) {
    cells.push(null);
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(d);
  }



  return (
    <div className="admin-layout">
      {isSidebarOpen && (
        <div className="sidebar-overlay" onClick={() => setIsSidebarOpen(false)}></div>
      )}
      <aside className={`admin-sidebar ${isSidebarOpen ? 'open' : ''}`}>
        <div className="admin-brand">
          <span className="icon">🛡️</span> 
          <h2>HR 管理後台</h2>
        </div>
        
        <nav className="admin-nav">
          <button 
            className={`nav-item ${activeTab === 'attendance' ? 'active' : ''}`}
            onClick={() => { setActiveTab('attendance'); setIsSidebarOpen(false); }}
          >
            📊 出勤紀錄
          </button>
          <button 
            className={`nav-item ${activeTab === 'employees' ? 'active' : ''}`}
            onClick={() => { setActiveTab('employees'); setIsSidebarOpen(false); }}
          >
            👥 員工管理
          </button>
          <button 
            className={`nav-item ${activeTab === 'schedules' ? 'active' : ''}`}
            onClick={() => { setActiveTab('schedules'); setIsSidebarOpen(false); }}
          >
            📅 排班系統
          </button>
          <button 
            className={`nav-item ${activeTab === 'payroll' ? 'active' : ''}`}
            onClick={() => { setActiveTab('payroll'); setIsSidebarOpen(false); }}
          >
            💰 薪資計算
          </button>
          <button 
            className={`nav-item ${activeTab === 'settings' ? 'active' : ''}`}
            onClick={() => { setActiveTab('settings'); setIsSidebarOpen(false); }}
            style={{ marginTop: 'auto' }}
          >
            ⚙️ 系統設定
          </button>
          <Link to="/" className="nav-item return-link" style={{ marginTop: '0' }} onClick={() => setIsSidebarOpen(false)}>
            ⬅️ 返回前台打卡
          </Link>
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-user">
            <div className="avatar">A</div>
            <div className="user-info">
              <span className="user-name">管理員</span>
              <span className="user-email">taidu.patisserie.2025@gmail.com</span>
            </div>
          </div>
          <button className="sidebar-logout-btn" onClick={handleSignOut}>登出</button>
        </div>
      </aside>

      <main className="admin-main">
        <header className="admin-header">
          <button 
            className={`hamburger-btn ${isSidebarOpen ? 'open' : ''}`}
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            aria-label="Toggle Sidebar"
          >
            <span></span>
            <span></span>
            <span></span>
          </button>
          <h1>
            {activeTab === 'attendance' && '今日出勤狀況'}
            {activeTab === 'employees' && '員工列表'}
            {activeTab === 'schedules' && '排班系統'}
            {activeTab === 'payroll' && '薪資計算'}
            {activeTab === 'settings' && '系統設定'}
          </h1>
          <div className="admin-user" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span>管理員 (Admin)</span>
            <div 
              className="avatar" 
              style={{ cursor: 'pointer' }} 
              onClick={() => setActiveTab('settings')}
              title="進入設定"
            >
              A
            </div>
            <button
              onClick={() => setActiveTab('settings')}
              style={{
                background: activeTab === 'settings' ? 'rgba(79, 70, 229, 0.1)' : 'rgba(0, 0, 0, 0.05)',
                color: activeTab === 'settings' ? 'var(--primary)' : 'var(--text-main)',
                border: activeTab === 'settings' ? '1px solid rgba(79, 70, 229, 0.2)' : '1px solid var(--border)',
                padding: '6px 12px',
                borderRadius: '6px',
                cursor: 'pointer',
                fontWeight: '600',
                fontSize: '13px',
                transition: 'all 0.2s ease',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}
            >
              ⚙️ 設定
            </button>
            <button 
              onClick={handleSignOut}
              style={{
                background: 'rgba(239, 68, 68, 0.1)',
                color: '#ef4444',
                border: '1px solid rgba(239, 68, 68, 0.2)',
                padding: '6px 12px',
                borderRadius: '6px',
                cursor: 'pointer',
                fontWeight: '600',
                fontSize: '13px',
                transition: 'all 0.2s ease'
              }}
            >
              登出
            </button>
          </div>
        </header>

        <div className="admin-content fade-in">
          {activeTab === 'attendance' && (
            <>
              {/* 🔔 行政與簽核警示面板 */}
              <div className="alerts-approvals-panel" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px', marginBottom: '24px' }}>
                {/* 簽核區 */}
                <div className="card" style={{ padding: '24px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                    <span style={{ fontSize: '20px' }}>📋</span>
                    <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '700', color: 'var(--text-main)' }}>待處理差勤簽核</h3>
                  </div>
                  {pendingLeaves.length === 0 && pendingOvertimes.length === 0 ? (
                    <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
                      🎉 暫無待處理的假單或加班申請！
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '300px', overflowY: 'auto', paddingRight: '4px' }}>
                      {/* 請假單列表 */}
                      {pendingLeaves.map(lv => (
                        <div key={lv.id} style={{ padding: '12px', borderRadius: '10px', backgroundColor: '#f9fafb', border: '1px solid var(--border)', fontSize: '13px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                            <span style={{ fontWeight: '700', color: 'var(--text-main)' }}>{lv.empName} (請假)</span>
                            <span style={{ color: 'var(--primary)', fontWeight: '600' }}>
                              {LEAVE_TYPES.find(t => t.value === lv.leaveType)?.label || lv.leaveType}
                            </span>
                          </div>
                          <div style={{ color: 'var(--text-muted)', fontSize: '12px', marginBottom: '8px' }}>
                            時間：{lv.startDate} ~ {lv.endDate} ({lv.hours}小時)
                            {lv.reason && <div style={{ marginTop: '2px', fontStyle: 'italic' }}>事由：{lv.reason}</div>}
                          </div>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <button
                              onClick={() => handleApproveLeave(lv.id)}
                              style={{ flex: 1, padding: '6px', borderRadius: '6px', border: 'none', backgroundColor: '#10b981', color: '#fff', fontSize: '12px', fontWeight: '700', cursor: 'pointer' }}
                            >
                              核准
                            </button>
                            <button
                              onClick={() => handleRejectLeave(lv.id)}
                              style={{ flex: 1, padding: '6px', borderRadius: '6px', border: 'none', backgroundColor: '#ef4444', color: '#fff', fontSize: '12px', fontWeight: '700', cursor: 'pointer' }}
                            >
                              駁回
                            </button>
                          </div>
                        </div>
                      ))}
                      
                      {/* 加班單列表 */}
                      {pendingOvertimes.map(ot => (
                        <div key={ot.id} style={{ padding: '12px', borderRadius: '10px', backgroundColor: '#f9fafb', border: '1px solid var(--border)', fontSize: '13px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                            <span style={{ fontWeight: '700', color: 'var(--text-main)' }}>{ot.empName} (加班)</span>
                            <span style={{ color: '#059669', fontWeight: '600' }}>{ot.hours}小時</span>
                          </div>
                          <div style={{ color: 'var(--text-muted)', fontSize: '12px', marginBottom: '8px' }}>
                            日期：{ot.date}
                            {ot.reason && <div style={{ marginTop: '2px', fontStyle: 'italic' }}>原因：{ot.reason}</div>}
                          </div>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <button
                              onClick={() => handleApproveOT(ot.id)}
                              style={{ flex: 1, padding: '6px', borderRadius: '6px', border: 'none', backgroundColor: '#10b981', color: '#fff', fontSize: '12px', fontWeight: '700', cursor: 'pointer' }}
                            >
                              核准
                            </button>
                            <button
                              onClick={() => handleRejectOT(ot.id)}
                              style={{ flex: 1, padding: '6px', borderRadius: '6px', border: 'none', backgroundColor: '#ef4444', color: '#fff', fontSize: '12px', fontWeight: '700', cursor: 'pointer' }}
                            >
                              駁回
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* 行政警示區 */}
                <div className="card" style={{ padding: '24px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                    <span style={{ fontSize: '20px' }}>🔔</span>
                    <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '700', color: 'var(--text-main)' }}>行政與法規警示</h3>
                  </div>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    {/* 試用期警示 */}
                    <div style={{ padding: '12px', borderRadius: '10px', backgroundColor: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.15)', fontSize: '13px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: '700', color: '#d97706', marginBottom: '6px' }}>
                        <span>⏱️</span>
                        <span>新進員工試用期追蹤 (到職未滿90天)</span>
                      </div>
                      {probationEmployees.length === 0 ? (
                        <div style={{ color: 'var(--text-muted)', fontSize: '12px' }}>目前無新進試用期員工。</div>
                      ) : (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px' }}>
                          {probationEmployees.map(emp => {
                            // 計算到職天數
                            const diffDays = Math.floor((today.getTime() - new Date(emp.onboardDate).getTime()) / (1000 * 60 * 60 * 24));
                            return (
                              <span key={emp.id} style={{ display: 'inline-block', padding: '3px 8px', borderRadius: '6px', backgroundColor: 'rgba(245,158,11,0.12)', color: '#d97706', fontSize: '12px', fontWeight: '600' }}>
                                {emp.name} (已到職 {diffDays} 天)
                              </span>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* 銀行帳號未填警示 */}
                    <div style={{ padding: '12px', borderRadius: '10px', backgroundColor: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)', fontSize: '13px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: '700', color: '#dc2626', marginBottom: '6px' }}>
                        <span>🏦</span>
                        <span>銀行帳號未填警示 (會影響薪資匯款)</span>
                      </div>
                      {missingBankEmployees.length === 0 ? (
                        <div style={{ color: 'var(--text-muted)', fontSize: '12px' }}>所有員工皆已填寫銀行帳號。</div>
                      ) : (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px' }}>
                          {missingBankEmployees.map(emp => (
                            <span key={emp.id} style={{ display: 'inline-block', padding: '3px 8px', borderRadius: '6px', backgroundColor: 'rgba(239,68,68,0.12)', color: '#dc2626', fontSize: '12px', fontWeight: '600' }}>
                              {emp.name}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* 出勤異常彙整 */}
                    <div style={{ padding: '12px', borderRadius: '10px', backgroundColor: 'rgba(168,85,247,0.06)', border: '1px solid rgba(168,85,247,0.15)', fontSize: '13px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: '700', color: '#7c3aed', marginBottom: '6px' }}>
                        <span>⚠️</span>
                        <span>全員出勤異常彙整 (近期)</span>
                        {attendanceExceptions.length > 0 && (
                          <span style={{ marginLeft: 'auto', background: 'rgba(168,85,247,0.15)', color: '#7c3aed', borderRadius: '99px', padding: '1px 8px', fontSize: '11px' }}>
                            {attendanceExceptions.length} 筆
                          </span>
                        )}
                      </div>
                      {attendanceExceptions.length === 0 ? (
                        <div style={{ color: 'var(--text-muted)', fontSize: '12px' }}>近期無出勤異常紀錄。</div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', maxHeight: '120px', overflowY: 'auto', marginTop: '4px' }}>
                          {attendanceExceptions.slice(0, 20).map((ex, i) => (
                            <div key={i} style={{ fontSize: '12px', color: '#4b5563', display: 'flex', gap: '6px' }}>
                              <span style={{ color: '#9ca3af', minWidth: '82px' }}>{ex.date}</span>
                              <span style={{ color: '#6b21a8', fontWeight: '600', minWidth: '32px' }}>{ex.empName}</span>
                              <span style={{ color: '#7c3aed', fontWeight: '700', minWidth: '36px' }}>[{ex.type}]</span>
                              <span>{ex.message}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
              <div className="card">
                <div className="card-header">
                  <h3>即時打卡紀錄</h3>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button className="btn-primary btn-sm" onClick={handleExportAttendanceCSV}>匯出出勤表</button>
                    <button className="btn-primary btn-sm" onClick={handleExportInsuranceEnrollmentCSV}>匯出加保申報表 (CSV)</button>
                  </div>
                </div>

              {/* 搜尋與日期篩選器 */}
              <div className="filters-row" style={{ display: 'flex', gap: '16px', padding: '16px 24px', backgroundColor: '#f9fafb', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
                <div className="filter-group" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '13px', fontWeight: '600' }}>搜尋員工：</span>
                  <input 
                    type="text" 
                    placeholder="輸入員工姓名..." 
                    value={searchTerm} 
                    onChange={(e) => setSearchTerm(e.target.value)} 
                    style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '13px', backgroundColor: '#fff' }}
                  />
                </div>
                <div className="filter-group" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '13px', fontWeight: '600' }}>日期篩選：</span>
                  <input 
                    type="date" 
                    value={filterDate} 
                    onChange={(e) => setFilterDate(e.target.value)} 
                    style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '13px', backgroundColor: '#fff' }}
                  />
                  {filterDate && (
                    <button 
                      onClick={() => setFilterDate('')} 
                      style={{ fontSize: '12px', color: '#ef4444', fontWeight: '600', cursor: 'pointer' }}
                    >
                      清除
                    </button>
                  )}
                </div>
              </div>

              <div className="table-responsive">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>員工姓名</th>
                      <th>日期</th>
                      <th>時間</th>
                      <th>類型</th>
                      <th>狀態</th>
                      <th>打卡定位</th>
                      <th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAttendance.map(record => (
                      <tr key={record.id}>
                        <td data-label="員工姓名">{record.empName}</td>
                        <td data-label="日期">{record.date}</td>
                        <td data-label="時間">{record.time}</td>
                        <td data-label="類型">
                          <span className={`badge badge-${record.type === '上班' ? 'primary' : 'neutral'}`}>
                            {record.type}
                          </span>
                        </td>
                        <td data-label="狀態">
                          <span className={`badge badge-${record.status === '正常' ? 'success' : 'warning'}`}>
                            {record.status}
                          </span>
                        </td>
                        <td data-label="打卡定位">
                          {record.coords ? (
                            <a 
                              href={`https://www.google.com/maps?q=${record.coords.lat},${record.coords.lng}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="btn-text"
                              style={{ fontSize: '13px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                            >
                              📍 查看位置
                            </a>
                          ) : (
                            <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>無定位資料</span>
                          )}
                        </td>
                        <td data-label="操作" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                          <button 
                            className="btn-text" 
                            style={{ color: 'var(--primary)' }}
                            onClick={() => handleOpenEditAttendance(record)}
                          >
                            編輯
                          </button>
                          <button 
                            className="btn-text" 
                            style={{ color: '#ef4444' }}
                            onClick={() => handleDeleteAttendance(record.id)}
                          >
                            刪除
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

          {activeTab === 'employees' && (
            <div className="card">
              <div className="card-header">
                <h3>人員名單</h3>
                <button className="btn-primary btn-sm" onClick={() => setShowAddModal(true)}>+ 新增員工帳號</button>
              </div>
              <div className="table-responsive">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>員工編號</th>
                      <th>姓名</th>
                      <th>電子信箱</th>
                      <th>職位</th>
                      <th>計薪類型</th>
                      <th>帳號狀態</th>
                      <th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {employees.map(emp => (
                      <tr key={emp.id}>
                        <td data-label="員工編號" style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{emp.id}</td>
                        <td data-label="姓名">{emp.name}</td>
                        <td data-label="電子信箱">{emp.email || 'N/A'}</td>
                        <td data-label="職位">{emp.role}</td>
                        <td data-label="計薪類型">
                          <span className={`badge`} style={{ backgroundColor: emp.salaryType === 'hourly' ? '#f3f4f6' : 'rgba(79, 70, 229, 0.1)', color: emp.salaryType === 'hourly' ? '#4b5563' : 'var(--primary)', fontWeight: '600', padding: '4px 8px', borderRadius: '4px', fontSize: '12px' }}>
                            {emp.salaryType === 'hourly' ? '時薪工讀' : '月薪排班'}
                          </span>
                        </td>
                        <td data-label="帳號狀態">
                          <span className={`badge badge-${emp.status === 'active' ? 'success' : 'neutral'}`}>
                            {emp.status === 'active' ? '啟用中' : '已停用'}
                          </span>
                        </td>
                        <td data-label="操作" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                          <button 
                            className="btn-text" 
                            style={{ color: 'var(--primary)' }} 
                            onClick={() => handleOpenEditEmployee(emp)}
                          >
                            編輯
                          </button>
                          <button 
                            className="btn-text" 
                            style={{ color: '#ef4444' }} 
                            onClick={() => handleDeleteEmployee(emp.id)}
                          >
                            刪除
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {activeTab === 'schedules' && (
            <div className="schedule-layout">
              {/* 控制區 */}
              <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <h3 style={{ fontSize: '20px', fontWeight: '700', color: 'var(--primary)' }}>📅 {viewYear} 年 {viewMonth} 月 排班日曆</h3>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button onClick={handlePrevMonth} className="btn-text" style={{ padding: '6px 10px', border: '1px solid var(--border)', borderRadius: '6px' }}>◀</button>
                      <button onClick={handleNextMonth} className="btn-text" style={{ padding: '6px 10px', border: '1px solid var(--border)', borderRadius: '6px' }}>▶</button>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                    {/* 快速排班模式開關 */}
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', backgroundColor: isQuickSchedMode ? 'rgba(79, 70, 229, 0.1)' : 'transparent', padding: '6px 12px', borderRadius: '8px', border: `1px solid ${isQuickSchedMode ? 'rgba(79, 70, 229, 0.2)' : 'var(--border)'}`, transition: 'all 0.2s' }}>
                      <input 
                        type="checkbox" 
                        checked={isQuickSchedMode} 
                        onChange={(e) => {
                          setIsQuickSchedMode(e.target.checked);
                          if (e.target.checked && employees.length > 0 && !quickSchedEmpId) {
                            setQuickSchedEmpId(employees[0].id);
                          }
                        }}
                        style={{ cursor: 'pointer' }}
                      />
                      <span style={{ fontSize: '13px', fontWeight: '700', color: isQuickSchedMode ? 'var(--primary)' : 'var(--text-muted)' }}>⚡ 啟用快速排班模式</span>
                    </label>
                    
                    <button className="btn-primary btn-sm" onClick={() => {
                      setSchedDate(`${viewYear}-${String(viewMonth).padStart(2, '0')}-${String(new Date().getDate()).padStart(2, '0')}`);
                      setShowScheduleModal(true);
                    }}>+ 新增排班</button>
                    <button className="btn-primary btn-sm" onClick={handlePublishSchedules} style={{ backgroundColor: '#10b981' }}>
                      📢 發佈本月班表
                    </button>
                    <button className="btn-primary btn-sm" onClick={handleUnpublishSchedules} style={{ backgroundColor: '#ef4444' }}>
                      🔕 取消發佈本月班表
                    </button>
                  </div>
                </div>

                {isQuickSchedMode && (
                  <div className="glass-card" style={{ display: 'flex', gap: '16px', padding: '16px', borderRadius: '12px', backgroundColor: '#f5f3ff', border: '1px solid rgba(124, 58, 237, 0.15)', flexWrap: 'wrap', alignItems: 'center' }}>
                    <div style={{ fontSize: '13px', fontWeight: '700', color: '#6d28d9' }}>⚡ 快速排班設定：</div>
                    
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '13px', fontWeight: '600' }}>選擇員工：</span>
                      <select 
                        value={quickSchedEmpId} 
                        onChange={(e) => setQuickSchedEmpId(e.target.value)}
                        style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '13px', backgroundColor: '#fff' }}
                      >
                        {employees.map(emp => (
                          <option key={emp.id} value={emp.id}>{emp.name}</option>
                        ))}
                      </select>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '13px', fontWeight: '600' }}>選擇班別：</span>
                      <select 
                        value={quickSchedShift} 
                        onChange={(e) => setQuickSchedShift(e.target.value)}
                        style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '13px', backgroundColor: '#fff' }}
                      >
                        {shifts.map((s, idx) => {
                          const val = `${s.name} (${s.startTime} - ${s.endTime})`;
                          return <option key={idx} value={val}>{val}</option>;
                        })}
                      </select>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '13px', fontWeight: '600' }}>狀態：</span>
                      <select 
                        value={quickSchedStatus} 
                        onChange={(e) => setQuickSchedStatus(e.target.value)}
                        style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '13px', backgroundColor: '#fff' }}
                      >
                        <option value="已確認">已確認</option>
                        <option value="待確認">待確認</option>
                      </select>
                    </div>
                    <div style={{ fontSize: '12px', color: '#7c3aed', fontWeight: '500' }}>
                      💡 提示：設定後在日曆格子上點擊，可直接為該員工排班；若再次點擊則取消該日排班。
                    </div>
                  </div>
                )}
              </div>

              {/* 日曆網格與統計 */}
              <div className="calendar-stats-container" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                
                {/* 1. 日曆主體 */}
                <div className="card" style={{ padding: '16px', overflowX: 'auto' }}>
                  <div style={{ minWidth: '800px' }}>
                    {/* 星期標頭 */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '8px', marginBottom: '8px', textAlign: 'center', fontWeight: '700', fontSize: '14px' }}>
                      <div style={{ color: '#ef4444' }}>日</div>
                      <div>一</div>
                      <div>二</div>
                      <div>三</div>
                      <div>四</div>
                      <div>五</div>
                      <div style={{ color: '#f59e0b' }}>六</div>
                    </div>

                    {/* 日曆網格 */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '8px' }}>
                      {cells.map((day, idx) => {
                        if (day === null) {
                          return <div key={`empty-${idx}`} style={{ backgroundColor: '#f9fafb', border: '1px solid #f3f4f6', borderRadius: '8px', height: '120px' }}></div>;
                        }

                        const dateString = `${viewYear}-${String(viewMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                        const dayOfWeek = (idx % 7);
                        const origHoliday = holidays.find(h => h.date === dateString);
                        const movedHoliday = holidays.find(h => h.movedDate === dateString && h.movedDate !== h.date);
                        
                        // 計算當日排班
                        const daySchedules = schedules.filter(s => s.date === dateString);
                        
                        // 決定格子的背景底色
                        let cellBg = '#ffffff';
                        let dateColor = 'var(--text-main)';
                        let dayLabel = '';
                        let badgeBg = '#fde68a';
                        let badgeText = '#92400e';

                        if (movedHoliday) {
                          cellBg = '#f3e8ff'; // 月薪挪移假 (粉紫底)
                          dateColor = '#7c3aed';
                          dayLabel = `🔄 ${movedHoliday.name} (月薪挪移假)`;
                          badgeBg = '#d8b4fe';
                          badgeText = '#581c87';
                        } else if (origHoliday) {
                          cellBg = '#fee2e2'; // 原始國定假日 (粉紅底)
                          dateColor = '#ef4444';
                          if (origHoliday.movedDate !== origHoliday.date) {
                            dayLabel = `🎉 ${origHoliday.name} (原)`;
                          } else {
                            dayLabel = `🎉 ${origHoliday.name}`;
                          }
                          badgeBg = '#fca5a5';
                          badgeText = '#991b1b';
                        } else if (dayOfWeek === 0) {
                          cellBg = '#fff5f5'; // 週日例假日 (淺紅底)
                          dateColor = '#ef4444';
                          dayLabel = '例假日';
                          badgeBg = '#fca5a5';
                          badgeText = '#991b1b';
                        } else if (dayOfWeek === 6) {
                          cellBg = '#fef3c7'; // 週六休息日 (淺黃底)
                          dateColor = '#d97706';
                          dayLabel = '休息日';
                          badgeBg = '#fde68a';
                          badgeText = '#92400e';
                        }

                        return (
                          <div 
                            key={`day-${day}`} 
                            onClick={() => {
                              if (isQuickSchedMode) {
                                handleQuickAddSchedule(dateString);
                              }
                            }}
                            style={{
                              backgroundColor: cellBg,
                              border: isQuickSchedMode ? '2px dashed #7c3aed' : '1px solid var(--border)',
                              borderRadius: '8px',
                              height: '120px',
                              padding: '6px',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '4px',
                              position: 'relative',
                              cursor: isQuickSchedMode ? 'pointer' : 'default',
                              transition: 'all 0.2s',
                              boxShadow: isQuickSchedMode ? '0 0 8px rgba(124,58,237,0.1)' : 'none'
                            }}
                            onMouseEnter={(e) => {
                              if (isQuickSchedMode) e.currentTarget.style.borderColor = '#6d28d9';
                            }}
                            onMouseLeave={(e) => {
                              if (isQuickSchedMode) e.currentTarget.style.borderColor = '#7c3aed';
                            }}
                          >
                            {/* 日期與放假標記 */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ fontWeight: '700', fontSize: '14px', color: dateColor }}>{day}</span>
                              {dayLabel && (
                                <span style={{ fontSize: '9px', fontWeight: '700', padding: '1px 3px', borderRadius: '4px', backgroundColor: badgeBg, color: badgeText, whiteSpace: 'nowrap' }}>
                                  {dayLabel}
                                </span>
                              )}
                            </div>

                            {/* 人力狀態摘要 */}
                            <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '2px' }}>
                              今日：{daySchedules.length} 人
                            </div>

                            {/* 已排員工標籤列表 */}
                            <div className="day-schedules-list" style={{
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '3px',
                              overflowY: 'auto',
                              flex: 1,
                              paddingRight: '2px'
                            }}>
                              {daySchedules.map(sched => (
                                <div 
                                  key={sched.id}
                                  onClick={(e) => {
                                    e.stopPropagation(); // 阻止觸發格子點擊
                                    handleOpenEditSchedule(sched);
                                  }}
                                  style={{
                                    fontSize: '11px',
                                    fontWeight: '500',
                                    backgroundColor: sched.status === '已確認' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                                    color: sched.status === '已確認' ? '#065f46' : '#92400e',
                                    border: `1px solid ${sched.status === '已確認' ? 'rgba(16, 185, 129, 0.25)' : 'rgba(245, 158, 11, 0.25)'}`,
                                    borderRadius: '4px',
                                    padding: '2px 4px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    cursor: 'pointer'
                                  }}
                                >
                                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={`${sched.empName} (${sched.shift})`}>
                                    {sched.empName} ({sched.shift.split(' ')[0]})
                                  </span>
                                  <span 
                                    onClick={(e) => {
                                      e.stopPropagation(); // 阻止觸發編輯彈窗
                                      handleDeleteSchedule(sched.id);
                                    }}
                                    style={{
                                      fontSize: '12px',
                                      fontWeight: '800',
                                      marginLeft: '4px',
                                      color: '#ef4444',
                                      cursor: 'pointer',
                                      padding: '0 2px'
                                    }}
                                    title="刪除排班"
                                  >
                                    ×
                                  </span>
                                </div>
                              ))}
                            </div>

                            {/* 常規新增按鈕 (非快速模式下) */}
                            {!isQuickSchedMode && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSchedDate(dateString);
                                  setShowScheduleModal(true);
                                }}
                                style={{
                                  position: 'absolute',
                                  right: '6px',
                                  bottom: '6px',
                                  width: '18px',
                                  height: '18px',
                                  borderRadius: '50%',
                                  backgroundColor: 'rgba(79, 70, 229, 0.1)',
                                  color: 'var(--primary)',
                                  fontSize: '12px',
                                  fontWeight: '800',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  cursor: 'pointer'
                                }}
                                title="在此日期新增排班"
                              >
                                +
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* 2. 員工排班與休假統計表格 */}
                <div className="card">
                  <div className="card-header" style={{ borderBottom: '1px solid var(--border)', paddingBottom: '12px', marginBottom: '16px' }}>
                    <h3 style={{ fontSize: '16px', fontWeight: '700', color: 'var(--primary)' }}>📊 員工排班與休假統計 ({viewYear} 年 {viewMonth} 月)</h3>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>* 餐飲業排假模式：月薪員工應休天數以當月紅字（例休＋挪移後假日）計算；時薪工讀為彈性排班不設限制。</span>
                  </div>

                  <div className="table-responsive">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>員工姓名</th>
                          <th>職位職稱</th>
                          <th>應排工作天</th>
                          <th>已排工作天</th>
                          <th>還需排工作天</th>
                          <th>當月應休天數</th>
                          <th>當月已休天數</th>
                          <th>還需排休天數</th>
                        </tr>
                      </thead>
                      <tbody>
                        {employees.map(emp => {
                          const empMonthScheds = schedules.filter(s => 
                            s.employeeId === emp.id && 
                            s.date && 
                            s.date.startsWith(`${viewYear}-${String(viewMonth).padStart(2, '0')}`)
                          );
                          const scheduledDays = empMonthScheds.length;
                          const isHourly = emp.salaryType === 'hourly';

                          // 針對月薪制計算個人應休與應排工作天
                          let personalRedDaysCount = 0;
                          for (let d = 1; d <= daysInMonth; d++) {
                            const dateStr = `${viewYear}-${String(viewMonth).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                            const dayOfWeek = new Date(viewYear, viewMonth - 1, d).getDay();
                            const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
                            const isMonthlyHoliday = holidays.some(h => h.movedDate ? h.movedDate === dateStr : h.date === dateStr);
                            if (isWeekend || isMonthlyHoliday) {
                              personalRedDaysCount++;
                            }
                          }
                          const personalTargetWorkDays = daysInMonth - personalRedDaysCount;
                          const remainingWorkDays = personalTargetWorkDays - scheduledDays;
                          const actualOffDays = daysInMonth - scheduledDays;
                          const remainingOffDays = personalRedDaysCount - actualOffDays;

                          return (
                            <tr key={emp.id}>
                              <td data-label="員工姓名" style={{ fontWeight: '600' }}>{emp.name}</td>
                              <td data-label="職位職稱">{emp.role}</td>
                              <td data-label="應排工作天">{isHourly ? <span style={{ color: 'var(--text-muted)' }}>時薪工讀</span> : `${personalTargetWorkDays} 天`}</td>
                              <td data-label="已排工作天">
                                <span style={{
                                  fontWeight: '700',
                                  color: isHourly ? 'var(--text-main)' : (scheduledDays === personalTargetWorkDays ? '#10b981' : (scheduledDays > personalTargetWorkDays ? '#3b82f6' : '#f59e0b'))
                                }}>
                                  {scheduledDays} 天
                                </span>
                              </td>
                              <td data-label="還需排工作天">
                                {isHourly ? (
                                  <span style={{ color: 'var(--text-muted)' }}>彈性排班</span>
                                ) : remainingWorkDays === 0 ? (
                                  <span style={{ color: '#10b981', fontWeight: '600' }}>✓ 已排滿</span>
                                ) : remainingWorkDays > 0 ? (
                                  <span style={{ color: '#f59e0b', fontWeight: '600' }}>還差 {remainingWorkDays} 天</span>
                                ) : (
                                  <span style={{ color: '#3b82f6', fontWeight: '600' }}>超排 {Math.abs(remainingWorkDays)} 天</span>
                                )}
                              </td>
                              <td data-label="當月應休天數">{isHourly ? <span style={{ color: 'var(--text-muted)' }}>時薪工讀</span> : `${personalRedDaysCount} 天`}</td>
                              <td data-label="當月已休天數">{actualOffDays} 天</td>
                              <td data-label="還需排休天數">
                                {isHourly ? (
                                  <span style={{ color: 'var(--text-muted)' }}>彈性排班</span>
                                ) : remainingOffDays === 0 ? (
                                  <span style={{ color: '#10b981', fontWeight: '600' }}>✓ 符合</span>
                                ) : remainingOffDays > 0 ? (
                                  <span style={{ color: '#f59e0b', fontWeight: '600' }}>還差 {remainingOffDays} 天</span>
                                ) : (
                                  <span style={{ color: '#3b82f6', fontWeight: '600' }}>多休 {Math.abs(remainingOffDays)} 天</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

              </div>
            </div>
          )}

          {activeTab === 'payroll' && (
            <div className="card">
              <div className="card-header">
                <h3>薪資結算管理</h3>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                  {payError && <span style={{ color: '#ef4444', fontSize: '13px' }}>⚠️ {payError}</span>}
                  {paySuccess && <span style={{ color: '#10b981', fontSize: '13px' }}>✅ {paySuccess}</span>}
                  
                  {/* 計算月份選擇器 */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '13px', fontWeight: '600' }}>結算月份：</span>
                    <input 
                      type="month" 
                      value={payMonthFilter} 
                      onChange={(e) => setPayMonthFilter(e.target.value)} 
                      style={{ padding: '6px 10px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '13px', backgroundColor: '#fff' }}
                    />
                  </div>

                  <button className="btn-primary btn-sm" onClick={handleGeneratePayroll} disabled={generatingPayroll}>
                    {generatingPayroll ? '計算中...' : '重新計算薪資'}
                  </button>
                  <button className="btn-primary btn-sm" onClick={() => setShowAddPayrollModal(true)}>
                    + 手動新增薪資單
                  </button>
                  <button className="btn-primary btn-sm" onClick={handlePublishPayroll} style={{ backgroundColor: '#10b981' }}>
                    📢 發佈當月薪資
                  </button>
                  <button className="btn-primary btn-sm" onClick={handleUnpublishPayroll} style={{ backgroundColor: '#ef4444' }}>
                    🔕 取消發佈當月薪資
                  </button>
                  <button className="btn-primary btn-sm" onClick={handleExportPayrollCSV}>
                    📥 匯出當月薪資總表
                  </button>
                </div>
              </div>

              {/* 顯示月份篩選 */}
              <div className="filters-row" style={{ display: 'flex', gap: '16px', padding: '16px 24px', backgroundColor: '#f9fafb', borderBottom: '1px solid var(--border)' }}>
                <div className="filter-group" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '13px', fontWeight: '600' }}>篩選顯示月份：</span>
                  <input 
                    type="month" 
                    value={viewPayMonth} 
                    onChange={(e) => setViewPayMonth(e.target.value)} 
                    style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '13px', backgroundColor: '#fff' }}
                  />
                  {viewPayMonth && (
                    <button 
                      onClick={() => setViewPayMonth('')} 
                      style={{ fontSize: '12px', color: '#ef4444', fontWeight: '600', cursor: 'pointer' }}
                    >
                      顯示全部
                    </button>
                  )}
                </div>
              </div>

              <div className="table-responsive">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>員工姓名</th>
                      <th>結算月份</th>
                      <th>底薪</th>
                      <th>加班費</th>
                      <th>扣款 (勞健保)</th>
                      <th>實發薪資</th>
                      <th>狀態</th>
                      <th>發佈狀態</th>
                      <th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPayroll.map(record => (
                      <tr key={record.id}>
                        <td data-label="員工姓名">{record.empName}</td>
                        <td data-label="結算月份">{record.month}</td>
                        <td data-label="底薪">NT$ {record.baseSalary?.toLocaleString()}</td>
                        <td data-label="加班費">NT$ {record.overtime?.toLocaleString()}</td>
                        <td data-label="扣款 (勞健保)">-NT$ {record.deductions?.toLocaleString()}</td>
                        <td data-label="實發薪資" style={{ fontWeight: '600', color: 'var(--primary)' }}>
                          NT$ {record.netSalary?.toLocaleString()}
                        </td>
                        <td data-label="狀態">
                          <span className={`badge badge-${record.status === '已發放' ? 'success' : 'neutral'}`}>
                            {record.status}
                          </span>
                        </td>
                        <td data-label="發佈狀態">
                          <span className={`badge badge-${record.isPublished ? 'success' : 'neutral'}`} style={{ backgroundColor: record.isPublished ? 'rgba(16,185,129,0.1)' : 'rgba(156,163,175,0.1)', color: record.isPublished ? '#10b981' : '#6b7280' }}>
                            {record.isPublished ? '已發佈' : '未發佈'}
                          </span>
                        </td>
                        <td data-label="操作" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                          <button className="btn-text" style={{ color: record.isPublished ? '#6b7280' : '#10b981' }} onClick={() => handleTogglePayrollPublish(record.id, record.isPublished)}>
                            {record.isPublished ? '取消發佈' : '發佈'}
                          </button>
                          <button className="btn-text" onClick={() => handleTogglePayrollStatus(record.id, record.status)}>
                            切換狀態
                          </button>
                          <button className="btn-text" style={{ color: 'var(--primary)' }} onClick={() => handleOpenEditPayroll(record)}>
                            編輯
                          </button>
                          <button className="btn-text" style={{ color: '#ef4444' }} onClick={() => handleDeletePayroll(record.id)}>
                            刪除
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'settings' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              
              {settingsSaveMsg.text && (
                <div style={{
                  padding: '12px 16px',
                  borderRadius: '8px',
                  backgroundColor: settingsSaveMsg.type === 'success' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                  color: settingsSaveMsg.type === 'success' ? '#10b981' : '#ef4444',
                  fontSize: '14px',
                  fontWeight: '500',
                  border: `1px solid ${settingsSaveMsg.type === 'success' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)'}`
                }}>
                  {settingsSaveMsg.type === 'success' ? '✅' : '⚠️'} {settingsSaveMsg.text}
                </div>
              )}

              <div className="settings-grid" style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))',
                gap: '24px'
              }}>
                {/* 1. 職位類別設定 */}
                <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div className="card-header" style={{ borderBottom: '1px solid var(--border)', paddingBottom: '12px' }}>
                    <h3 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--primary)' }}>💼 職位角色管理</h3>
                  </div>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '250px', overflowY: 'auto', paddingRight: '4px' }}>
                    {roles.map((role) => (
                      <div key={role} style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '10px 14px',
                        borderRadius: '8px',
                        backgroundColor: '#f9fafb',
                        border: '1px solid var(--border)'
                      }}>
                        <span style={{ fontWeight: '500', fontSize: '14px' }}>{role}</span>
                        <button 
                          onClick={() => handleDeleteRole(role)}
                          style={{
                            color: '#ef4444',
                            fontSize: '12px',
                            fontWeight: '600',
                            padding: '4px 8px',
                            borderRadius: '4px',
                            backgroundColor: 'rgba(239, 68, 68, 0.1)'
                          }}
                        >
                          刪除
                        </button>
                      </div>
                    ))}
                  </div>

                  <form style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                    <input 
                      type="text" 
                      placeholder="自訂職位名稱（如：主廚）"
                      value={customRoleName}
                      onChange={(e) => setCustomRoleName(e.target.value)}
                      style={{
                        flex: 1,
                        padding: '10px 14px',
                        borderRadius: '8px',
                        border: '1px solid var(--border)',
                        fontSize: '14px'
                      }}
                    />
                    <button 
                      type="button"
                      onClick={handleAddCustomRole}
                      style={{
                        backgroundColor: 'var(--primary)',
                        color: '#fff',
                        padding: '10px 16px',
                        borderRadius: '8px',
                        fontSize: '14px',
                        fontWeight: '600'
                      }}
                    >
                      新增
                    </button>
                  </form>
                </div>

                {/* 2. 班別時間設定 */}
                <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div className="card-header" style={{ borderBottom: '1px solid var(--border)', paddingBottom: '12px' }}>
                    <h3 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--primary)' }}>📅 班別時間設定</h3>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '250px', overflowY: 'auto', paddingRight: '4px' }}>
                    {shifts.map((s, index) => (
                      <div key={index} style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '10px 14px',
                        borderRadius: '8px',
                        backgroundColor: '#f9fafb',
                        border: '1px solid var(--border)'
                      }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <span style={{ fontWeight: '600', fontSize: '14px' }}>{s.name}</span>
                          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                            時間：{s.startTime} - {s.endTime}
                            {s.breakStartTime && s.breakEndTime && ` (休息：${s.breakStartTime} - ${s.breakEndTime})`}
                          </span>
                        </div>
                        <button 
                          onClick={() => handleDeleteShift(s.name)}
                          style={{
                            color: '#ef4444',
                            fontSize: '12px',
                            fontWeight: '600',
                            padding: '4px 8px',
                            borderRadius: '4px',
                            backgroundColor: 'rgba(239, 68, 68, 0.1)'
                          }}
                        >
                          刪除
                        </button>
                      </div>
                    ))}
                  </div>

                  <form onSubmit={handleAddShift} style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px',
                    padding: '12px',
                    borderRadius: '8px',
                    backgroundColor: '#f3f4f6',
                    marginTop: '8px'
                  }}>
                    <span style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-muted)' }}>新增班別</span>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <input 
                        type="text" 
                        required
                        placeholder="名稱 (如: 假日班)"
                        value={newShiftName}
                        onChange={(e) => setNewShiftName(e.target.value)}
                        style={{
                          flex: 1.2,
                          padding: '8px 10px',
                          borderRadius: '6px',
                          border: '1px solid var(--border)',
                          fontSize: '13px',
                          backgroundColor: '#fff'
                        }}
                      />
                      <input 
                        type="time" 
                        required
                        value={newShiftStart}
                        onChange={(e) => setNewShiftStart(e.target.value)}
                        style={{
                          flex: 1,
                          padding: '8px 6px',
                          borderRadius: '6px',
                          border: '1px solid var(--border)',
                          fontSize: '13px',
                          backgroundColor: '#fff'
                        }}
                      />
                      <input 
                        type="time" 
                        required
                        value={newShiftEnd}
                        onChange={(e) => setNewShiftEnd(e.target.value)}
                        style={{
                          flex: 1,
                          padding: '8px 6px',
                          borderRadius: '6px',
                          border: '1px solid var(--border)',
                          fontSize: '13px',
                          backgroundColor: '#fff'
                        }}
                      />
                    </div>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '4px' }}>
                      <span style={{ fontSize: '12px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>中空休息：</span>
                      <input 
                        type="time" 
                        value={newShiftBreakStart}
                        onChange={(e) => setNewShiftBreakStart(e.target.value)}
                        style={{
                          flex: 1,
                          padding: '6px 8px',
                          borderRadius: '6px',
                          border: '1px solid var(--border)',
                          fontSize: '12px',
                          backgroundColor: '#fff'
                        }}
                      />
                      <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>至</span>
                      <input 
                        type="time" 
                        value={newShiftBreakEnd}
                        onChange={(e) => setNewShiftBreakEnd(e.target.value)}
                        style={{
                          flex: 1,
                          padding: '6px 8px',
                          borderRadius: '6px',
                          border: '1px solid var(--border)',
                          fontSize: '12px',
                          backgroundColor: '#fff'
                        }}
                      />
                      {(newShiftBreakStart || newShiftBreakEnd) && (
                        <button 
                          type="button" 
                          onClick={() => { setNewShiftBreakStart(''); setNewShiftBreakEnd(''); }}
                          style={{ fontSize: '11px', color: '#ef4444', border: 'none', background: 'none', cursor: 'pointer' }}
                        >
                          清除
                        </button>
                      )}
                    </div>
                    <button 
                      type="submit"
                      style={{
                        backgroundColor: 'var(--secondary)',
                        color: '#fff',
                        padding: '8px 12px',
                        borderRadius: '6px',
                        fontSize: '13px',
                        fontWeight: '600',
                        textAlign: 'center'
                      }}
                    >
                      + 建立新班別
                    </button>
                  </form>
                </div>
              </div>

              {/* 3. 保費費率與差勤規則設定 */}
              <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div className="card-header" style={{ borderBottom: '1px solid var(--border)', paddingBottom: '12px' }}>
                  <h3 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--primary)' }}>⚙️ 台灣勞健退費率與差勤規則</h3>
                </div>

                <form onSubmit={handleSaveInsuranceAndRules} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                    gap: '20px'
                  }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <label style={{ fontSize: '13px', fontWeight: '600' }}>勞保總費率 (目前 12% = 0.12)</label>
                      <input 
                        type="number" 
                        step="0.0001"
                        required
                        value={cfgLaborRate}
                        onChange={(e) => setCfgLaborRate(Number(e.target.value))}
                        style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '14px', backgroundColor: '#fff' }}
                      />
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <label style={{ fontSize: '13px', fontWeight: '600' }}>健保費率 (目前 5.17% = 0.0517)</label>
                      <input 
                        type="number" 
                        step="0.0001"
                        required
                        value={cfgNhiRate}
                        onChange={(e) => setCfgNhiRate(Number(e.target.value))}
                        style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '14px', backgroundColor: '#fff' }}
                      />
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <label style={{ fontSize: '13px', fontWeight: '600' }}>健保平均眷屬數 (預設 0.56)</label>
                      <input 
                        type="number" 
                        step="0.01"
                        required
                        value={cfgNhiAvgDeps}
                        onChange={(e) => setCfgNhiAvgDeps(Number(e.target.value))}
                        style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '14px', backgroundColor: '#fff' }}
                      />
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <label style={{ fontSize: '13px', fontWeight: '600' }}>勞保員工自付比例 (預設 20% = 0.2)</label>
                      <input 
                        type="number" 
                        step="0.05"
                        required
                        value={cfgEmpLaborRatio}
                        onChange={(e) => setCfgEmpLaborRatio(Number(e.target.value))}
                        style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '14px', backgroundColor: '#fff' }}
                      />
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <label style={{ fontSize: '13px', fontWeight: '600' }}>勞保雇主公提比例 (預設 70% = 0.7)</label>
                      <input 
                        type="number" 
                        step="0.05"
                        required
                        value={cfgEmprLaborRatio}
                        onChange={(e) => setCfgEmprLaborRatio(Number(e.target.value))}
                        style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '14px', backgroundColor: '#fff' }}
                      />
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <label style={{ fontSize: '13px', fontWeight: '600' }}>健保員工自付比例 (預設 30% = 0.3)</label>
                      <input 
                        type="number" 
                        step="0.05"
                        required
                        value={cfgEmpNhiRatio}
                        onChange={(e) => setCfgEmpNhiRatio(Number(e.target.value))}
                        style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '14px', backgroundColor: '#fff' }}
                      />
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <label style={{ fontSize: '13px', fontWeight: '600' }}>健保雇主公提比例 (預設 60% = 0.6)</label>
                      <input 
                        type="number" 
                        step="0.05"
                        required
                        value={cfgEmprNhiRatio}
                        onChange={(e) => setCfgEmprNhiRatio(Number(e.target.value))}
                        style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '14px', backgroundColor: '#fff' }}
                      />
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <label style={{ fontSize: '13px', fontWeight: '600' }}>跨夜打卡匹配容許小時 (預設 4 小時)</label>
                      <input 
                        type="number" 
                        required
                        value={cfgToleranceHours}
                        onChange={(e) => setCfgToleranceHours(Number(e.target.value))}
                        style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '14px', backgroundColor: '#fff' }}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
                    <button 
                      type="submit"
                      style={{
                        backgroundColor: 'var(--primary)',
                        color: '#fff',
                        padding: '12px 24px',
                        borderRadius: '8px',
                        fontSize: '15px',
                        fontWeight: '600',
                        boxShadow: 'var(--shadow-md)'
                      }}
                    >
                      💾 儲存所有費率與差勤規則
                    </button>
                  </div>
                </form>
              </div>

              {/* 4. 國定假日與挪移管理 */}
              <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div className="card-header" style={{ borderBottom: '1px solid var(--border)', paddingBottom: '12px' }}>
                  <h3 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--primary)' }}>🎉 國定假日與挪移管理</h3>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                    * 說明：在此管理國定假日。若要「挪移」國定假日，輸入已存在的假日名稱（例如「端午節」）並選擇新的日期儲存，系統應休天數將會連動計算。
                  </span>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '300px', overflowY: 'auto', paddingRight: '4px', border: '1px solid var(--border)', borderRadius: '8px', padding: '12px', backgroundColor: '#f9fafb' }}>
                    <span style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-muted)', marginBottom: '4px' }}>目前登記之假日清單：</span>
                    {holidays.length === 0 ? (
                      <div style={{ fontSize: '13px', color: 'var(--text-muted)', textAlign: 'center', padding: '12px' }}>無登記國定假日</div>
                    ) : (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '8px' }}>
                        {holidays.map((h, index) => (
                          <div key={index} style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '8px 12px',
                            borderRadius: '6px',
                            backgroundColor: '#fff',
                            border: '1px solid var(--border)',
                            fontSize: '13px'
                          }}>
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                              <span style={{ fontWeight: '600' }}>{h.name}</span>
                              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                {h.movedDate && h.movedDate !== h.date ? `原 ${h.date} ➔ 移 ${h.movedDate}` : `${h.date}`}
                              </span>
                            </div>
                            <button 
                              type="button"
                              onClick={() => handleDeleteHoliday(h.name)}
                              style={{
                                color: '#ef4444',
                                fontSize: '11px',
                                fontWeight: '600',
                                padding: '2px 6px',
                                borderRadius: '4px',
                                backgroundColor: 'rgba(239, 68, 68, 0.1)'
                              }}
                            >
                              刪除
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <form onSubmit={handleSaveOrMoveHoliday} style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px',
                    padding: '16px',
                    borderRadius: '8px',
                    backgroundColor: '#f3f4f6',
                    marginTop: '8px'
                  }}>
                    <span style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-muted)' }}>新增或挪移假日</span>
                    <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <label style={{ fontSize: '12px', fontWeight: '600' }}>假日名稱 (例如：端午節)</label>
                        <input 
                          type="text" 
                          required
                          placeholder="請輸入假日名稱"
                          value={newHolidayName}
                          onChange={(e) => setNewHolidayName(e.target.value)}
                          style={{
                            padding: '8px 10px',
                            borderRadius: '6px',
                            border: '1px solid var(--border)',
                            fontSize: '13px',
                            backgroundColor: '#fff'
                          }}
                        />
                      </div>
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <label style={{ fontSize: '12px', fontWeight: '600' }}>原始日期</label>
                        <input 
                          type="date" 
                          required
                          value={newHolidayDate}
                          onChange={(e) => setNewHolidayDate(e.target.value)}
                          style={{
                            padding: '8px 10px',
                            borderRadius: '6px',
                            border: '1px solid var(--border)',
                            fontSize: '13px',
                            backgroundColor: '#fff'
                          }}
                        />
                      </div>
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <label style={{ fontSize: '12px', fontWeight: '600' }}>月薪挪移日期 (選填)</label>
                        <input 
                          type="date" 
                          value={newHolidayMovedDate}
                          onChange={(e) => setNewHolidayMovedDate(e.target.value)}
                          style={{
                            padding: '8px 10px',
                            borderRadius: '6px',
                            border: '1px solid var(--border)',
                            fontSize: '13px',
                            backgroundColor: '#fff'
                          }}
                        />
                      </div>
                    </div>
                    <button 
                      type="submit"
                      style={{
                        backgroundColor: 'var(--primary)',
                        color: '#fff',
                        padding: '10px 16px',
                        borderRadius: '6px',
                        fontSize: '13px',
                        fontWeight: '600',
                        textAlign: 'center',
                        alignSelf: 'flex-start',
                        marginTop: '4px'
                      }}
                    >
                      💾 儲存 / 挪移假日
                    </button>
                  </form>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* 新增員工彈窗 */}
      {showAddModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.4)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1000
        }}>
          <div className="glass-card" style={{
            width: '90%',
            maxWidth: '450px',
            padding: '32px',
            borderRadius: '16px',
            backgroundColor: '#ffffff',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
            maxHeight: '90vh',
            overflowY: 'auto'
          }}>
            <h3 style={{ marginBottom: '20px', color: 'var(--primary)', fontSize: '20px', fontWeight: '700' }}>新增員工帳號</h3>
            
            {addError && <div style={{ color: '#ef4444', backgroundColor: 'rgba(239, 68, 68, 0.1)', padding: '10px', borderRadius: '6px', marginBottom: '16px', fontSize: '14px' }}>⚠️ {addError}</div>}
            {addSuccess && <div style={{ color: '#10b981', backgroundColor: 'rgba(16, 185, 129, 0.1)', padding: '10px', borderRadius: '6px', marginBottom: '16px', fontSize: '14px' }}>✅ {addSuccess}</div>}

            <form onSubmit={handleCreateEmployee} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '13px', fontWeight: '600' }}>姓名</label>
                <input 
                  type="text" 
                  required 
                  value={newName} 
                  onChange={(e) => setNewName(e.target.value)} 
                  placeholder="例如：陳大明"
                  style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px' }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '13px', fontWeight: '600' }}>電子信箱 (作為登入帳號)</label>
                <input 
                  type="email" 
                  required 
                  value={newEmail} 
                  onChange={(e) => setNewEmail(e.target.value)} 
                  placeholder="employee@company.com"
                  style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px' }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '13px', fontWeight: '600' }}>初始密碼 (至少 6 碼)</label>
                <input 
                  type="password" 
                  required 
                  value={newPassword} 
                  onChange={(e) => setNewPassword(e.target.value)} 
                  placeholder="••••••••"
                  style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px' }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label style={{ fontSize: '13px', fontWeight: '600' }}>職位</label>
                  <div style={{ display: 'flex', gap: '12px' }}>
                    <button 
                      type="button" 
                      onClick={() => setShowAddRoleInput(!showAddRoleInput)}
                      style={{ fontSize: '12px', color: 'var(--primary)', fontWeight: '600', padding: 0, border: 'none', background: 'none', cursor: 'pointer' }}
                    >
                      + 新增自訂職務
                    </button>
                    {roles.length > 1 && (
                      <button 
                        type="button" 
                        onClick={(e) => {
                          e.preventDefault();
                          handleDeleteRole(newRole);
                        }}
                        style={{ fontSize: '12px', color: '#ef4444', fontWeight: '600', padding: 0, border: 'none', background: 'none', cursor: 'pointer' }}
                      >
                        🗑️ 刪除目前職務
                      </button>
                    )}
                  </div>
                </div>

                {showAddRoleInput && (
                  <div style={{ display: 'flex', gap: '8px', marginBottom: '4px' }}>
                    <input 
                      type="text" 
                      placeholder="新職務名稱，如：廚師" 
                      value={customRoleName}
                      onChange={(e) => setCustomRoleName(e.target.value)}
                      style={{ flex: 1, padding: '8px 12px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '13px' }}
                    />
                    <button 
                      type="button" 
                      onClick={handleAddCustomRole}
                      style={{ padding: '8px 12px', borderRadius: '6px', backgroundColor: 'var(--primary)', color: '#fff', fontSize: '13px', fontWeight: '600', border: 'none', cursor: 'pointer' }}
                    >
                      新增
                    </button>
                  </div>
                )}

                <select 
                  value={newRole} 
                  onChange={(e) => setNewRole(e.target.value)}
                  style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px', backgroundColor: '#fff' }}
                >
                  {roles.map(role => (
                    <option key={role} value={role}>{role}</option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '13px', fontWeight: '600' }}>身分證字號</label>
                <input 
                  type="text" 
                  required 
                  value={newIdentityNumber} 
                  onChange={(e) => setNewIdentityNumber(e.target.value.toUpperCase())} 
                  placeholder="例如：A123456789"
                  style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px' }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '13px', fontWeight: '600' }}>到職日期</label>
                <input 
                  type="date" 
                  required 
                  value={newOnboardDate} 
                  onChange={(e) => setNewOnboardDate(e.target.value)} 
                  style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px' }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '13px', fontWeight: '600' }}>銀行帳戶 (轉帳用)</label>
                <input 
                  type="text" 
                  required 
                  value={newBankAccount} 
                  onChange={(e) => setNewBankAccount(e.target.value)} 
                  placeholder="分行代號-帳號，例如：822-12345..."
                  style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px' }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '13px', fontWeight: '600' }}>計薪類型</label>
                <select 
                  value={newSalaryType} 
                  onChange={(e) => setNewSalaryType(e.target.value as 'monthly' | 'hourly')}
                  style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px', backgroundColor: '#fff' }}
                >
                  <option value="monthly">月薪排班</option>
                  <option value="hourly">時薪工讀</option>
                </select>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '13px', fontWeight: '600' }}>
                  {newSalaryType === 'hourly' ? '時薪底薪 (經常性薪資 NT$)' : '月薪底薪 (經常性薪資 NT$)'}
                </label>
                <input 
                  type="number" 
                  required 
                  value={newMonthlySalary} 
                  onChange={(e) => {
                    const sal = Number(e.target.value);
                    setNewMonthlySalary(sal);
                    setNewLaborSub(sal);
                    setNewNhiSub(sal);
                    setNewPensionSub(sal);
                  }} 
                  style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '12px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1 }}>
                  <label style={{ fontSize: '13px', fontWeight: '600' }}>勞保申報 (NT$)</label>
                  <input 
                    type="number" 
                    required 
                    value={newLaborSub} 
                    onChange={(e) => setNewLaborSub(Number(e.target.value))} 
                    style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px' }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1 }}>
                  <label style={{ fontSize: '13px', fontWeight: '600' }}>健保申報 (NT$)</label>
                  <input 
                    type="number" 
                    required 
                    value={newNhiSub} 
                    onChange={(e) => setNewNhiSub(Number(e.target.value))} 
                    style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px' }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '13px', fontWeight: '600' }}>勞退提繳工資 (NT$)</label>
                <input 
                  type="number" 
                  required 
                  value={newPensionSub} 
                  onChange={(e) => setNewPensionSub(Number(e.target.value))} 
                  style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px' }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '13px', fontWeight: '600' }}>直屬主管</label>
                <select 
                  value={newSupervisorId} 
                  onChange={(e) => setNewSupervisorId(e.target.value)}
                  style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px', backgroundColor: '#fff' }}
                >
                  <option value="">-- 無主管 --</option>
                  {employees
                    .filter(emp => emp.id !== 'EMP001' && emp.id !== 'EMP002' && emp.id !== 'EMP003') // 只對接真實員工
                    .map(emp => (
                      <option key={emp.id} value={emp.id}>{emp.name} ({emp.role})</option>
                    ))}
                </select>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '13px', fontWeight: '600' }}>健保實際扶養眷屬人數 (0-3 口，不含本人)</label>
                <select 
                  value={newNhiDependents} 
                  onChange={(e) => setNewNhiDependents(Number(e.target.value))}
                  style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px', backgroundColor: '#fff' }}
                >
                  <option value={0}>0 口</option>
                  <option value={1}>1 口</option>
                  <option value={2}>2 口</option>
                  <option value={3}>3 口</option>
                </select>
              </div>

              <div style={{ borderTop: '1px dashed #e5e7eb', marginTop: '8px', paddingTop: '12px' }}>
                <span style={{ fontSize: '14px', fontWeight: '700', color: 'var(--primary)' }}>💰 固定非經常性津貼項目</span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '12px', fontWeight: '600' }}>伙食津貼 (每月 NT$)</label>
                  <input 
                    type="number" 
                    value={newMealAllowance} 
                    onChange={(e) => setNewMealAllowance(Number(e.target.value))}
                    style={{ padding: '10px 12px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '13px' }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '12px', fontWeight: '600' }}>全勤獎金 (每月 NT$)</label>
                  <input 
                    type="number" 
                    value={newAttendanceBonus} 
                    onChange={(e) => setNewAttendanceBonus(Number(e.target.value))}
                    style={{ padding: '10px 12px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '13px' }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '12px', fontWeight: '600' }}>其他津貼 (每月 NT$)</label>
                <input 
                  type="number" 
                  value={newOtherAllowance} 
                  onChange={(e) => setNewOtherAllowance(Number(e.target.value))}
                  style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '13px' }}
                />
              </div>

              <div style={{ borderTop: '1px dashed #e5e7eb', marginTop: '8px', paddingTop: '12px' }}>
                <span style={{ fontSize: '14px', fontWeight: '700', color: 'var(--primary)' }}>📁 檔案管理 (人事資料附件)</span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '12px', fontWeight: '600' }}>身分證正反面影本</label>
                  <input 
                    type="file" 
                    accept="image/*,application/pdf"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        const reader = new FileReader();
                        reader.onloadend = () => setNewFileIdCard(reader.result as string);
                        reader.readAsDataURL(file);
                      }
                    }}
                    style={{ fontSize: '12px' }}
                  />
                  {newFileIdCard && <span style={{ fontSize: '11px', color: '#10b981' }}>✓ 已選取檔案</span>}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '12px', fontWeight: '600' }}>存摺封面影本</label>
                  <input 
                    type="file" 
                    accept="image/*,application/pdf"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        const reader = new FileReader();
                        reader.onloadend = () => setNewFileBankbook(reader.result as string);
                        reader.readAsDataURL(file);
                      }
                    }}
                    style={{ fontSize: '12px' }}
                  />
                  {newFileBankbook && <span style={{ fontSize: '11px', color: '#10b981' }}>✓ 已選取檔案</span>}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '12px', fontWeight: '600' }}>勞動契約 (PDF/圖片)</label>
                  <input 
                    type="file" 
                    accept="image/*,application/pdf"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        const reader = new FileReader();
                        reader.onloadend = () => setNewFileContract(reader.result as string);
                        reader.readAsDataURL(file);
                      }
                    }}
                    style={{ fontSize: '12px' }}
                  />
                  {newFileContract && <span style={{ fontSize: '11px', color: '#10b981' }}>✓ 已選取檔案</span>}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
                <button 
                  type="button" 
                  onClick={() => setShowAddModal(false)}
                  style={{ flex: 1, padding: '12px', borderRadius: '8px', border: '1px solid #d1d5db', backgroundColor: '#f3f4f6', cursor: 'pointer', fontWeight: '600', fontSize: '14px' }}
                >
                  取消
                </button>
                <button 
                  type="submit" 
                  disabled={creating}
                  style={{ flex: 1, padding: '12px', borderRadius: '8px', border: 'none', backgroundColor: 'var(--primary)', color: '#fff', cursor: 'pointer', fontWeight: '600', fontSize: '14px' }}
                >
                  {creating ? '建立中...' : '建立帳號'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 新增排班彈窗 */}
      {showScheduleModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.4)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1000
        }}>
          <div className="glass-card" style={{
            width: '90%',
            maxWidth: '450px',
            padding: '32px',
            borderRadius: '16px',
            backgroundColor: '#ffffff',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
          }}>
            <h3 style={{ marginBottom: '20px', color: 'var(--primary)', fontSize: '20px', fontWeight: '700' }}>新增排班</h3>
            
            {schedError && <div style={{ color: '#ef4444', backgroundColor: 'rgba(239, 68, 68, 0.1)', padding: '10px', borderRadius: '6px', marginBottom: '16px', fontSize: '14px' }}>⚠️ {schedError}</div>}
            {schedSuccess && <div style={{ color: '#10b981', backgroundColor: 'rgba(16, 185, 129, 0.1)', padding: '10px', borderRadius: '6px', marginBottom: '16px', fontSize: '14px' }}>✅ {schedSuccess}</div>}

            <form onSubmit={handleCreateSchedule} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '13px', fontWeight: '600' }}>選擇員工</label>
                <select 
                  required
                  value={schedEmployeeId} 
                  onChange={(e) => setSchedEmployeeId(e.target.value)}
                  style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px', backgroundColor: '#fff' }}
                >
                  <option value="">-- 請選擇員工 --</option>
                  {employees.map(emp => (
                    <option key={emp.id} value={emp.id}>{emp.name} ({emp.role})</option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '13px', fontWeight: '600' }}>排班日期</label>
                <input 
                  type="date" 
                  required 
                  value={schedDate} 
                  onChange={(e) => setSchedDate(e.target.value)} 
                  style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px' }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '13px', fontWeight: '600' }}>班別時間</label>
                <select 
                  value={schedShift} 
                  onChange={(e) => setSchedShift(e.target.value)}
                  style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px', backgroundColor: '#fff' }}
                >
                  {shifts.map((s, idx) => {
                    const str = `${s.name} (${s.startTime} - ${s.endTime})`;
                    return <option key={idx} value={str}>{str}</option>;
                  })}
                </select>
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
                <button 
                  type="button" 
                  onClick={() => setShowScheduleModal(false)}
                  style={{ flex: 1, padding: '12px', borderRadius: '8px', border: '1px solid #d1d5db', backgroundColor: '#f3f4f6', cursor: 'pointer', fontWeight: '600', fontSize: '14px' }}
                >
                  取消
                </button>
                <button 
                  type="submit" 
                  disabled={creatingSchedule}
                  style={{ flex: 1, padding: '12px', borderRadius: '8px', border: 'none', backgroundColor: 'var(--primary)', color: '#fff', cursor: 'pointer', fontWeight: '600', fontSize: '14px' }}
                >
                  {creatingSchedule ? '建立中...' : '確認排班'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 編輯排班彈窗 */}
      {showEditScheduleModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.4)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1000
        }}>
          <div className="glass-card" style={{
            width: '90%',
            maxWidth: '450px',
            padding: '32px',
            borderRadius: '16px',
            backgroundColor: '#ffffff',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
          }}>
            <h3 style={{ marginBottom: '20px', color: 'var(--primary)', fontSize: '20px', fontWeight: '700' }}>編輯排班</h3>
            <form onSubmit={handleUpdateSchedule} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '13px', fontWeight: '600' }}>選擇員工</label>
                <select 
                  required
                  value={editSchedEmployeeId} 
                  onChange={(e) => setEditSchedEmployeeId(e.target.value)}
                  style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px', backgroundColor: '#fff' }}
                >
                  {employees.map(emp => (
                    <option key={emp.id} value={emp.id}>{emp.name} ({emp.role})</option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '13px', fontWeight: '600' }}>排班日期</label>
                <input 
                  type="date" 
                  required 
                  value={editSchedDate} 
                  onChange={(e) => setEditSchedDate(e.target.value)} 
                  style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px' }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '13px', fontWeight: '600' }}>班別時間</label>
                <select 
                  value={editSchedShift} 
                  onChange={(e) => setEditSchedShift(e.target.value)}
                  style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px', backgroundColor: '#fff' }}
                >
                  {shifts.map((s, idx) => {
                    const str = `${s.name} (${s.startTime} - ${s.endTime})`;
                    return <option key={idx} value={str}>{str}</option>;
                  })}
                </select>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '13px', fontWeight: '600' }}>狀態</label>
                <select 
                  value={editSchedStatus} 
                  onChange={(e) => setEditSchedStatus(e.target.value)}
                  style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px', backgroundColor: '#fff' }}
                >
                  <option value="待確認">待確認</option>
                  <option value="已確認">已確認</option>
                </select>
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
                <button 
                  type="button" 
                  onClick={() => setShowEditScheduleModal(false)}
                  style={{ flex: 1, padding: '12px', borderRadius: '8px', border: '1px solid #d1d5db', backgroundColor: '#f3f4f6', cursor: 'pointer', fontWeight: '600', fontSize: '14px' }}
                >
                  取消
                </button>
                <button 
                  type="submit" 
                  style={{ flex: 1, padding: '12px', borderRadius: '8px', border: 'none', backgroundColor: 'var(--primary)', color: '#fff', cursor: 'pointer', fontWeight: '600', fontSize: '14px' }}
                >
                  儲存修改
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 手動新增薪資單彈窗 */}
      {showAddPayrollModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.4)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1000
        }}>
          <div className="glass-card" style={{
            width: '90%',
            maxWidth: '450px',
            padding: '32px',
            borderRadius: '16px',
            backgroundColor: '#ffffff',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
            maxHeight: '90vh',
            overflowY: 'auto'
          }}>
            <h3 style={{ marginBottom: '20px', color: 'var(--primary)', fontSize: '20px', fontWeight: '700' }}>手動新增薪資單</h3>
            <form onSubmit={handleCreatePayrollManual} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '13px', fontWeight: '600' }}>選擇員工</label>
                <select 
                  required
                  value={addPayEmployeeId} 
                  onChange={(e) => {
                    const empId = e.target.value;
                    setAddPayEmployeeId(empId);
                    const emp = employees.find(x => x.id === empId);
                    if (emp) {
                      let base = 32000;
                      if (emp.role && emp.role.includes('工程師')) base = 45000;
                      else if (emp.role && emp.role.includes('設計師')) base = 38000;
                      else if (emp.role && emp.role.includes('專案經理')) base = 50000;
                      setAddPayBaseSalary(base);
                    }
                  }}
                  style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px', backgroundColor: '#fff' }}
                >
                  <option value="">-- 請選擇員工 --</option>
                  {employees.map(emp => (
                    <option key={emp.id} value={emp.id}>{emp.name} ({emp.role})</option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '13px', fontWeight: '600' }}>結算月份</label>
                <input 
                  type="month" 
                  required 
                  value={addPayMonth} 
                  onChange={(e) => setAddPayMonth(e.target.value)} 
                  style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px' }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '13px', fontWeight: '600' }}>底薪 (NT$)</label>
                <input 
                  type="number" 
                  required 
                  value={addPayBaseSalary} 
                  onChange={(e) => setAddPayBaseSalary(Number(e.target.value))} 
                  style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px' }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '13px', fontWeight: '600' }}>加班費 (NT$)</label>
                <input 
                  type="number" 
                  required 
                  value={addPayOvertime} 
                  onChange={(e) => setAddPayOvertime(Number(e.target.value))} 
                  style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px' }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '13px', fontWeight: '600' }}>扣款 - 勞健保等 (NT$)</label>
                <input 
                  type="number" 
                  required 
                  value={addPayDeductions} 
                  onChange={(e) => setAddPayDeductions(Number(e.target.value))} 
                  style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
                <button 
                  type="button" 
                  onClick={() => setShowAddPayrollModal(false)}
                  style={{ flex: 1, padding: '12px', borderRadius: '8px', border: '1px solid #d1d5db', backgroundColor: '#f3f4f6', cursor: 'pointer', fontWeight: '600', fontSize: '14px' }}
                >
                  取消
                </button>
                <button 
                  type="submit" 
                  style={{ flex: 1, padding: '12px', borderRadius: '8px', border: 'none', backgroundColor: 'var(--primary)', color: '#fff', cursor: 'pointer', fontWeight: '600', fontSize: '14px' }}
                >
                  新增薪資單
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 編輯薪資單彈窗 */}
      {showEditPayrollModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.4)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1000
        }}>
          <div className="glass-card" style={{
            width: '90%',
            maxWidth: '450px',
            padding: '32px',
            borderRadius: '16px',
            backgroundColor: '#ffffff',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
            maxHeight: '90vh',
            overflowY: 'auto'
          }}>
            <h3 style={{ marginBottom: '20px', color: 'var(--primary)', fontSize: '20px', fontWeight: '700' }}>編輯薪資單</h3>
            <form onSubmit={handleUpdatePayroll} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '13px', fontWeight: '600' }}>員工姓名</label>
                <input 
                  type="text" 
                  disabled 
                  value={editPayEmployeeName} 
                  style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px', backgroundColor: '#f3f4f6', cursor: 'not-allowed' }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '13px', fontWeight: '600' }}>結算月份</label>
                <input 
                  type="month" 
                  disabled 
                  value={editPayMonth} 
                  style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px', backgroundColor: '#f3f4f6', cursor: 'not-allowed' }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '13px', fontWeight: '600' }}>底薪 (NT$)</label>
                <input 
                  type="number" 
                  required 
                  value={editPayBaseSalary} 
                  onChange={(e) => setEditPayBaseSalary(Number(e.target.value))} 
                  style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px' }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '13px', fontWeight: '600' }}>加班費 (NT$)</label>
                <input 
                  type="number" 
                  required 
                  value={editPayOvertime} 
                  onChange={(e) => setEditPayOvertime(Number(e.target.value))} 
                  style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px' }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '13px', fontWeight: '600' }}>扣款 - 勞健保等 (NT$)</label>
                <input 
                  type="number" 
                  required 
                  value={editPayDeductions} 
                  onChange={(e) => setEditPayDeductions(Number(e.target.value))} 
                  style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px' }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '13px', fontWeight: '600' }}>狀態</label>
                <select 
                  value={editPayStatus} 
                  onChange={(e) => setEditPayStatus(e.target.value)}
                  style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px', backgroundColor: '#fff' }}
                >
                  <option value="待審核">待審核</option>
                  <option value="已發放">已發放</option>
                </select>
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
                <button 
                  type="button" 
                  onClick={() => setShowEditPayrollModal(false)}
                  style={{ flex: 1, padding: '12px', borderRadius: '8px', border: '1px solid #d1d5db', backgroundColor: '#f3f4f6', cursor: 'pointer', fontWeight: '600', fontSize: '14px' }}
                >
                  取消
                </button>
                <button 
                  type="submit" 
                  style={{ flex: 1, padding: '12px', borderRadius: '8px', border: 'none', backgroundColor: 'var(--primary)', color: '#fff', cursor: 'pointer', fontWeight: '600', fontSize: '14px' }}
                >
                  儲存修改
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 編輯出勤紀錄彈窗 */}
      {showEditAttendanceModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.4)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1000
        }}>
          <div className="glass-card" style={{
            width: '90%',
            maxWidth: '450px',
            padding: '32px',
            borderRadius: '16px',
            backgroundColor: '#ffffff',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
          }}>
            <h3 style={{ marginBottom: '20px', color: 'var(--primary)', fontSize: '20px', fontWeight: '700' }}>編輯出勤紀錄</h3>
            <form onSubmit={handleUpdateAttendance} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '13px', fontWeight: '600' }}>員工姓名</label>
                <input 
                  type="text" 
                  disabled 
                  value={editAttName} 
                  style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px', backgroundColor: '#f3f4f6', cursor: 'not-allowed' }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '13px', fontWeight: '600' }}>打卡日期</label>
                <input 
                  type="date" 
                  required 
                  value={editAttDate} 
                  onChange={(e) => setEditAttDate(e.target.value)} 
                  style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px' }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '13px', fontWeight: '600' }}>打卡時間</label>
                <input 
                  type="text" 
                  required 
                  value={editAttTime} 
                  onChange={(e) => setEditAttTime(e.target.value)} 
                  placeholder="例如：09:00"
                  style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px' }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '13px', fontWeight: '600' }}>打卡類型</label>
                <select 
                  value={editAttType} 
                  onChange={(e) => setEditAttType(e.target.value)}
                  style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px', backgroundColor: '#fff' }}
                >
                  <option value="上班">上班</option>
                  <option value="下班">下班</option>
                </select>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '13px', fontWeight: '600' }}>狀態</label>
                <select 
                  value={editAttStatus} 
                  onChange={(e) => setEditAttStatus(e.target.value)}
                  style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px', backgroundColor: '#fff' }}
                >
                  <option value="正常">正常</option>
                  <option value="遲到">遲到</option>
                  <option value="早退">早退</option>
                  <option value="補打卡">補打卡</option>
                </select>
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
                <button 
                  type="button" 
                  onClick={() => setShowEditAttendanceModal(false)}
                  style={{ flex: 1, padding: '12px', borderRadius: '8px', border: '1px solid #d1d5db', backgroundColor: '#f3f4f6', cursor: 'pointer', fontWeight: '600', fontSize: '14px' }}
                >
                  取消
                </button>
                <button 
                  type="submit" 
                  style={{ flex: 1, padding: '12px', borderRadius: '8px', border: 'none', backgroundColor: 'var(--primary)', color: '#fff', cursor: 'pointer', fontWeight: '600', fontSize: '14px' }}
                >
                  儲存修改
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 編輯員工彈窗 */}
      {showEditEmployeeModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.4)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1000
        }}>
          <div className="glass-card" style={{
            width: '90%',
            maxWidth: '450px',
            padding: '32px',
            borderRadius: '16px',
            backgroundColor: '#ffffff',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
            maxHeight: '90vh',
            overflowY: 'auto'
          }}>
            <h3 style={{ marginBottom: '20px', color: 'var(--primary)', fontSize: '20px', fontWeight: '700' }}>編輯員工資訊</h3>
            <form onSubmit={handleUpdateEmployee} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '13px', fontWeight: '600' }}>姓名</label>
                <input 
                  type="text" 
                  required 
                  value={editEmpName} 
                  onChange={(e) => setEditEmpName(e.target.value)} 
                  style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px' }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '13px', fontWeight: '600' }}>職位</label>
                <select 
                  value={editEmpRole} 
                  onChange={(e) => setEditEmpRole(e.target.value)}
                  style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px', backgroundColor: '#fff' }}
                >
                  {roles.map(role => (
                    <option key={role} value={role}>{role}</option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '13px', fontWeight: '600' }}>帳號狀態</label>
                <select 
                  value={editEmpStatus} 
                  onChange={(e) => setEditEmpStatus(e.target.value)}
                  style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px', backgroundColor: '#fff' }}
                >
                  <option value="active">啟用中</option>
                  <option value="inactive">已停用</option>
                </select>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '13px', fontWeight: '600' }}>身分證字號</label>
                <input 
                  type="text" 
                  required 
                  value={editIdentityNumber} 
                  onChange={(e) => setEditIdentityNumber(e.target.value.toUpperCase())} 
                  placeholder="例如：A123456789"
                  style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px' }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '13px', fontWeight: '600' }}>到職日期</label>
                <input 
                  type="date" 
                  required 
                  value={editOnboardDate} 
                  onChange={(e) => setEditOnboardDate(e.target.value)} 
                  style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px' }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '13px', fontWeight: '600' }}>離職日期 (未離職留空)</label>
                <input 
                  type="date" 
                  value={editResignDate} 
                  onChange={(e) => setEditResignDate(e.target.value)} 
                  style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px' }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '13px', fontWeight: '600' }}>銀行帳戶 (轉帳用)</label>
                <input 
                  type="text" 
                  required 
                  value={editBankAccount} 
                  onChange={(e) => setEditBankAccount(e.target.value)} 
                  placeholder="分行代號-帳號，例如：822-12345..."
                  style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px' }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '13px', fontWeight: '600' }}>計薪類型</label>
                <select 
                  value={editSalaryType} 
                  onChange={(e) => setEditSalaryType(e.target.value as 'monthly' | 'hourly')}
                  style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px', backgroundColor: '#fff' }}
                >
                  <option value="monthly">月薪排班</option>
                  <option value="hourly">時薪工讀</option>
                </select>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '13px', fontWeight: '600' }}>
                  {editSalaryType === 'hourly' ? '時薪底薪 (經常性薪資 NT$)' : '月薪底薪 (經常性薪資 NT$)'}
                </label>
                <input 
                  type="number" 
                  required 
                  value={editMonthlySalary} 
                  onChange={(e) => {
                    const sal = Number(e.target.value);
                    setEditMonthlySalary(sal);
                    setEditLaborSub(sal);
                    setEditNhiSub(sal);
                    setEditPensionSub(sal);
                  }} 
                  style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '12px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1 }}>
                  <label style={{ fontSize: '13px', fontWeight: '600' }}>勞保申報 (NT$)</label>
                  <input 
                    type="number" 
                    required 
                    value={editLaborSub} 
                    onChange={(e) => setEditLaborSub(Number(e.target.value))} 
                    style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px' }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1 }}>
                  <label style={{ fontSize: '13px', fontWeight: '600' }}>健保申報 (NT$)</label>
                  <input 
                    type="number" 
                    required 
                    value={editNhiSub} 
                    onChange={(e) => setEditNhiSub(Number(e.target.value))} 
                    style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px' }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '13px', fontWeight: '600' }}>勞退提繳工資 (NT$)</label>
                <input 
                  type="number" 
                  required 
                  value={editPensionSub} 
                  onChange={(e) => setEditPensionSub(Number(e.target.value))} 
                  style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px' }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '13px', fontWeight: '600' }}>直屬主管</label>
                <select 
                  value={editSupervisorId} 
                  onChange={(e) => setEditSupervisorId(e.target.value)}
                  style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px', backgroundColor: '#fff' }}
                >
                  <option value="">-- 無主管 --</option>
                  {employees
                    .filter(emp => emp.id !== 'EMP001' && emp.id !== 'EMP002' && emp.id !== 'EMP003' && emp.id !== editEmployeeId)
                    .map(emp => (
                      <option key={emp.id} value={emp.id}>{emp.name} ({emp.role})</option>
                    ))}
                </select>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '13px', fontWeight: '600' }}>健保實際扶養眷屬人數 (0-3 口，不含本人)</label>
                <select 
                  value={editNhiDependents} 
                  onChange={(e) => setEditNhiDependents(Number(e.target.value))}
                  style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px', backgroundColor: '#fff' }}
                >
                  <option value={0}>0 口</option>
                  <option value={1}>1 口</option>
                  <option value={2}>2 口</option>
                  <option value={3}>3 口</option>
                </select>
              </div>

              <div style={{ borderTop: '1px dashed #e5e7eb', marginTop: '8px', paddingTop: '12px' }}>
                <span style={{ fontSize: '14px', fontWeight: '700', color: 'var(--primary)' }}>💰 固定非經常性津貼項目</span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '12px', fontWeight: '600' }}>伙食津貼 (每月 NT$)</label>
                  <input 
                    type="number" 
                    value={editMealAllowance} 
                    onChange={(e) => setEditMealAllowance(Number(e.target.value))}
                    style={{ padding: '10px 12px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '13px' }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '12px', fontWeight: '600' }}>全勤獎金 (每月 NT$)</label>
                  <input 
                    type="number" 
                    value={editAttendanceBonus} 
                    onChange={(e) => setEditAttendanceBonus(Number(e.target.value))}
                    style={{ padding: '10px 12px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '13px' }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '12px', fontWeight: '600' }}>其他津貼 (每月 NT$)</label>
                <input 
                  type="number" 
                  value={editOtherAllowance} 
                  onChange={(e) => setEditOtherAllowance(Number(e.target.value))}
                  style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '13px' }}
                />
              </div>

              <div style={{ borderTop: '1px dashed #e5e7eb', marginTop: '8px', paddingTop: '12px' }}>
                <span style={{ fontSize: '14px', fontWeight: '700', color: 'var(--primary)' }}>📁 檔案管理 (人事資料附件)</span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '12px', fontWeight: '600' }}>身分證正反面影本</label>
                  <input 
                    type="file" 
                    accept="image/*,application/pdf"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        const reader = new FileReader();
                        reader.onloadend = () => setEditFileIdCard(reader.result as string);
                        reader.readAsDataURL(file);
                      }
                    }}
                    style={{ fontSize: '12px' }}
                  />
                  {editFileIdCard ? (
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '2px' }}>
                      <span style={{ fontSize: '11px', color: '#10b981' }}>✓ 已有存檔</span>
                      <a href={editFileIdCard} download={`${editEmpName}_身分證影本`} style={{ fontSize: '11px', color: 'var(--primary)', fontWeight: '600', textDecoration: 'underline' }}>下載查看</a>
                    </div>
                  ) : (
                    <span style={{ fontSize: '11px', color: '#9ca3af' }}>尚未上傳</span>
                  )}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '12px', fontWeight: '600' }}>存摺封面影本</label>
                  <input 
                    type="file" 
                    accept="image/*,application/pdf"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        const reader = new FileReader();
                        reader.onloadend = () => setEditFileBankbook(reader.result as string);
                        reader.readAsDataURL(file);
                      }
                    }}
                    style={{ fontSize: '12px' }}
                  />
                  {editFileBankbook ? (
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '2px' }}>
                      <span style={{ fontSize: '11px', color: '#10b981' }}>✓ 已有存檔</span>
                      <a href={editFileBankbook} download={`${editEmpName}_存摺封面`} style={{ fontSize: '11px', color: 'var(--primary)', fontWeight: '600', textDecoration: 'underline' }}>下載查看</a>
                    </div>
                  ) : (
                    <span style={{ fontSize: '11px', color: '#9ca3af' }}>尚未上傳</span>
                  )}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '12px', fontWeight: '600' }}>勞動契約 (PDF/圖片)</label>
                  <input 
                    type="file" 
                    accept="image/*,application/pdf"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        const reader = new FileReader();
                        reader.onloadend = () => setEditFileContract(reader.result as string);
                        reader.readAsDataURL(file);
                      }
                    }}
                    style={{ fontSize: '12px' }}
                  />
                  {editFileContract ? (
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '2px' }}>
                      <span style={{ fontSize: '11px', color: '#10b981' }}>✓ 已有存檔</span>
                      <a href={editFileContract} download={`${editEmpName}_勞動契約`} style={{ fontSize: '11px', color: 'var(--primary)', fontWeight: '600', textDecoration: 'underline' }}>下載查看</a>
                    </div>
                  ) : (
                    <span style={{ fontSize: '11px', color: '#9ca3af' }}>尚未上傳</span>
                  )}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
                <button 
                  type="button" 
                  onClick={() => setShowEditEmployeeModal(false)}
                  style={{ flex: 1, padding: '12px', borderRadius: '8px', border: '1px solid #d1d5db', backgroundColor: '#f3f4f6', cursor: 'pointer', fontWeight: '600', fontSize: '14px' }}
                >
                  取消
                </button>
                <button 
                  type="submit" 
                  style={{ flex: 1, padding: '12px', borderRadius: '8px', border: 'none', backgroundColor: 'var(--primary)', color: '#fff', cursor: 'pointer', fontWeight: '600', fontSize: '14px' }}
                >
                  儲存修改
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;
