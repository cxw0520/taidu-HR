import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';
import { db, auth } from '../firebase';
import {
  collection, addDoc, serverTimestamp, query, where, onSnapshot,
  doc, getDoc, updateDoc, deleteDoc
} from 'firebase/firestore';
import './EmployeeClockIn.css';
import { isOffShift } from '../utils/taiwanHrEngine';

const LEAVE_TYPES = [
  { value: 'sick',        label: '病假 (半薪)',  yearlyDays: 30 },
  { value: 'personal',    label: '事假 (無薪)',  yearlyDays: 14 },
  { value: 'annual',      label: '特別休假',     yearlyDays: null }, // 依年資計算
  { value: 'official',    label: '公假',          yearlyDays: null },
  { value: 'marriage',    label: '婚假',          yearlyDays: 8  },
  { value: 'bereavement', label: '喪假',          yearlyDays: null },
  { value: 'menstrual',   label: '生理假',        yearlyDays: 3  },
  { value: 'prenatal',    label: '產前假',        yearlyDays: null },
];

/** 依年資計算勞基法特別休假天數 */
const calcAnnualLeaveDays = (onboardDate: string): number => {
  if (!onboardDate) return 0;
  const months = (Date.now() - new Date(onboardDate).getTime()) / (1000 * 60 * 60 * 24 * 30.44);
  if (months < 6)   return 0;
  if (months < 12)  return 3;
  const years = months / 12;
  if (years < 2)    return 7;
  if (years < 3)    return 10;
  if (years < 5)    return 14;
  if (years < 10)   return 15;
  return Math.min(30, 15 + Math.floor(years - 10));
};

