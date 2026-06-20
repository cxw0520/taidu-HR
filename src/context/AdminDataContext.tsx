import React, { createContext, useContext, useState, useEffect } from 'react';
import { db } from '../firebase';
import { 
  collection, query, orderBy, onSnapshot, doc, setDoc, updateDoc, deleteDoc, addDoc, getDocs, where 
} from 'firebase/firestore';

export interface AdminDataContextType {
  employees: any[];
  attendance: any[];
  schedules: any[];
  payroll: any[];
  leaves: any[];
  overtimeReqs: any[];
  punchCorrections: any[];
  attendanceAppeals: any[];
  
  // Settings
  roles: string[];
  shifts: any[];
  insuranceRates: any;
  toleranceMinutes: number;
  holidays: any[];
  
  loading: boolean;
  
  // Handlers
  addEmployee: (uid: string, data: any) => Promise<void>;
  updateEmployee: (uid: string, data: any) => Promise<void>;
  deleteEmployee: (uid: string) => Promise<void>;
  
  addSchedule: (data: any) => Promise<void>;
  updateSchedule: (id: string, data: any) => Promise<void>;
  deleteSchedule: (id: string) => Promise<void>;
  publishSchedules: (year: number, month: number) => Promise<void>;
  unpublishSchedules: (year: number, month: number) => Promise<void>;
  
  addAttendanceRecord: (data: any) => Promise<void>;
  updateAttendanceRecord: (id: string, data: any) => Promise<void>;
  deleteAttendanceRecord: (id: string) => Promise<void>;
  
  approveLeave: (id: string) => Promise<void>;
  rejectLeave: (id: string) => Promise<void>;
  updateLeave: (id: string, data: any) => Promise<void>;
  deleteLeave: (id: string) => Promise<void>;
  
  approveOvertime: (id: string) => Promise<void>;
  rejectOvertime: (id: string) => Promise<void>;
  updateOvertime: (id: string, data: any) => Promise<void>;
  deleteOvertime: (id: string) => Promise<void>;
  
  approvePunchCorrection: (id: string) => Promise<void>;
  rejectPunchCorrection: (id: string) => Promise<void>;
  
  approveAppeal: (id: string) => Promise<void>;
  rejectAppeal: (id: string) => Promise<void>;
  
  saveRoles: (list: string[]) => Promise<void>;
  saveShifts: (list: any[]) => Promise<void>;
  saveInsuranceRates: (data: any) => Promise<void>;
  saveRules: (data: any) => Promise<void>;
  saveHolidays: (list: any[]) => Promise<void>;
  
  savePayrollDoc: (id: string, data: any) => Promise<void>;
  publishPayroll: (year: number, month: number) => Promise<void>;
  unpublishPayroll: (year: number, month: number) => Promise<void>;
}

const AdminDataContext = createContext<AdminDataContextType | undefined>(undefined);

