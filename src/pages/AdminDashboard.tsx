import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getApps, initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { db, auth } from '../firebase';
import { collection, query, orderBy, onSnapshot, doc, setDoc, deleteDoc, updateDoc, getDocs } from 'firebase/firestore';
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


const AdminDashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'attendance' | 'employees' | 'schedules' | 'payroll'>('attendance');
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

  // 台灣勞基法合規新增欄位 states
  const [newIdentityNumber, setNewIdentityNumber] = useState('');
  const [newOnboardDate, setNewOnboardDate] = useState(new Date().toISOString().substring(0, 10));
  const [newBankAccount, setNewBankAccount] = useState('');
  const [newMonthlySalary, setNewMonthlySalary] = useState<number>(32000);
  const [newLaborSub, setNewLaborSub] = useState<number>(31800);
  const [newNhiSub, setNewNhiSub] = useState<number>(31800);
  const [newPensionSub, setNewPensionSub] = useState<number>(31800);
  const [newSupervisorId, setNewSupervisorId] = useState('');

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
        supervisorId: newSupervisorId
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

  // 排班搜尋 States
  const [schedSearch, setSchedSearch] = useState('');

  // 薪資篩選與月份 States
  const [payMonthFilter, setPayMonthFilter] = useState(new Date().toISOString().substring(0, 7));
  const [viewPayMonth, setViewPayMonth] = useState('');

  // 排班與薪資 State
  const [schedules, setSchedules] = useState<any[]>([]);
  const [payroll, setPayroll] = useState<any[]>([]);

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
      await setDoc(doc(collection(db, 'schedules')), {
        empName: emp.name,
        employeeId: schedEmployeeId,
        date: schedDate || new Date().toLocaleDateString('sv'),
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

  const handleToggleScheduleStatus = async (id: string, currentStatus: string) => {
    if (id === '1' || id === '2') {
      alert('模擬資料無法直接修改，請建立真實資料進行操作。');
      return;
    }
    try {
      const newStatus = currentStatus === '已確認' ? '待確認' : '已確認';
      await updateDoc(doc(db, 'schedules', id), {
        status: newStatus
      });
    } catch (err) {
      console.error("Failed to update schedule status:", err);
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
        supervisorId: editSupervisorId
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

  const handleGeneratePayroll = async () => {
    setPayError('');
    setPaySuccess('');
    setGeneratingPayroll(true);

    try {
      const currentMonth = payMonthFilter; // YYYY-MM
      
      let employeesList = employees;
      // 如果還沒有載入，先從 Firestore 獲取真實名單
      if (employeesList.length === 0 || employeesList[0].id === 'EMP001') {
        const querySnapshot = await getDocs(collection(db, 'employees'));
        employeesList = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() as any }));
      }

      if (employeesList.length === 0) {
        setPayError('目前沒有已註冊的員工，請先新增員工帳號。');
        setGeneratingPayroll(false);
        return;
      }

      // 取得當月出勤紀錄用以精準計算加班費
      const attendanceSnapshot = await getDocs(collection(db, 'attendance'));
      const attendanceRecords = attendanceSnapshot.docs.map(doc => doc.data() as any);

      // 載入台灣 HR 計算引擎
      const { calculatePayrollInsurance, calculateOvertimePay } = await import('../utils/taiwanHrEngine');

      for (const emp of employeesList) {
        const isMock = emp.id === 'EMP001' || emp.id === 'EMP002' || emp.id === 'EMP003';
        
        let monthlySalary = emp.monthlySalary || 32000;
        let laborSub = emp.laborSub || 31800;
        let nhiSub = emp.nhiSub || 31800;
        let pensionSub = emp.pensionSub || 31800;
        let onboardDateStr = emp.onboardDate || '2025-01-01';
        let resignDateStr = emp.resignDate || null;

        if (isMock) {
          if (emp.role && emp.role.includes('工程師')) {
            monthlySalary = 45000; laborSub = 45800; nhiSub = 45800; pensionSub = 45800;
          } else if (emp.role && emp.role.includes('設計師')) {
            monthlySalary = 38000; laborSub = 38200; nhiSub = 38200; pensionSub = 38200;
          }
        }

        const hourlyRate = monthlySalary / 240; // 僅以「底薪 / 240」計算時薪基準

        // 篩選該員工當月的打卡
        const empAttendance = attendanceRecords.filter((rec: any) => 
          rec.employeeId === emp.id && 
          rec.date && rec.date.startsWith(currentMonth)
        );

        const daysWorked = new Set(empAttendance.map((rec: any) => rec.date)).size;
        let overtimePay = 0;
        
        // 依每日工作日 (date) 的上班與下班時間計算加班費
        const attendanceByDate: { [date: string]: any[] } = {};
        empAttendance.forEach((rec: any) => {
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
            
            // 處理跨夜下班時間 (若下班小時小於上班小時，代表跨日)
            if (outTime < inTime) {
              outTime += 24;
            }

            if (outTime > inTime) {
              const hours = outTime - inTime;
              if (hours > 8) {
                const overtimeHours = hours - 8;
                
                // 依週六、週日、平日決定加班費類型 (一例一休預設模型)
                const d = new Date(date);
                const dayOfWeek = d.getDay();
                let dayType: 'regular' | 'rest' | 'holiday' = 'regular';
                if (dayOfWeek === 6) dayType = 'rest'; // 週六休息日
                else if (dayOfWeek === 0) dayType = 'holiday'; // 週日例假日
                
                overtimePay += calculateOvertimePay(hourlyRate, overtimeHours, dayType);
              }
            }
          }
        });

        // 彈性機制：若當月無打卡出勤但為啟用的 Mock 或無打卡環境，給予少量隨機加班費作為預設展示，其餘 0 元
        if (daysWorked === 0) {
          overtimePay = Math.floor(Math.random() * 5) * 500;
        }

        // 計算勞健保費
        const ins = calculatePayrollInsurance(
          onboardDateStr,
          resignDateStr,
          currentMonth,
          { laborSub, nhiSub, pensionSub }
        );

        // 扣款項目：預扣代繳之員工勞健保自付額
        const deductions = ins.employeeLabor + ins.employeeNhi;
        const netSalary = monthlySalary + overtimePay - deductions;
        
        const payrollId = `${emp.id}-${currentMonth}`;
        await setDoc(doc(db, 'payroll', payrollId), {
          empName: emp.name,
          employeeId: emp.id,
          month: currentMonth,
          baseSalary: monthlySalary,
          overtime: overtimePay,
          deductions: deductions,
          netSalary: netSalary,
          status: '待審核',
          timestamp: new Date().getTime(),
          // 儲存詳細申報快照，確保薪資發放歷史版本完整
          laborDays: ins.laborDays,
          employeeLabor: ins.employeeLabor,
          employerLabor: ins.employerLabor,
          employeeNhi: ins.employeeNhi,
          employerNhi: ins.employerNhi,
          employerPension: ins.employerPension,
          laborSub: laborSub,
          nhiSub: nhiSub,
          pensionSub: pensionSub
        });
      }

      setPaySuccess(`${currentMonth} 薪資一鍵計算生成完成！`);
      setTimeout(() => setPaySuccess(''), 3000);
    } catch (err: any) {
      console.error(err);
      setPayError(err.message || '計算失敗');
    } finally {
      setGeneratingPayroll(false);
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

  const filteredSchedules = schedules.filter(s => {
    return s.empName?.toLowerCase().includes(schedSearch.toLowerCase());
  });

  const filteredPayroll = payroll.filter(p => {
    return viewPayMonth ? p.month === viewPayMonth : true;
  });

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
          <Link to="/" className="nav-item return-link" onClick={() => setIsSidebarOpen(false)}>
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
          </h1>
          <div className="admin-user" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span>管理員 (Admin)</span>
            <div className="avatar">A</div>
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
            <div className="card">
              <div className="card-header">
                <h3>即時打卡紀錄</h3>
                <button className="btn-primary btn-sm">匯出報表</button>
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
            <div className="card">
              <div className="card-header">
                <h3>本週班表</h3>
                <button className="btn-primary btn-sm" onClick={() => setShowScheduleModal(true)}>+ 新增排班</button>
              </div>

              {/* 排班搜尋篩選 */}
              <div className="filters-row" style={{ display: 'flex', gap: '16px', padding: '16px 24px', backgroundColor: '#f9fafb', borderBottom: '1px solid var(--border)' }}>
                <div className="filter-group" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '13px', fontWeight: '600' }}>搜尋員工：</span>
                  <input 
                    type="text" 
                    placeholder="輸入員工姓名..." 
                    value={schedSearch} 
                    onChange={(e) => setSchedSearch(e.target.value)} 
                    style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '13px', backgroundColor: '#fff' }}
                  />
                </div>
              </div>

              <div className="table-responsive">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>員工姓名</th>
                      <th>日期</th>
                      <th>班別時間</th>
                      <th>狀態</th>
                      <th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSchedules.map(schedule => (
                      <tr key={schedule.id}>
                        <td data-label="員工姓名">{schedule.empName}</td>
                        <td data-label="日期">{schedule.date}</td>
                        <td data-label="班別時間">{schedule.shift}</td>
                        <td data-label="狀態">
                          <span className={`badge badge-${schedule.status === '已確認' ? 'success' : 'warning'}`}>
                            {schedule.status}
                          </span>
                        </td>
                        <td data-label="操作" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                          <button className="btn-text" onClick={() => handleToggleScheduleStatus(schedule.id, schedule.status)}>調整狀態</button>
                          <button className="btn-text" style={{ color: 'var(--primary)' }} onClick={() => handleOpenEditSchedule(schedule)}>編輯</button>
                          <button className="btn-text" style={{ color: '#ef4444' }} onClick={() => handleDeleteSchedule(schedule.id)}>刪除</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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
                    {generatingPayroll ? '計算中...' : '一鍵計算該月薪資'}
                  </button>
                  <button className="btn-primary btn-sm" onClick={() => setShowAddPayrollModal(true)}>
                    + 手動新增薪資單
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
                        <td data-label="操作" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
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
                <label style={{ fontSize: '13px', fontWeight: '600' }}>月薪底薪 (經常性薪資 NT$)</label>
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
                  <option value="早班 (09:00 - 18:00)">早班 (09:00 - 18:00)</option>
                  <option value="中班 (13:00 - 22:00)">中班 (13:00 - 22:00)</option>
                  <option value="晚班 (18:00 - 02:00)">晚班 (18:00 - 02:00)</option>
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
                  <option value="早班 (09:00 - 18:00)">早班 (09:00 - 18:00)</option>
                  <option value="中班 (13:00 - 22:00)">中班 (13:00 - 22:00)</option>
                  <option value="晚班 (18:00 - 02:00)">晚班 (18:00 - 02:00)</option>
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
                <label style={{ fontSize: '13px', fontWeight: '600' }}>月薪底薪 (經常性薪資 NT$)</label>
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