const EmployeeClockIn: React.FC = () => {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [user, setUser] = useState<User | null>(null);
  const [locationState, setLocationState] = useState<{
    status: 'idle' | 'locating' | 'success' | 'error';
    message: string;
    coords: { lat: number; lng: number } | null;
  }>({ status: 'idle', message: '等待打卡...', coords: null });
  const [clockInRecord, setClockInRecord] = useState<string | null>(null);
  const [employeeName, setEmployeeName] = useState<string>('');
  const [employeeProfile, setEmployeeProfile] = useState<any>(null);
  const [toleranceMinutes, setToleranceMinutes] = useState<number>(240);

  // 主 Tab
  const [activeSubTab, setActiveSubTab] = useState<'clock' | 'schedule' | 'payroll' | 'apply'>('clock');

  // 班表日曆月份變數
  const now0 = new Date();
  const [calYear, setCalYear] = useState(now0.getFullYear());
  const [calMonth, setCalMonth] = useState(now0.getMonth() + 1);

  // 打卡 Tab 資料
  const [todayRecords, setTodayRecords] = useState<any[]>([]);
  const [allAttendance, setAllAttendance] = useState<any[]>([]);
  const [mySchedules, setMySchedules] = useState<any[]>([]);

  // 薪資 Tab
  const [myPayroll, setMyPayroll] = useState<any[]>([]);
  const [selectedSlip, setSelectedSlip] = useState<any | null>(null);

  // 申請 Tab — 四個子分頁
  const [applySubTab, setApplySubTab] = useState<'leave' | 'overtime' | 'punch' | 'appeal'>('leave');
  const [myLeaves, setMyLeaves] = useState<any[]>([]);
  const [myOvertimes, setMyOvertimes] = useState<any[]>([]);
  const [myPunchCorrections, setMyPunchCorrections] = useState<any[]>([]);
  const [myAppeals, setMyAppeals] = useState<any[]>([]);

  // ── 請假表單 ──
  const [leaveType, setLeaveType] = useState('sick');
  const [leaveStart, setLeaveStart] = useState('');
  const [leaveEnd, setLeaveEnd] = useState('');
  const [leavePeriod, setLeavePeriod] = useState<'full' | 'morning' | 'afternoon'>('full');
  const [leaveHours, setLeaveHours] = useState<number>(8);
  const [leaveReason, setLeaveReason] = useState('');
  const [leaveSubmitting, setLeaveSubmitting] = useState(false);
  const [leaveMsg, setLeaveMsg] = useState({ type: '', text: '' });

  // ── 編輯請假 ──
  const [showEditLeaveModal, setShowEditLeaveModal] = useState(false);
  const [editLeaveId, setEditLeaveId] = useState('');
  const [editLeaveType, setEditLeaveType] = useState('sick');
  const [editLeaveStart, setEditLeaveStart] = useState('');
  const [editLeaveEnd, setEditLeaveEnd] = useState('');
  const [editLeavePeriod, setEditLeavePeriod] = useState<'full' | 'morning' | 'afternoon'>('full');
  const [editLeaveHours, setEditLeaveHours] = useState<number>(8);
  const [editLeaveReason, setEditLeaveReason] = useState('');

  // ── 加班表單 ──
  const [otDate, setOtDate] = useState('');
  const [otHours, setOtHours] = useState<number>(2);
  const [otStartTime, setOtStartTime] = useState('18:00');
  const [otEndTime, setOtEndTime] = useState('20:00');
  const [otReason, setOtReason] = useState('');
  const [otSubmitting, setOtSubmitting] = useState(false);
  const [otMsg, setOtMsg] = useState({ type: '', text: '' });

  // 自動依據加班時段計算加班時數
  useEffect(() => {
    if (otStartTime && otEndTime) {
      const [startH, startM] = otStartTime.split(':').map(Number);
      const [endH, endM] = otEndTime.split(':').map(Number);
      let diffMinutes = (endH * 60 + endM) - (startH * 60 + startM);
      if (diffMinutes < 0) {
        // 跨夜加班處理
        diffMinutes += 24 * 60;
      }
      setOtHours(Number((diffMinutes / 60).toFixed(1)));
    }
  }, [otStartTime, otEndTime]);

  // ── 補卡申請表單 ──
  const [punchDate, setPunchDate] = useState('');
  const [punchTime, setPunchTime] = useState('');
  const [punchType, setPunchType] = useState<'上班' | '下班'>('上班');
  const [punchReason, setPunchReason] = useState('');
  const [punchSubmitting, setPunchSubmitting] = useState(false);
  const [punchMsg, setPunchMsg] = useState({ type: '', text: '' });

  // ── 打卡異常申訴表單 ──
  const [appealTargetId, setAppealTargetId] = useState('');
  const [appealReason, setAppealReason] = useState('');
  const [appealSubmitting, setAppealSubmitting] = useState(false);
  const [appealMsg, setAppealMsg] = useState({ type: '', text: '' });

  // ── 時鐘 & 登入監聽 ──
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        try {
          const empDoc = await getDoc(doc(db, 'employees', currentUser.uid));
          if (empDoc.exists()) {
            const data = empDoc.data();
            setEmployeeName(data.name || '');
            setEmployeeProfile(data);
          }
        } catch (err) {
          console.error('Failed to fetch employee profile:', err);
        }
      } else {
        setEmployeeName('');
        setEmployeeProfile(null);
      }
    });
    return () => { clearInterval(timer); unsubscribe(); };
  }, []);

  // ── 系統設定監聽 ──
  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, 'settings', 'rules'), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data) {
          if (typeof data.toleranceMinutes === 'number') {
            setToleranceMinutes(data.toleranceMinutes);
          } else if (typeof data.toleranceHours === 'number') {
            setToleranceMinutes(data.toleranceHours * 60);
          }
        }
      }
    });
    return () => unsubscribe();
  }, []);

  // ── 員工資料監聽 ──
  useEffect(() => {
    if (!user) {
      setTodayRecords([]); setMySchedules([]); setMyPayroll([]);
      setMyLeaves([]); setMyOvertimes([]); setMyPunchCorrections([]); setMyAppeals([]);
      return;
    }
    const todayStr = new Date().toLocaleDateString('sv');

    // 出勤紀錄
    const qAtt = query(collection(db, 'attendance'), where('employeeId', '==', user.uid));
    const unsubAtt = onSnapshot(qAtt, (snap) => {
      const records = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setAllAttendance(records);
      setTodayRecords(
        records.filter((r: any) => r.date === todayStr)
               .sort((a: any, b: any) => (b.timestamp || 0) - (a.timestamp || 0))
      );
    });

    // 班表（只顯示已發佈）
    const qSched = query(collection(db, 'schedules'), where('employeeId', '==', user.uid));
    const unsubSched = onSnapshot(qSched, (snap) => {
      const records = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const published = records.filter((r: any) => r.isPublished === true);
      published.sort((a: any, b: any) => b.date.localeCompare(a.date));
      setMySchedules(published);
    });

    // 薪資（只顯示已發佈）
    const qPay = query(collection(db, 'payroll'), where('employeeId', '==', user.uid));
    const unsubPay = onSnapshot(qPay, (snap) => {
      const records = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const published = records.filter((r: any) => r.isPublished === true);
      published.sort((a: any, b: any) => b.month.localeCompare(a.month));
      setMyPayroll(published);
    });

    // 請假申請
    const qLeaves = query(collection(db, 'leaves'), where('employeeId', '==', user.uid));
    const unsubLeaves = onSnapshot(qLeaves, (snap) => {
      const records = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      records.sort((a: any, b: any) => (b.timestamp || 0) - (a.timestamp || 0));
      setMyLeaves(records);
    });

    // 加班申請
    const qOT = query(collection(db, 'overtime_requests'), where('employeeId', '==', user.uid));
    const unsubOT = onSnapshot(qOT, (snap) => {
      const records = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      records.sort((a: any, b: any) => (b.timestamp || 0) - (a.timestamp || 0));
      setMyOvertimes(records);
    });

    // 補卡申請
    const qPunch = query(collection(db, 'punch_corrections'), where('employeeId', '==', user.uid));
    const unsubPunch = onSnapshot(qPunch, (snap) => {
      const records = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      records.sort((a: any, b: any) => (b.timestamp || 0) - (a.timestamp || 0));
      setMyPunchCorrections(records);
    });

    // 打卡異常申訴
    const qAppeal = query(collection(db, 'attendance_appeals'), where('employeeId', '==', user.uid));
    const unsubAppeal = onSnapshot(qAppeal, (snap) => {
      const records = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      records.sort((a: any, b: any) => (b.timestamp || 0) - (a.timestamp || 0));
      setMyAppeals(records);
    });

    return () => {
      unsubAtt(); unsubSched(); unsubPay();
      unsubLeaves(); unsubOT(); unsubPunch(); unsubAppeal();
    };
  }, [user]);

  // ── 假別剩餘天數計算 ──
  const leaveBalance = useMemo(() => {
    const approvedLeaves = myLeaves.filter(l => l.status === 'approved');
    const usedDays = (type: string) =>
      approvedLeaves
        .filter(l => l.leaveType === type)
        .reduce((sum, l) => sum + (l.hours || 0) / 8, 0);

    const annualTotal = calcAnnualLeaveDays(employeeProfile?.onboardDate || '');
    return {
      annual:      { total: annualTotal, used: usedDays('annual'),      remaining: Math.max(0, annualTotal - usedDays('annual')) },
      sick:        { total: 30,          used: usedDays('sick'),         remaining: Math.max(0, 30 - usedDays('sick')) },
      personal:    { total: 14,          used: usedDays('personal'),     remaining: Math.max(0, 14 - usedDays('personal')) },
      menstrual:   { total: 3,           used: usedDays('menstrual'),    remaining: Math.max(0, 3 - usedDays('menstrual')) },
    };
  }, [myLeaves, employeeProfile]);

  // ── 出勤異常（供申訴用）──
  const employeeExceptions = useMemo(() => {
    if (!user) return [];
    const list: Array<{ id: string; date: string; message: string; type: string; recId: string }> = [];
    const todayStr = new Date().toLocaleDateString('sv');
    const attByDate: { [date: string]: any[] } = {};
    allAttendance.forEach((rec: any) => {
      if (!rec.date) return;
      if (!attByDate[rec.date]) attByDate[rec.date] = [];
      attByDate[rec.date].push(rec);
    });
    const pastSchedules = mySchedules.filter(s => s.date < todayStr && !isOffShift(s.shift));

    pastSchedules.forEach((sched: any) => {
      const date = sched.date;
      const dayAtt = attByDate[date] || [];
      const hasLeave = myLeaves.some(l => l.startDate <= date && l.endDate >= date && l.status === 'approved');
      if (hasLeave) return;
      const inRec = dayAtt.find(r => r.type === '上班');
      const outRec = dayAtt.find(r => r.type === '下班');
      if (!inRec && !outRec) {
        list.push({ id: `absent-${date}`, date, type: '曠職', message: `當天有班表 (${sched.shift})，但無任何打卡紀錄。`, recId: '' });
      } else if (!inRec || !outRec) {
        list.push({ id: `miss-${date}`, date, type: '缺卡', message: `打卡不完整：${inRec ? '已打上班但缺下班卡' : '已打下班但缺上班卡'}。`, recId: inRec?.id || outRec?.id || '' });
      } else {
        const statuses = dayAtt.map(r => r.status).filter(s => s && s !== '正常');
        if (statuses.length > 0) {
          list.push({ id: `exc-${date}`, date, type: statuses.join('、'), message: `打卡時間：上班 ${inRec.time || '-'} / 下班 ${outRec.time || '-'} (班表: ${sched.shift})。`, recId: inRec.id });
        }
      }
    });
    return list.sort((a, b) => b.date.localeCompare(a.date));
  }, [allAttendance, mySchedules, myLeaves, user]);

  // ── 打卡 ──
  const handleClockIn = (type: 'in' | 'out') => {
    if (!auth.currentUser) {
      setLocationState({ status: 'error', message: '請先登入後再進行打卡！', coords: null });
      return;
    }
    setLocationState({ status: 'locating', message: '取得目前位置中...', coords: null });
    if (!navigator.geolocation) {
      setLocationState({ status: 'error', message: '您的瀏覽器不支援地理位置功能', coords: null });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        setLocationState({ status: 'success', message: '定位成功', coords: { lat: latitude, lng: longitude } });
        const timeStr = new Date().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' });
        const actionStr = type === 'in' ? '上班' : '下班';
        try {
          const { getDocs, query: fQuery, collection: fCol, where: fWhere } = await import('firebase/firestore');
          const schedSnap = await getDocs(fQuery(fCol(db, 'schedules'), fWhere('employeeId', '==', auth.currentUser?.uid || '')));
          const activeSchedules = schedSnap.docs.map(d => ({ id: d.id, ...d.data() })) as any[];
          const { assignClockToWorkDate } = await import('../utils/taiwanHrEngine');
          const now = new Date();
          const matchResult = assignClockToWorkDate(now, type === 'in', activeSchedules, toleranceMinutes / 60);
          let clockStatus = '正常';
          const matchedSched = activeSchedules.find(s => s.id === matchResult.scheduleId);
          if (matchedSched) {
            const workDate = matchedSched.date || matchedSched.workDate || '';
            const timeMatch = (matchedSched.shift || '').match(/\((\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})\)/);
            if (timeMatch && workDate) {
              const [yr, mo, dy] = workDate.split('-').map(Number);
              const [sh, sm] = timeMatch[1].split(':').map(Number);
              const [eh, em] = timeMatch[2].split(':').map(Number);
              const expectedIn  = new Date(yr, mo - 1, dy, sh, sm);
              let   expectedOut = new Date(yr, mo - 1, dy, eh, em);
              if (expectedOut < expectedIn) expectedOut.setDate(expectedOut.getDate() + 1);
              if (type === 'in'  && now.getTime() > expectedIn.getTime()  + 60000) clockStatus = '遲到';
              if (type === 'out' && now.getTime() < expectedOut.getTime() - 60000) clockStatus = '早退';
            }
          } else {
            clockStatus = '異常';
          }
          await addDoc(collection(db, 'attendance'), {
            empName: employeeName || auth.currentUser?.email || '未名員工',
            employeeId: auth.currentUser?.uid || 'UNKNOWN',
            date: matchResult.workDate,
            time: timeStr,
            type: actionStr,
            coords: { lat: latitude, lng: longitude },
            timestamp: serverTimestamp(),
            status: clockStatus,
            scheduleId: matchResult.scheduleId || ''
          });
          setClockInRecord(`工作日 ${matchResult.workDate} 於 ${timeStr} 完成${actionStr}打卡並同步至資料庫`);
        } catch (error: any) {
          console.error('Firestore error:', error);
          setLocationState({ status: 'error', message: `打卡儲存失敗: ${error.message}`, coords: null });
        }
      },
      (error) => {
        setLocationState({ status: 'error', message: `定位失敗: ${error.message}，請確認是否開啟定位權限。`, coords: null });
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  const handleSignOut = async (e: React.MouseEvent) => {
    e.preventDefault();
    try {
      await signOut(auth);
      setClockInRecord(null);
      setEmployeeName('');
      setActiveSubTab('clock');
      setLocationState({ status: 'idle', message: '已安全登出', coords: null });
    } catch (err) {
      console.error('Sign out error:', err);
    }
  };

  // ── 送出請假 ──
  const handleSubmitLeave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!leaveStart || !leaveEnd) { setLeaveMsg({ type: 'error', text: '請填寫請假起迄日期' }); return; }
    const periodLabel = leavePeriod === 'morning' ? '上午' : leavePeriod === 'afternoon' ? '下午' : '全天';
    const computedHours = leavePeriod === 'full' ? leaveHours : 4;
    setLeaveSubmitting(true);
    setLeaveMsg({ type: '', text: '' });
    try {
      await addDoc(collection(db, 'leaves'), {
        employeeId: user.uid,
        empName: employeeName || user.email || '未名員工',
        leaveType,
        startDate: leaveStart,
        endDate: leaveEnd,
        period: leavePeriod,
        periodLabel,
        hours: computedHours,
        reason: leaveReason,
        status: 'pending',
        timestamp: Date.now()
      });
      setLeaveMsg({ type: 'success', text: '請假申請已送出，等待主管審核' });
      setLeaveStart(''); setLeaveEnd(''); setLeaveReason(''); setLeaveHours(8); setLeavePeriod('full');
    } catch (err: any) {
      setLeaveMsg({ type: 'error', text: err.message || '送出失敗，請稍後再試' });
    } finally { setLeaveSubmitting(false); }
  };



  const handleOpenEditLeave = (lv: any) => {
    setEditLeaveId(lv.id);
    setEditLeaveType(lv.leaveType || 'sick');
    setEditLeaveStart(lv.startDate || '');
    setEditLeaveEnd(lv.endDate || '');
    setEditLeavePeriod(lv.leavePeriod || 'full');
    setEditLeaveHours(Number(lv.hours) || 8);
    setEditLeaveReason(lv.reason || '');
    setShowEditLeaveModal(true);
  };

  const handleUpdateLeave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const finalHours = editLeavePeriod === 'full' ? Number(editLeaveHours) : 4;
      const periodLbl = editLeavePeriod === 'full' ? '全天' : editLeavePeriod === 'morning' ? '上半天' : '下半天';
      await updateDoc(doc(db, 'leaves', editLeaveId), {
        leaveType: editLeaveType,
        startDate: editLeaveStart,
        endDate: editLeaveEnd,
        leavePeriod: editLeavePeriod,
        periodLabel: periodLbl,
        hours: finalHours,
        reason: editLeaveReason
      });
      setShowEditLeaveModal(false);
      alert('請假單修改成功！');
    } catch (err: any) {
      alert('修改失敗：' + err.message);
    }
  };

  const handleDeleteLeave = async (id: string) => {
    if (!window.confirm('確定要刪除此請假單嗎？此動作無法復原。')) return;
    try {
      await deleteDoc(doc(db, 'leaves', id));
      alert('請假單已刪除！');
    } catch (err: any) {
      alert('刪除失敗：' + err.message);
    }
  };

  // ── 送出加班 ──
  const handleSubmitOvertime = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!otDate) { setOtMsg({ type: 'error', text: '請填寫加班日期' }); return; }
    setOtSubmitting(true);
    setOtMsg({ type: '', text: '' });
    try {
      // 1. 取得當天打卡紀錄
      const dayPunches = allAttendance.filter((rec: any) => rec.date === otDate);
      if (dayPunches.length === 0) {
        setOtMsg({ type: 'error', text: '當天無打卡紀錄，無法申請加班！' });
        setOtSubmitting(false);
        return;
      }

      // 2. 獲取打卡時間段
      const punchTimes = dayPunches.map((rec: any) => rec.time).filter(Boolean).sort();
      if (punchTimes.length === 0) {
        setOtMsg({ type: 'error', text: '當天無有效打卡時間，無法申請加班！' });
        setOtSubmitting(false);
        return;
      }

      const minPunch = punchTimes[0];
      const maxPunch = punchTimes[punchTimes.length - 1];

      // 3. 判斷加班時段是否在打卡時段內
      const [startH, startM] = otStartTime.split(':').map(Number);
      const [endH, endM] = otEndTime.split(':').map(Number);
      const isCrossMidnight = (endH * 60 + endM) < (startH * 60 + startM);

      if (isCrossMidnight) {
        // 跨夜加班至少開始時間需大於等於最早打卡時間
        if (otStartTime < minPunch) {
          setOtMsg({ type: 'error', text: `加班開始時間 (${otStartTime}) 必須在當天實際打卡時段 (${minPunch} ~ ${maxPunch}) 之內！` });
          setOtSubmitting(false);
          return;
        }
      } else {
        // 同天加班，起迄時間必須完全在打卡區間內
        if (otStartTime < minPunch || otEndTime > maxPunch) {
          setOtMsg({ type: 'error', text: `加班時段 (${otStartTime} ~ ${otEndTime}) 必須在當天實際打卡時段 (${minPunch} ~ ${maxPunch}) 之內！` });
          setOtSubmitting(false);
          return;
        }
      }

      // 4. 送出加班申請
      await addDoc(collection(db, 'overtime_requests'), {
        employeeId: user.uid,
        empName: employeeName || user.email || '未名員工',
        date: otDate,
        startTime: otStartTime,
        endTime: otEndTime,
        hours: otHours,
        reason: otReason,
        status: 'pending',
        timestamp: Date.now()
      });
      setOtMsg({ type: 'success', text: '加班申請已送出，等待主管審核' });
      setOtDate(''); 
      setOtStartTime('18:00');
      setOtEndTime('20:00');
      setOtHours(2); 
      setOtReason('');
    } catch (err: any) {
      setOtMsg({ type: 'error', text: err.message || '送出失敗，請稍後再試' });
    } finally { setOtSubmitting(false); }
  };

  // ── 取消加班 ──
  const handleCancelOvertime = async (id: string) => {
    if (!window.confirm('確定要撤銷此加班申請嗎？')) return;
    try {
      await updateDoc(doc(db, 'overtime_requests', id), { status: 'cancelled' });
    } catch (err: any) { alert('撤銷失敗：' + err.message); }
  };

  // ── 補卡申請 ──
  const handleSubmitPunchCorrection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!punchDate || !punchTime) { setPunchMsg({ type: 'error', text: '請填寫補卡日期與時間' }); return; }
    setPunchSubmitting(true);
    setPunchMsg({ type: '', text: '' });
    try {
      await addDoc(collection(db, 'punch_corrections'), {
        employeeId: user.uid,
        empName: employeeName || user.email || '未名員工',
        date: punchDate,
        time: punchTime,
        type: punchType,
        reason: punchReason,
        status: 'pending',
        timestamp: Date.now()
      });
      setPunchMsg({ type: 'success', text: '補卡申請已送出，等待主管審核' });
      setPunchDate(''); setPunchTime(''); setPunchReason(''); setPunchType('上班');
    } catch (err: any) {
      setPunchMsg({ type: 'error', text: err.message || '送出失敗，請稍後再試' });
    } finally { setPunchSubmitting(false); }
  };

  // ── 打卡異常申訴 ──
  const handleSubmitAppeal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!appealTargetId) { setAppealMsg({ type: 'error', text: '請選擇要申訴的異常紀錄' }); return; }
    if (!appealReason.trim()) { setAppealMsg({ type: 'error', text: '請填寫申訴說明' }); return; }
    setAppealSubmitting(true);
    setAppealMsg({ type: '', text: '' });
    try {
      const targetEx = employeeExceptions.find(ex => ex.id === appealTargetId);
      await addDoc(collection(db, 'attendance_appeals'), {
        employeeId: user.uid,
        empName: employeeName || user.email || '未名員工',
        exceptionId: appealTargetId,
        attendanceId: targetEx?.recId || '',
        exceptionDate: targetEx?.date || '',
        exceptionType: targetEx?.type || '',
        reason: appealReason,
        status: 'pending',
        timestamp: Date.now()
      });
      setAppealMsg({ type: 'success', text: '申訴已送出，等待主管確認' });
      setAppealTargetId(''); setAppealReason('');
    } catch (err: any) {
      setAppealMsg({ type: 'error', text: err.message || '送出失敗，請稍後再試' });
    } finally { setAppealSubmitting(false); }
  };

  // ── 工具函式 ──
  const getStatusBadge = (status: string) => {
    if (status === 'approved')   return { label: '✅ 已核准', color: '#10b981', bg: 'rgba(16,185,129,0.1)' };
    if (status === 'rejected')   return { label: '❌ 已拒絕', color: '#ef4444', bg: 'rgba(239,68,68,0.1)' };
    if (status === 'cancelled')  return { label: '🚫 已撤銷', color: '#9ca3af', bg: 'rgba(156,163,175,0.1)' };
    return { label: '⏳ 待審核', color: '#f59e0b', bg: 'rgba(245,158,11,0.1)' };
  };
  const leaveTypeLabel = (type: string) => LEAVE_TYPES.find(l => l.value === type)?.label || type;

  const formattedTime = currentTime.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const formattedDate = currentTime.toLocaleDateString('zh-TW', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });

  // ── 共用樣式 ──
  const inputStyle: React.CSSProperties = { width: '100%', padding: '8px 10px', borderRadius: '7px', border: '1px solid #d1d5db', fontSize: '13px', backgroundColor: '#fff', boxSizing: 'border-box' };
  const labelStyle: React.CSSProperties = { fontSize: '12px', fontWeight: '600', display: 'block', marginBottom: '4px', color: '#374151' };

  return (
    <div className="clock-in-container fade-in">
      <div className="glass-card clock-card">
        <h1 className="company-title">員工行動打卡系統</h1>

        {user && (
          <div className="employee-tabs">
            <button className={`tab-btn ${activeSubTab === 'clock'    ? 'active' : ''}`} onClick={() => setActiveSubTab('clock')}>🕒 行動打卡</button>
            <button className={`tab-btn ${activeSubTab === 'schedule' ? 'active' : ''}`} onClick={() => setActiveSubTab('schedule')}>📅 我的班表</button>
            <button className={`tab-btn ${activeSubTab === 'payroll'  ? 'active' : ''}`} onClick={() => setActiveSubTab('payroll')}>💰 我的薪資</button>
            <button className={`tab-btn ${activeSubTab === 'apply'    ? 'active' : ''}`} onClick={() => setActiveSubTab('apply')}>
              📋 線上申請
              {(myLeaves.filter(l => l.status === 'pending').length + myOvertimes.filter(l => l.status === 'pending').length + myPunchCorrections.filter(l => l.status === 'pending').length) > 0 && (
                <span style={{ marginLeft: '4px', background: '#ef4444', color: '#fff', borderRadius: '99px', padding: '0 5px', fontSize: '10px' }}>
                  {myLeaves.filter(l => l.status === 'pending').length + myOvertimes.filter(l => l.status === 'pending').length + myPunchCorrections.filter(l => l.status === 'pending').length}
                </span>
              )}
            </button>
          </div>
        )}

        {/* ── 打卡 Tab ── */}
        {activeSubTab === 'clock' && (
          <div className="tab-panel">
            {/* 出勤異常通知 */}
            {employeeExceptions.length > 0 && (
              <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '12px', padding: '12px 16px', marginBottom: '16px', textAlign: 'left' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#dc2626', fontWeight: '700', fontSize: '13px', marginBottom: '6px' }}>
                  <span>⚠️ 出勤異常通知 ({employeeExceptions.length} 筆)</span>
                  <button onClick={() => { setActiveSubTab('apply'); setApplySubTab('appeal'); }}
                    style={{ marginLeft: 'auto', fontSize: '11px', color: '#7c3aed', background: 'rgba(124,58,237,0.1)', border: 'none', borderRadius: '6px', padding: '3px 8px', cursor: 'pointer', fontWeight: '700' }}>
                    前往申訴 →
                  </button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '100px', overflowY: 'auto' }}>
                  {employeeExceptions.map((ex, i) => (
                    <div key={i} style={{ fontSize: '11px', color: '#4b5563' }}>
                      <strong>{ex.date}</strong>：<span style={{ color: '#dc2626', fontWeight: '600' }}>[{ex.type}]</span> {ex.message}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="time-display">
              <div className="current-time">{formattedTime}</div>
              <div className="current-date">{formattedDate}</div>
            </div>
            <div className="action-buttons">
              <button className="btn btn-clock-in"  onClick={() => handleClockIn('in')} ><span className="icon">☀️</span> 上班打卡</button>
              <button className="btn btn-clock-out" onClick={() => handleClockIn('out')}><span className="icon">🌙</span> 下班打卡</button>
            </div>
            <div className={`status-message status-${locationState.status}`}>{locationState.message}</div>
            {clockInRecord && <div className="record-success fade-in">✅ {clockInRecord}</div>}
            {user && todayRecords.length > 0 && (
              <div className="today-records-section fade-in">
                <h4 className="section-title">今日打卡紀錄</h4>
                <div className="mini-table-container">
                  <table className="mini-table">
                    <thead><tr><th>打卡時間</th><th>類型</th><th>狀態</th><th>定位</th></tr></thead>
                    <tbody>
                      {todayRecords.map((rec) => (
                        <tr key={rec.id}>
                          <td>{rec.time}</td>
                          <td><span className={`badge badge-${rec.type === '上班' ? 'primary' : 'neutral'}`}>{rec.type}</span></td>
                          <td><span className={`badge badge-${rec.status === '正常' ? 'success' : 'warning'}`}>{rec.status}</span></td>
                          <td>{rec.coords ? <a href={`https://www.google.com/maps?q=${rec.coords.lat},${rec.coords.lng}`} target="_blank" rel="noopener noreferrer" className="map-link">📍 查看地圖</a> : <span className="text-muted">無定位</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── 班表 Tab（日曆型）── */}
        {activeSubTab === 'schedule' && (() => {
          const todayStr = new Date().toLocaleDateString('sv');
          const daysInMonth = new Date(calYear, calMonth, 0).getDate();
          const firstDow = new Date(calYear, calMonth - 1, 1).getDay();

          const schedMap: Record<string, any> = {};
          mySchedules.forEach(s => { if (s.date) schedMap[s.date] = s; });

          const attMap: Record<string, any[]> = {};
          allAttendance.forEach((r: any) => {
            if (!r.date) return;
            if (!attMap[r.date]) attMap[r.date] = [];
            attMap[r.date].push(r);
          });

          const prevMonth = () => { if (calMonth === 1) { setCalYear(y => y - 1); setCalMonth(12); } else setCalMonth(m => m - 1); };
          const nextMonth = () => { if (calMonth === 12) { setCalYear(y => y + 1); setCalMonth(1); } else setCalMonth(m => m + 1); };

          const weekDays = ['日', '一', '二', '三', '四', '五', '六'];
          const cells: (number | null)[] = [
            ...Array(firstDow).fill(null),
            ...Array.from({ length: daysInMonth }, (_, i) => i + 1)
          ];

          return (
            <div className="tab-panel fade-in">
              {/* 月份切換列 */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                <button onClick={prevMonth} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '8px', padding: '6px 14px', cursor: 'pointer', fontSize: '18px', color: 'var(--text-main)' }}>‹</button>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '17px', fontWeight: '800', color: 'var(--primary)' }}>{calYear} 年 {calMonth} 月</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>💡 僅顯示管理員已發佈的班表</div>
                </div>
                <button onClick={nextMonth} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '8px', padding: '6px 14px', cursor: 'pointer', fontSize: '18px', color: 'var(--text-main)' }}>›</button>
              </div>

              {/* 星期標頭 */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '3px', marginBottom: '3px' }}>
                {weekDays.map((d, i) => (
                  <div key={d} style={{ textAlign: 'center', fontSize: '11px', fontWeight: '700',
                    color: i === 0 ? '#ef4444' : i === 6 ? '#4f46e5' : '#9ca3af', padding: '4px 0' }}>{d}</div>
                ))}
              </div>

              {/* 日期格子 */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '3px' }}>
                {cells.map((day, idx) => {
                  if (!day) return <div key={`e-${idx}`} style={{ minHeight: '68px' }} />;
                  const dateStr = `${calYear}-${String(calMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                  const sched = schedMap[dateStr];
                  const dayAtts = attMap[dateStr] || [];
                  const hasIn  = dayAtts.some(r => r.type === '上班');
                  const hasOut = dayAtts.some(r => r.type === '下班');
                  const isToday   = dateStr === todayStr;
                  const isFuture  = dateStr > todayStr;
                  const dow = new Date(dateStr).getDay();
                  const hasLeave  = myLeaves.some(l => l.startDate <= dateStr && l.endDate >= dateStr && l.status === 'approved');
                  const isException = sched && !isFuture && !hasLeave && (!hasIn || !hasOut);
                  const shiftShort = sched ? (sched.shift || '').replace(/\s*\(.*?\)/, '').slice(0, 4) : '';
                  const shiftTime  = sched ? ((sched.shift || '').match(/\((.+?)\)/) || [])[1] || '' : '';

                  return (
                    <div key={dateStr} style={{
                      minHeight: '68px', borderRadius: '8px', padding: '5px 4px',
                      backgroundColor: isToday ? 'rgba(79,70,229,0.08)' : sched ? 'rgba(16,185,129,0.05)' : '#fafafa',
                      border: isToday ? '2px solid var(--primary)'
                        : isException ? '1px solid rgba(239,68,68,0.35)'
                        : sched ? '1px solid rgba(16,185,129,0.25)'
                        : '1px solid var(--border)',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px',
                      position: 'relative', overflow: 'hidden'
                    }}>
                      {/* 日期數字 */}
                      <div style={{ fontWeight: isToday ? '900' : '600', fontSize: '13px', lineHeight: 1,
                        color: isToday ? 'var(--primary)' : dow === 0 ? '#ef4444' : dow === 6 ? '#4f46e5' : '#374151' }}>{day}</div>

                      {/* 班別標籤 */}
                      {sched && (
                        <>
                          <div style={{ fontSize: '10px', fontWeight: '700', color: '#fff', backgroundColor: '#10b981',
                            borderRadius: '4px', padding: '1px 5px', whiteSpace: 'nowrap',
                            maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis' }}>{shiftShort}</div>
                          {shiftTime && (
                            <div style={{ fontSize: '8px', color: '#6b7280', lineHeight: 1.3, textAlign: 'center', wordBreak: 'break-all' }}>{shiftTime}</div>
                          )}
                        </>
                      )}

                      {/* 請假標示 */}
                      {hasLeave && (
                        <div style={{ fontSize: '9px', color: '#d97706', fontWeight: '700',
                          backgroundColor: 'rgba(245,158,11,0.12)', borderRadius: '3px', padding: '1px 5px' }}>假</div>
                      )}

                      {/* 打卡狀態圓點 */}
                      {sched && !isFuture && !hasLeave && (
                        <div style={{ display: 'flex', gap: '3px', marginTop: '2px' }}>
                          <div title="上班卡" style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: hasIn ? '#10b981' : '#ef4444' }} />
                          <div title="下班卡" style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: hasOut ? '#10b981' : '#ef4444' }} />
                        </div>
                      )}

                      {/* 異常角標 */}
                      {isException && (
                        <div style={{ position: 'absolute', top: '1px', right: '2px', fontSize: '9px' }}>⚠️</div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* 圖例 */}
              <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', marginTop: '12px', fontSize: '11px', color: '#6b7280', justifyContent: 'center' }}>
                <span style={{ display:'flex', alignItems:'center', gap:'4px' }}><span style={{ width:'8px', height:'8px', borderRadius:'50%', backgroundColor:'#10b981', display:'inline-block' }} />已打卡</span>
                <span style={{ display:'flex', alignItems:'center', gap:'4px' }}><span style={{ width:'8px', height:'8px', borderRadius:'50%', backgroundColor:'#ef4444', display:'inline-block' }} />未打卡</span>
                <span style={{ display:'flex', alignItems:'center', gap:'4px' }}><span style={{ width:'10px', height:'10px', borderRadius:'3px', backgroundColor:'rgba(16,185,129,0.2)', border:'1px solid #10b981', display:'inline-block' }} />有班表</span>
                <span>⚠️ 缺卡/暠職</span>
                <span style={{ color:'#d97706' }}>假 = 已核准請假</span>
              </div>
            </div>
          );
        })()}

        {/* ── 薪資 Tab ── */}
        {activeSubTab === 'payroll' && (
          <div className="tab-panel fade-in">
            <h3 className="tab-panel-title">我的薪資單歷史</h3>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '12px' }}>💡 點擊薪資列可查看完整薪資明細（僅顯示管理員已發佈的薪資單）</p>
            {myPayroll.length === 0
              ? <p className="empty-message">目前沒有已結算的薪資單</p>
              : (
                <div className="mini-table-container">
                  <table className="mini-table">
                    <thead>
                      <tr><th>結算月份</th><th>底薪</th><th>津貼</th><th>加班費</th><th>扣款</th><th>實發薪資</th><th>狀態</th></tr>
                    </thead>
                    <tbody>
                      {myPayroll.map((pay) => (
                        <tr key={pay.id} onClick={() => setSelectedSlip(pay)} style={{ cursor: 'pointer' }} className="payroll-row-clickable">
                          <td style={{ fontWeight: '600' }}>{pay.month}</td>
                          <td>NT$ {pay.baseSalary?.toLocaleString()}</td>
                          <td style={{ color: '#10b981' }}>+NT$ {((pay.mealAllowance || 0) + (pay.attendanceBonus || 0) + (pay.otherAllowance || 0)).toLocaleString()}</td>
                          <td style={{ color: '#10b981' }}>+NT$ {pay.overtime?.toLocaleString()}</td>
                          <td style={{ color: '#ef4444' }}>-NT$ {pay.deductions?.toLocaleString()}</td>
                          <td style={{ fontWeight: '700', color: 'var(--primary)' }}>NT$ {pay.netSalary?.toLocaleString()}</td>
                          <td><span className={`badge badge-${pay.status === '已發放' ? 'success' : 'neutral'}`}>{pay.status}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
          </div>
        )}

        {/* ── 線上申請 Tab ── */}
        {activeSubTab === 'apply' && (
          <div className="tab-panel fade-in">
            <h3 className="tab-panel-title">線上差勤申請</h3>

            {/* 假別剩餘天數一覽 */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', marginBottom: '16px' }}>
              {[
                { key: 'annual',    label: '特別休假', icon: '🏖️', color: '#4f46e5' },
                { key: 'sick',      label: '病假',     icon: '🏥', color: '#059669' },
                { key: 'personal',  label: '事假',     icon: '👤', color: '#d97706' },
                { key: 'menstrual', label: '生理假',   icon: '💊', color: '#db2777' },
              ].map(item => {
                const bal = leaveBalance[item.key as keyof typeof leaveBalance];
                return (
                  <div key={item.key} style={{ background: `rgba(${item.color === '#4f46e5' ? '79,70,229' : item.color === '#059669' ? '5,150,105' : item.color === '#d97706' ? '217,119,6' : '219,39,119'},0.06)`, border: `1px solid rgba(${item.color === '#4f46e5' ? '79,70,229' : item.color === '#059669' ? '5,150,105' : item.color === '#d97706' ? '217,119,6' : '219,39,119'},0.15)`, borderRadius: '10px', padding: '10px', textAlign: 'center' }}>
                    <div style={{ fontSize: '16px', marginBottom: '2px' }}>{item.icon}</div>
                    <div style={{ fontSize: '10px', color: '#6b7280', marginBottom: '2px' }}>{item.label}</div>
                    <div style={{ fontSize: '18px', fontWeight: '800', color: item.color }}>{bal.remaining}</div>
                    <div style={{ fontSize: '10px', color: '#9ca3af' }}>/ {bal.total} 天</div>
                  </div>
                );
              })}
            </div>

            {/* 四個子分頁按鈕 */}
            <div style={{ display: 'flex', gap: '6px', marginBottom: '16px', flexWrap: 'wrap' }}>
              {([
                { key: 'leave',    label: '📄 請假申請' },
                { key: 'overtime', label: '⏰ 加班申請' },
                { key: 'punch',    label: '🔧 補卡申請' },
                { key: 'appeal',   label: '📣 異常申訴' },
              ] as const).map(tab => (
                <button key={tab.key} onClick={() => setApplySubTab(tab.key)}
                  style={{ padding: '8px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: '600', border: 'none', cursor: 'pointer',
                    backgroundColor: applySubTab === tab.key ? 'var(--primary)' : '#f3f4f6',
                    color: applySubTab === tab.key ? '#fff' : 'var(--text-main)' }}>
                  {tab.label}
                </button>
              ))}
            </div>

            {/* ── 請假申請 ── */}
            {applySubTab === 'leave' && (
              <div>
                <form onSubmit={handleSubmitLeave} style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '24px' }}>
                  <div style={{ background: 'linear-gradient(135deg,rgba(79,70,229,0.06),rgba(124,58,237,0.04))', borderRadius: '12px', padding: '16px', border: '1px solid rgba(79,70,229,0.1)' }}>
                    <div style={{ fontSize: '13px', fontWeight: '700', color: 'var(--primary)', marginBottom: '12px' }}>📄 新增請假申請</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                      <div>
                        <label style={labelStyle}>假別</label>
                        <select value={leaveType} onChange={e => setLeaveType(e.target.value)} style={inputStyle}>
                          {LEAVE_TYPES.map(lt => <option key={lt.value} value={lt.value}>{lt.label}</option>)}
                        </select>
                      </div>
                      <div>
                        <label style={labelStyle}>請假時段</label>
                        <select value={leavePeriod} onChange={e => setLeavePeriod(e.target.value as any)} style={inputStyle}>
                          <option value="full">全天（8 小時）</option>
                          <option value="morning">上半天（4 小時）</option>
                          <option value="afternoon">下半天（4 小時）</option>
                        </select>
                      </div>
                      {leavePeriod === 'full' && (
                        <div>
                          <label style={labelStyle}>請假時數（全天請假時填寫）</label>
                          <input type="number" min={1} max={240} value={leaveHours} onChange={e => setLeaveHours(Number(e.target.value))} style={inputStyle} />
                        </div>
                      )}
                      <div>
                        <label style={labelStyle}>開始日期</label>
                        <input type="date" required value={leaveStart} onChange={e => setLeaveStart(e.target.value)} style={inputStyle} />
                      </div>
                      <div>
                        <label style={labelStyle}>結束日期</label>
                        <input type="date" required value={leaveEnd} onChange={e => setLeaveEnd(e.target.value)} style={inputStyle} />
                      </div>
                    </div>
                    <div style={{ marginTop: '10px' }}>
                      <label style={labelStyle}>請假事由</label>
                      <textarea value={leaveReason} onChange={e => setLeaveReason(e.target.value)} rows={2} placeholder="請填寫請假原因（選填）" style={{ ...inputStyle, resize: 'vertical' }} />
                    </div>
                    {leaveMsg.text && (
                      <div style={{ marginTop: '8px', padding: '8px 12px', borderRadius: '7px', fontSize: '13px', backgroundColor: leaveMsg.type === 'success' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)', color: leaveMsg.type === 'success' ? '#10b981' : '#ef4444' }}>
                        {leaveMsg.type === 'success' ? '✅' : '⚠️'} {leaveMsg.text}
                      </div>
                    )}
                    <button type="submit" disabled={leaveSubmitting}
                      style={{ marginTop: '12px', width: '100%', padding: '10px', borderRadius: '8px', border: 'none', backgroundColor: 'var(--primary)', color: '#fff', fontWeight: '700', fontSize: '14px', cursor: 'pointer' }}>
                      {leaveSubmitting ? '送出中...' : '📤 送出請假申請'}
                    </button>
                  </div>
                </form>

                <div style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-main)', marginBottom: '10px' }}>📋 我的請假紀錄</div>
                {myLeaves.length === 0
                  ? <p className="empty-message">尚無請假申請紀錄</p>
                  : (
                    <div className="mini-table-container">
                      <table className="mini-table">
                        <thead><tr><th>假別</th><th>起迄日期</th><th>時段</th><th>時數</th><th>狀態</th><th>操作</th></tr></thead>
                        <tbody>
                          {myLeaves.map(lv => {
                            const s = getStatusBadge(lv.status);
                            return (
                              <tr key={lv.id}>
                                <td>{leaveTypeLabel(lv.leaveType)}</td>
                                <td style={{ fontSize: '11px' }}>{lv.startDate}{lv.startDate !== lv.endDate ? ` ~ ${lv.endDate}` : ''}</td>
                                <td>{lv.periodLabel || '全天'}</td>
                                <td>{lv.hours} h</td>
                                <td><span style={{ padding: '2px 8px', borderRadius: '12px', fontSize: '12px', fontWeight: '600', color: s.color, backgroundColor: s.bg }}>{s.label}</span></td>
                                <td>
                                  <div style={{ display: 'flex', gap: '6px' }}>
                                    <button onClick={() => handleOpenEditLeave(lv)}
                                      style={{ fontSize: '11px', color: 'var(--primary)', background: 'none', border: '1px solid var(--primary)', borderRadius: '5px', padding: '2px 6px', cursor: 'pointer' }}>
                                      編輯
                                    </button>
                                    <button onClick={() => handleDeleteLeave(lv.id)}
                                      style={{ fontSize: '11px', color: '#ef4444', background: 'none', border: '1px solid #ef4444', borderRadius: '5px', padding: '2px 6px', cursor: 'pointer' }}>
                                      刪除
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
              </div>
            )}

            {/* ── 加班申請 ── */}
            {applySubTab === 'overtime' && (
              <div>
                <form onSubmit={handleSubmitOvertime} style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '24px' }}>
                  <div style={{ background: 'linear-gradient(135deg,rgba(16,185,129,0.06),rgba(5,150,105,0.04))', borderRadius: '12px', padding: '16px', border: '1px solid rgba(16,185,129,0.15)' }}>
                    <div style={{ fontSize: '13px', fontWeight: '700', color: '#059669', marginBottom: '12px' }}>⏰ 新增加班申請</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                      <div>
                        <label style={labelStyle}>加班日期</label>
                        <input type="date" required value={otDate} onChange={e => setOtDate(e.target.value)} style={inputStyle} />
                      </div>
                      <div>
                        <label style={labelStyle}>加班時數 (根據時段自動計算)</label>
                        <input type="number" min={0.5} max={24} step={0.1} value={otHours} onChange={e => setOtHours(Number(e.target.value))} style={inputStyle} />
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '10px' }}>
                      <div>
                        <label style={labelStyle}>加班開始時間</label>
                        <input type="time" required value={otStartTime} onChange={e => setOtStartTime(e.target.value)} style={inputStyle} />
                      </div>
                      <div>
                        <label style={labelStyle}>加班結束時間</label>
                        <input type="time" required value={otEndTime} onChange={e => setOtEndTime(e.target.value)} style={inputStyle} />
                      </div>
                    </div>
                    <div style={{ marginTop: '10px' }}>
                      <label style={labelStyle}>加班事由</label>
                      <textarea value={otReason} onChange={e => setOtReason(e.target.value)} rows={2} placeholder="請填寫加班原因（選填）" style={{ ...inputStyle, resize: 'vertical' }} />
                    </div>
                    {otMsg.text && (
                      <div style={{ marginTop: '8px', padding: '8px 12px', borderRadius: '7px', fontSize: '13px', backgroundColor: otMsg.type === 'success' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)', color: otMsg.type === 'success' ? '#10b981' : '#ef4444' }}>
                        {otMsg.type === 'success' ? '✅' : '⚠️'} {otMsg.text}
                      </div>
                    )}
                    <button type="submit" disabled={otSubmitting}
                      style={{ marginTop: '12px', width: '100%', padding: '10px', borderRadius: '8px', border: 'none', backgroundColor: '#059669', color: '#fff', fontWeight: '700', fontSize: '14px', cursor: 'pointer' }}>
                      {otSubmitting ? '送出中...' : '📤 送出加班申請'}
                    </button>
                  </div>
                </form>

                <div style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-main)', marginBottom: '10px' }}>📋 我的加班申請紀錄</div>
                {myOvertimes.length === 0
                  ? <p className="empty-message">尚無加班申請紀錄</p>
                  : (
                    <div className="mini-table-container">
                      <table className="mini-table">
                        <thead><tr><th>加班日期</th><th>時數</th><th>事由</th><th>狀態</th><th>操作</th></tr></thead>
                        <tbody>
                          {myOvertimes.map(ot => {
                            const s = getStatusBadge(ot.status);
                            return (
                              <tr key={ot.id}>
                                <td>{ot.date}{ot.startTime && ot.endTime ? ` (${ot.startTime}~${ot.endTime})` : ''}</td>
                                <td>{ot.hours} h</td>
                                <td style={{ maxWidth: '100px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ot.reason || '-'}</td>
                                <td><span style={{ padding: '2px 8px', borderRadius: '12px', fontSize: '12px', fontWeight: '600', color: s.color, backgroundColor: s.bg }}>{s.label}</span></td>
                                <td>
                                  {ot.status === 'pending' && (
                                    <button onClick={() => handleCancelOvertime(ot.id)}
                                      style={{ fontSize: '11px', color: '#ef4444', background: 'none', border: '1px solid #ef4444', borderRadius: '5px', padding: '2px 6px', cursor: 'pointer' }}>
                                      撤銷
                                    </button>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
              </div>
            )}

            {/* ── 補卡申請 ── */}
            {applySubTab === 'punch' && (
              <div>
                <form onSubmit={handleSubmitPunchCorrection} style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '24px' }}>
                  <div style={{ background: 'linear-gradient(135deg,rgba(245,158,11,0.06),rgba(217,119,6,0.04))', borderRadius: '12px', padding: '16px', border: '1px solid rgba(245,158,11,0.15)' }}>
                    <div style={{ fontSize: '13px', fontWeight: '700', color: '#d97706', marginBottom: '4px' }}>🔧 新增補卡申請</div>
                    <div style={{ fontSize: '11px', color: '#9ca3af', marginBottom: '12px' }}>若發現漏打卡，請填寫正確時間後送出，等待主管核准後將由後台補登</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                      <div>
                        <label style={labelStyle}>補卡日期</label>
                        <input type="date" required value={punchDate} onChange={e => setPunchDate(e.target.value)} style={inputStyle} />
                      </div>
                      <div>
                        <label style={labelStyle}>補卡時間</label>
                        <input type="time" required value={punchTime} onChange={e => setPunchTime(e.target.value)} style={inputStyle} />
                      </div>
                      <div>
                        <label style={labelStyle}>補卡類型</label>
                        <select value={punchType} onChange={e => setPunchType(e.target.value as any)} style={inputStyle}>
                          <option value="上班">上班打卡</option>
                          <option value="下班">下班打卡</option>
                        </select>
                      </div>
                    </div>
                    <div style={{ marginTop: '10px' }}>
                      <label style={labelStyle}>補卡原因</label>
                      <textarea value={punchReason} onChange={e => setPunchReason(e.target.value)} rows={2} placeholder="請說明漏打卡原因（例：手機沒電、網路問題等）" style={{ ...inputStyle, resize: 'vertical' }} />
                    </div>
                    {punchMsg.text && (
                      <div style={{ marginTop: '8px', padding: '8px 12px', borderRadius: '7px', fontSize: '13px', backgroundColor: punchMsg.type === 'success' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)', color: punchMsg.type === 'success' ? '#10b981' : '#ef4444' }}>
                        {punchMsg.type === 'success' ? '✅' : '⚠️'} {punchMsg.text}
                      </div>
                    )}
                    <button type="submit" disabled={punchSubmitting}
                      style={{ marginTop: '12px', width: '100%', padding: '10px', borderRadius: '8px', border: 'none', backgroundColor: '#d97706', color: '#fff', fontWeight: '700', fontSize: '14px', cursor: 'pointer' }}>
                      {punchSubmitting ? '送出中...' : '📤 送出補卡申請'}
                    </button>
                  </div>
                </form>

                <div style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-main)', marginBottom: '10px' }}>📋 我的補卡申請紀錄</div>
                {myPunchCorrections.length === 0
                  ? <p className="empty-message">尚無補卡申請紀錄</p>
                  : (
                    <div className="mini-table-container">
                      <table className="mini-table">
                        <thead><tr><th>補卡日期</th><th>補卡時間</th><th>類型</th><th>原因</th><th>狀態</th></tr></thead>
                        <tbody>
                          {myPunchCorrections.map(pc => {
                            const s = getStatusBadge(pc.status);
                            return (
                              <tr key={pc.id}>
                                <td>{pc.date}</td>
                                <td>{pc.time}</td>
                                <td>{pc.type}</td>
                                <td style={{ maxWidth: '100px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pc.reason || '-'}</td>
                                <td><span style={{ padding: '2px 8px', borderRadius: '12px', fontSize: '12px', fontWeight: '600', color: s.color, backgroundColor: s.bg }}>{s.label}</span></td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
              </div>
            )}

            {/* ── 打卡異常申訴 ── */}
            {applySubTab === 'appeal' && (
              <div>
                <form onSubmit={handleSubmitAppeal} style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '24px' }}>
                  <div style={{ background: 'linear-gradient(135deg,rgba(124,58,237,0.06),rgba(109,40,217,0.04))', borderRadius: '12px', padding: '16px', border: '1px solid rgba(124,58,237,0.15)' }}>
                    <div style={{ fontSize: '13px', fontWeight: '700', color: '#7c3aed', marginBottom: '4px' }}>📣 打卡異常申訴</div>
                    <div style={{ fontSize: '11px', color: '#9ca3af', marginBottom: '12px' }}>對於遲到、早退等打卡異常紀錄，您可以在此填寫申訴說明，等待主管確認後更新狀態</div>

                    {employeeExceptions.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '20px', color: '#10b981', fontWeight: '600', fontSize: '13px' }}>
                        ✅ 目前無出勤異常紀錄，無需申訴！
                      </div>
                    ) : (
                      <>
                        <div style={{ marginBottom: '10px' }}>
                          <label style={labelStyle}>選擇要申訴的異常紀錄</label>
                          <select value={appealTargetId} onChange={e => setAppealTargetId(e.target.value)} style={inputStyle}>
                            <option value="">-- 請選擇異常紀錄 --</option>
                            {employeeExceptions.map(ex => (
                              <option key={ex.id} value={ex.id}>
                                {ex.date} [{ex.type}] {ex.message.slice(0, 30)}...
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label style={labelStyle}>申訴說明（請說明實際情況）</label>
                          <textarea value={appealReason} onChange={e => setAppealReason(e.target.value)} rows={3} required
                            placeholder="例：當天因交通事故導致延誤到班，已向主管口頭說明。實際到班時間為 09:15。"
                            style={{ ...inputStyle, resize: 'vertical' }} />
                        </div>
                        {appealMsg.text && (
                          <div style={{ marginTop: '8px', padding: '8px 12px', borderRadius: '7px', fontSize: '13px', backgroundColor: appealMsg.type === 'success' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)', color: appealMsg.type === 'success' ? '#10b981' : '#ef4444' }}>
                            {appealMsg.type === 'success' ? '✅' : '⚠️'} {appealMsg.text}
                          </div>
                        )}
                        <button type="submit" disabled={appealSubmitting}
                          style={{ marginTop: '12px', width: '100%', padding: '10px', borderRadius: '8px', border: 'none', backgroundColor: '#7c3aed', color: '#fff', fontWeight: '700', fontSize: '14px', cursor: 'pointer' }}>
                          {appealSubmitting ? '送出中...' : '📤 送出申訴'}
                        </button>
                      </>
                    )}
                  </div>
                </form>

                {/* 我的異常紀錄清單 */}
                <div style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-main)', marginBottom: '8px' }}>⚠️ 目前出勤異常清單</div>
                {employeeExceptions.length === 0
                  ? <p className="empty-message">近期無出勤異常紀錄</p>
                  : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px' }}>
                      {employeeExceptions.map((ex, i) => (
                        <div key={i} style={{ padding: '10px 14px', borderRadius: '10px', backgroundColor: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.15)', fontSize: '12px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                            <span style={{ fontWeight: '700', color: '#374151' }}>{ex.date}</span>
                            <span style={{ color: '#dc2626', fontWeight: '700', fontSize: '11px', background: 'rgba(239,68,68,0.1)', padding: '1px 7px', borderRadius: '99px' }}>[{ex.type}]</span>
                          </div>
                          <div style={{ color: '#6b7280' }}>{ex.message}</div>
                        </div>
                      ))}
                    </div>
                  )}

                {/* 申訴紀錄 */}
                <div style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-main)', marginBottom: '10px' }}>📋 我的申訴紀錄</div>
                {myAppeals.length === 0
                  ? <p className="empty-message">尚無申訴紀錄</p>
                  : (
                    <div className="mini-table-container">
                      <table className="mini-table">
                        <thead><tr><th>異常日期</th><th>異常類型</th><th>申訴說明</th><th>狀態</th></tr></thead>
                        <tbody>
                          {myAppeals.map(ap => {
                            const s = getStatusBadge(ap.status);
                            return (
                              <tr key={ap.id}>
                                <td>{ap.exceptionDate}</td>
                                <td>{ap.exceptionType}</td>
                                <td style={{ maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ap.reason}</td>
                                <td><span style={{ padding: '2px 8px', borderRadius: '12px', fontSize: '12px', fontWeight: '600', color: s.color, backgroundColor: s.bg }}>{s.label}</span></td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
              </div>
            )}
          </div>
        )}

        <div className="login-footer">
          {user ? (
            <p>
              已登入員工: <strong>{employeeName || user.email}</strong> {employeeName && `(${user.email})`} |{' '}
              <a href="#" onClick={handleSignOut} style={{ color: '#ef4444', fontWeight: 'bold' }}>登出</a>{' '}
              | 管理員請至 <Link to="/admin">後台登入</Link>
            </p>
          ) : (
            <p>
              您尚未登入，員工請至 <Link to="/login" style={{ fontWeight: 'bold' }}>員工登入</Link> | 管理員請至 <Link to="/admin">後台登入</Link>
            </p>
          )}
        </div>
      </div>

      {/* ─── 電子薪資單 Modal ─── */}
      {selectedSlip && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(8px)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}
          onClick={() => setSelectedSlip(null)}>
          <div style={{ backgroundColor: '#fff', borderRadius: '20px', padding: '32px', maxWidth: '480px', width: '100%', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: '800', color: 'var(--primary)' }}>💰 電子薪資單</h3>
              <button onClick={() => setSelectedSlip(null)} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#9ca3af' }}>×</button>
            </div>
            <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '16px', fontWeight: '600' }}>結算月份：{selectedSlip.month}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {[
                { label: '💼 底薪',     value: selectedSlip.baseSalary,       color: '#111' },
                { label: '🍱 伙食津貼', value: selectedSlip.mealAllowance || 0,   color: '#059669' },
                { label: '🏆 全勤獎金', value: selectedSlip.attendanceBonus || 0, color: '#059669', note: selectedSlip.attendanceBonusNote },
                { label: '📦 其他津貼', value: selectedSlip.otherAllowance || 0,  color: '#059669' },
                { label: '⏰ 加班費',   value: selectedSlip.overtime || 0,        color: '#2563eb' },
              ].map(item => (
                <div key={item.label}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', borderRadius: '8px', backgroundColor: '#f9fafb' }}>
                    <span style={{ fontSize: '13px', color: '#374151' }}>{item.label}</span>
                    <span style={{ fontSize: '13px', fontWeight: '700', color: item.color }}>NT$ {item.value?.toLocaleString()}</span>
                  </div>
                  {item.note && (
                    <div style={{ fontSize: '11px', color: '#dc2626', padding: '4px 12px 2px', fontWeight: '600' }}>
                      ⚠️ {item.note}
                    </div>
                  )}
                </div>
              ))}
              <div style={{ borderTop: '1px dashed #e5e7eb', margin: '4px 0' }} />
              {[
                { label: '🏥 健保自付額', value: -(selectedSlip.employeeNhi || 0),       color: '#dc2626' },
                { label: '👷 勞保自付額', value: -(selectedSlip.employeeLabor || 0),     color: '#dc2626' },
                { label: '📅 請假扣薪',   value: -(selectedSlip.leaveDeduction || 0),    color: '#dc2626' },
              ].map(item => (
                <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', borderRadius: '8px', backgroundColor: '#fff5f5' }}>
                  <span style={{ fontSize: '13px', color: '#374151' }}>{item.label}</span>
                  <span style={{ fontSize: '13px', fontWeight: '700', color: item.color }}>NT$ {item.value?.toLocaleString()}</span>
                </div>
              ))}
              <div style={{ borderTop: '2px solid var(--primary)', margin: '8px 0' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 16px', borderRadius: '10px', backgroundColor: 'rgba(79,70,229,0.06)', border: '1px solid rgba(79,70,229,0.15)' }}>
                <span style={{ fontSize: '16px', fontWeight: '800', color: 'var(--primary)' }}>🏦 實發薪資</span>
                <span style={{ fontSize: '18px', fontWeight: '900', color: 'var(--primary)' }}>NT$ {selectedSlip.netSalary?.toLocaleString()}</span>
              </div>
              <div style={{ textAlign: 'center', marginTop: '4px' }}>
                <span className={`badge badge-${selectedSlip.status === '已發放' ? 'success' : 'neutral'}`}>{selectedSlip.status}</span>
              </div>
            </div>
            <div style={{ marginTop: '16px', padding: '10px', backgroundColor: '#f3f4f6', borderRadius: '8px', fontSize: '11px', color: '#9ca3af', textAlign: 'center' }}>
              勞保投保薪資：NT$ {selectedSlip.laborSub?.toLocaleString()} ｜ 健保投保薪資：NT$ {selectedSlip.nhiSub?.toLocaleString()}
            </div>
          </div>
        </div>
      )}

      {/* 員工編輯請假 Modal */}
      {showEditLeaveModal && (
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
            <h3 style={{ marginBottom: '20px', color: 'var(--primary)', fontSize: '20px', fontWeight: '700' }}>修改請假申請</h3>
            <form onSubmit={handleUpdateLeave} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '13px', fontWeight: '600' }}>假別</label>
                <select 
                  value={editLeaveType} 
                  onChange={(e) => setEditLeaveType(e.target.value)}
                  style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px', backgroundColor: '#fff' }}
                >
                  {LEAVE_TYPES.map(lt => (
                    <option key={lt.value} value={lt.value}>{lt.label}</option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '13px', fontWeight: '600' }}>請假時段</label>
                <select 
                  value={editLeavePeriod} 
                  onChange={(e) => setEditLeavePeriod(e.target.value as any)}
                  style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px', backgroundColor: '#fff' }}
                >
                  <option value="full">全天（8 小時）</option>
                  <option value="morning">上半天（4 小時）</option>
                  <option value="afternoon">下半天（4 小時）</option>
                </select>
              </div>

              {editLeavePeriod === 'full' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '13px', fontWeight: '600' }}>請假時數（全天請假時填寫）</label>
                  <input 
                    type="number" 
                    min={1} 
                    max={240} 
                    value={editLeaveHours} 
                    onChange={(e) => setEditLeaveHours(Number(e.target.value))} 
                    style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px' }}
                  />
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '13px', fontWeight: '600' }}>開始日期</label>
                <input 
                  type="date" 
                  required 
                  value={editLeaveStart} 
                  onChange={(e) => setEditLeaveStart(e.target.value)} 
                  style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px' }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '13px', fontWeight: '600' }}>結束日期</label>
                <input 
                  type="date" 
                  required 
                  value={editLeaveEnd} 
                  onChange={(e) => setEditLeaveEnd(e.target.value)} 
                  style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px' }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '13px', fontWeight: '600' }}>請假事由</label>
                <textarea 
                  value={editLeaveReason} 
                  onChange={(e) => setEditLeaveReason(e.target.value)} 
                  rows={2}
                  placeholder="請填寫請假原因（選填）"
                  style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px', resize: 'vertical' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
                <button 
                  type="button" 
                  onClick={() => setShowEditLeaveModal(false)}
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

      {/* Background shapes */}
      <div className="shape shape-1"></div>
      <div className="shape shape-2"></div>
    </div>
  );
};

export default EmployeeClockIn;