export const AdminDataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [employees, setEmployees] = useState<any[]>([]);
  const [attendance, setAttendance] = useState<any[]>([]);
  const [schedules, setSchedules] = useState<any[]>([]);
  const [payroll, setPayroll] = useState<any[]>([]);
  const [leaves, setLeaves] = useState<any[]>([]);
  const [overtimeReqs, setOvertimeReqs] = useState<any[]>([]);
  const [punchCorrections, setPunchCorrections] = useState<any[]>([]);
  const [attendanceAppeals, setAttendanceAppeals] = useState<any[]>([]);
  
  // Settings States
  const [roles, setRoles] = useState<string[]>(['工程師', '設計師', '行銷', '專案經理', '行政總務']);
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
  const [toleranceMinutes, setToleranceMinutes] = useState<number>(240);
  const [holidays, setHolidays] = useState<any[]>([]);
  
  const [loading, setLoading] = useState<boolean>(true);

  // Sorting helper for employees: Monthly first, hourly second, then sorted by name
  const sortEmployeesList = (list: any[]) => {
    return [...list].sort((a, b) => {
      const typeA = a.salaryType || 'monthly';
      const typeB = b.salaryType || 'monthly';
      if (typeA === 'monthly' && typeB === 'hourly') return -1;
      if (typeA === 'hourly' && typeB === 'monthly') return 1;
      return (a.name || '').localeCompare(b.name || '', 'zh-Hant');
    });
  };

  useEffect(() => {
    let unsubs: (() => void)[] = [];
    const resolved = new Set<string>();
    
    const checkAllResolved = (key: string) => {
      resolved.add(key);
      if (resolved.size === 13) {
        setLoading(false);
      }
    };
    
    // 1. Subscribe Employees
    const qEmp = query(collection(db, 'employees'));
    const unsubEmp = onSnapshot(qEmp, (snap) => {
      const records = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setEmployees(sortEmployeesList(records));
      checkAllResolved('employees');
    }, err => {
      console.error("Subscribe employees error:", err);
      checkAllResolved('employees');
    });
    unsubs.push(unsubEmp);

    // 2. Subscribe Attendance
    const qAtt = query(collection(db, 'attendance'), orderBy('timestamp', 'desc'));
    const unsubAtt = onSnapshot(qAtt, (snap) => {
      const records = snap.docs.map(d => ({ id: d.id, ...d.data() } as any));
      setAttendance(records);
      checkAllResolved('attendance');
    }, err => {
      console.error("Subscribe attendance error:", err);
      checkAllResolved('attendance');
    });
    unsubs.push(unsubAtt);

    // 3. Subscribe Schedules
    const qSched = query(collection(db, 'schedules'));
    const unsubSched = onSnapshot(qSched, (snap) => {
      const records = snap.docs.map(d => ({ id: d.id, ...d.data() } as any));
      records.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
      setSchedules(records);
      checkAllResolved('schedules');
    }, err => {
      console.error("Subscribe schedules error:", err);
      checkAllResolved('schedules');
    });
    unsubs.push(unsubSched);

    // 4. Subscribe Payroll
    const qPay = query(collection(db, 'payroll'));
    const unsubPay = onSnapshot(qPay, (snap) => {
      const records = snap.docs.map(d => ({ id: d.id, ...d.data() } as any));
      records.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
      setPayroll(records);
      checkAllResolved('payroll');
    }, err => {
      console.error("Subscribe payroll error:", err);
      checkAllResolved('payroll');
    });
    unsubs.push(unsubPay);

    // 5. Subscribe Leaves
    const unsubLeaves = onSnapshot(query(collection(db, 'leaves')), (snap) => {
      const records = snap.docs.map(d => ({ id: d.id, ...d.data() } as any));
      records.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
      setLeaves(records);
      checkAllResolved('leaves');
    }, err => {
      console.error("Subscribe leaves error:", err);
      checkAllResolved('leaves');
    });
    unsubs.push(unsubLeaves);

    // 6. Subscribe Overtime
    const unsubOT = onSnapshot(query(collection(db, 'overtime_requests')), (snap) => {
      const records = snap.docs.map(d => ({ id: d.id, ...d.data() } as any));
      records.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
      setOvertimeReqs(records);
      checkAllResolved('overtime');
    }, err => {
      console.error("Subscribe overtimes error:", err);
      checkAllResolved('overtime');
    });
    unsubs.push(unsubOT);

    // 7. Subscribe Punch Corrections
    const unsubPC = onSnapshot(query(collection(db, 'punch_corrections')), (snap) => {
      const records = snap.docs.map(d => ({ id: d.id, ...d.data() } as any));
      records.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
      setPunchCorrections(records);
      checkAllResolved('punch');
    }, err => {
      console.error("Subscribe punch_corrections error:", err);
      checkAllResolved('punch');
    });
    unsubs.push(unsubPC);

    // 8. Subscribe Attendance Appeals
    const unsubAA = onSnapshot(query(collection(db, 'attendance_appeals')), (snap) => {
      const records = snap.docs.map(d => ({ id: d.id, ...d.data() } as any));
      records.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
      setAttendanceAppeals(records);
      checkAllResolved('appeal');
    }, err => {
      console.error("Subscribe appeals error:", err);
      checkAllResolved('appeal');
    });
    unsubs.push(unsubAA);

    // 9. Subscribe Roles Settings
    const unsubRoles = onSnapshot(doc(db, 'settings', 'roles'), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data && Array.isArray(data.list)) {
          setRoles(data.list);
        }
      }
      checkAllResolved('roles');
    }, err => {
      console.error("Subscribe roles error:", err);
      checkAllResolved('roles');
    });
    unsubs.push(unsubRoles);

    // 10. Subscribe Shifts Settings
    const unsubShifts = onSnapshot(doc(db, 'settings', 'shifts'), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data && Array.isArray(data.list)) {
          setShifts(data.list);
        }
      }
      checkAllResolved('shifts');
    }, err => {
      console.error("Subscribe shifts error:", err);
      checkAllResolved('shifts');
    });
    unsubs.push(unsubShifts);

    // 11. Subscribe Insurance Settings
    const unsubIns = onSnapshot(doc(db, 'settings', 'insurance'), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setInsuranceRates(data);
      }
      checkAllResolved('insurance');
    }, err => {
      console.error("Subscribe insurance error:", err);
      checkAllResolved('insurance');
    });
    unsubs.push(unsubIns);

    // 12. Subscribe Rules Settings
    const unsubRules = onSnapshot(doc(db, 'settings', 'rules'), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.toleranceMinutes !== undefined) {
          setToleranceMinutes(data.toleranceMinutes);
        } else if (data.toleranceHours !== undefined) {
          setToleranceMinutes(data.toleranceHours * 60);
        }
      }
      checkAllResolved('rules');
    }, err => {
      console.error("Subscribe rules error:", err);
      checkAllResolved('rules');
    });
    unsubs.push(unsubRules);

    // 13. Subscribe Holidays Settings
    const unsubHolidays = onSnapshot(doc(db, 'settings', 'holidays'), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data && Array.isArray(data.list)) {
          const normalized = data.list.map((h: any) => ({
            ...h,
            movedDate: h.movedDate || h.date
          }));
          setHolidays(normalized);
        }
      }
      checkAllResolved('holidays');
    }, err => {
      console.error("Subscribe holidays error:", err);
      checkAllResolved('holidays');
    });
    unsubs.push(unsubHolidays);

    return () => unsubs.forEach(unsub => unsub());
  }, []);

  // Handlers Implementation
  const addEmployee = async (uid: string, data: any) => {
    await setDoc(doc(db, 'employees', uid), data);
  };

  const updateEmployee = async (uid: string, data: any) => {
    await updateDoc(doc(db, 'employees', uid), data);
  };

  const deleteEmployee = async (uid: string) => {
    await deleteDoc(doc(db, 'employees', uid));
  };

  const addSchedule = async (data: any) => {
    await setDoc(doc(collection(db, 'schedules')), data);
  };

  const updateSchedule = async (id: string, data: any) => {
    await updateDoc(doc(db, 'schedules', id), data);
  };

  const deleteSchedule = async (id: string) => {
    await deleteDoc(doc(db, 'schedules', id));
  };

  const publishSchedules = async (year: number, month: number) => {
    const prefix = `${year}-${String(month).padStart(2, '0')}`;
    const targetScheds = schedules.filter(s => s.date.startsWith(prefix) && !s.isPublished);
    for (const s of targetScheds) {
      await updateDoc(doc(db, 'schedules', s.id), { isPublished: true });
    }
  };

  const unpublishSchedules = async (year: number, month: number) => {
    const prefix = `${year}-${String(month).padStart(2, '0')}`;
    const targetScheds = schedules.filter(s => s.date.startsWith(prefix) && s.isPublished);
    for (const s of targetScheds) {
      await updateDoc(doc(db, 'schedules', s.id), { isPublished: false });
    }
  };

  const addAttendanceRecord = async (data: any) => {
    await addDoc(collection(db, 'attendance'), data);
  };

  const updateAttendanceRecord = async (id: string, data: any) => {
    await updateDoc(doc(db, 'attendance', id), data);
  };

  const deleteAttendanceRecord = async (id: string) => {
    await deleteDoc(doc(db, 'attendance', id));
  };

  const approveLeave = async (id: string) => {
    await updateDoc(doc(db, 'leaves', id), { status: 'approved' });
  };

  const rejectLeave = async (id: string) => {
    await updateDoc(doc(db, 'leaves', id), { status: 'rejected' });
  };

  const updateLeave = async (id: string, data: any) => {
    await updateDoc(doc(db, 'leaves', id), data);
  };

  const deleteLeave = async (id: string) => {
    await deleteDoc(doc(db, 'leaves', id));
  };

  const approveOvertime = async (id: string) => {
    await updateDoc(doc(db, 'overtime_requests', id), { status: 'approved' });
  };

  const rejectOvertime = async (id: string) => {
    await updateDoc(doc(db, 'overtime_requests', id), { status: 'rejected' });
  };

  const updateOvertime = async (id: string, data: any) => {
    await updateDoc(doc(db, 'overtime_requests', id), data);
  };

  const deleteOvertime = async (id: string) => {
    await deleteDoc(doc(db, 'overtime_requests', id));
  };

  const approvePunchCorrection = async (id: string) => {
    const pc = punchCorrections.find(p => p.id === id);
    if (!pc) return;
    await updateDoc(doc(db, 'punch_corrections', id), { status: 'approved' });
    
    // Create new attendance record representing the corrected clock
    await addDoc(collection(db, 'attendance'), {
      employeeId: pc.employeeId,
      empName: pc.empName,
      date: pc.date,
      time: pc.time,
      type: pc.type,
      status: '正常', // Approved correction defaults to normal
      photo: '',
      location: '補登（主管核准）',
      timestamp: Date.now(),
      source: 'admin_manual'
    });
  };

  const rejectPunchCorrection = async (id: string) => {
    await updateDoc(doc(db, 'punch_corrections', id), { status: 'rejected' });
  };

  const approveAppeal = async (id: string) => {
    const appeal = attendanceAppeals.find(a => a.id === id);
    if (!appeal) return;
    await updateDoc(doc(db, 'attendance_appeals', id), { status: 'approved' });
    
    // If there is an associated attendance record, update it to normal
    if (appeal.attendanceId) {
      await updateDoc(doc(db, 'attendance', appeal.attendanceId), {
        status: '正常',
        remark: `申訴核准：${appeal.reason}`
      });
    } else {
      // Fallback matching logic for old data
      const q = query(
        collection(db, 'attendance'), 
        where('employeeId', '==', appeal.employeeId),
        where('date', '==', appeal.date)
      );
      const snap = await getDocs(q);
      for (const d of snap.docs) {
        const data = d.data();
        if (data.status === '遲到' || data.status === '早退' || data.status === '異常' || data.status === '缺卡') {
          await updateDoc(doc(db, 'attendance', d.id), {
            status: '正常',
            remark: `申訴核准：${appeal.reason}`
          });
        }
      }
    }
  };

  const rejectAppeal = async (id: string) => {
    await updateDoc(doc(db, 'attendance_appeals', id), { status: 'rejected' });
  };

  const saveRoles = async (list: string[]) => {
    await setDoc(doc(db, 'settings', 'roles'), { list });
  };

  const saveShifts = async (list: any[]) => {
    await setDoc(doc(db, 'settings', 'shifts'), { list });
  };

  const saveInsuranceRates = async (data: any) => {
    await setDoc(doc(db, 'settings', 'insurance'), data);
  };

  const saveRules = async (data: any) => {
    await setDoc(doc(db, 'settings', 'rules'), data);
  };

  const saveHolidays = async (list: any[]) => {
    await setDoc(doc(db, 'settings', 'holidays'), { list });
  };

  const savePayrollDoc = async (id: string, data: any) => {
    await setDoc(doc(db, 'payroll', id), data);
  };

  const publishPayroll = async (year: number, month: number) => {
    const prefix = `${year}-${String(month).padStart(2, '0')}`;
    const targetPayrolls = payroll.filter(p => p.month === prefix && !p.isPublished);
    for (const p of targetPayrolls) {
      await updateDoc(doc(db, 'payroll', p.id), { isPublished: true });
    }
  };

  const unpublishPayroll = async (year: number, month: number) => {
    const prefix = `${year}-${String(month).padStart(2, '0')}`;
    const targetPayrolls = payroll.filter(p => p.month === prefix && p.isPublished);
    for (const p of targetPayrolls) {
      await updateDoc(doc(db, 'payroll', p.id), { isPublished: false });
    }
  };

  return (
    <AdminDataContext.Provider value={{
      employees,
      attendance,
      schedules,
      payroll,
      leaves,
      overtimeReqs,
      punchCorrections,
      attendanceAppeals,
      
      roles,
      shifts,
      insuranceRates,
      toleranceMinutes,
      holidays,
      
      loading,
      
      addEmployee,
      updateEmployee,
      deleteEmployee,
      
      addSchedule,
      updateSchedule,
      deleteSchedule,
      publishSchedules,
      unpublishSchedules,
      
      addAttendanceRecord,
      updateAttendanceRecord,
      deleteAttendanceRecord,
      
      approveLeave,
      rejectLeave,
      updateLeave,
      deleteLeave,
      
      approveOvertime,
      rejectOvertime,
      updateOvertime,
      deleteOvertime,
      
      approvePunchCorrection,
      rejectPunchCorrection,
      
      approveAppeal,
      rejectAppeal,
      
      saveRoles,
      saveShifts,
      saveInsuranceRates,
      saveRules,
      saveHolidays,
      
      savePayrollDoc,
      publishPayroll,
      unpublishPayroll
    }}>
      {children}
    </AdminDataContext.Provider>
  );
};

export const useAdminData = () => {
  const context = useContext(AdminDataContext);
  if (context === undefined) {
    throw new Error('useAdminData must be used within an AdminDataProvider');
  }
  return context;
};
