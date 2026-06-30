import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';
import { db, auth } from '../firebase';
import {
  collection, addDoc, serverTimestamp, query, where, onSnapshot,
  doc, getDoc, updateDoc, deleteDoc
} from 'firebase/firestore';
import './EmployeeClockIn.css';
import { isOffShift, evaluatePunchesStatus, parseTimeStrToMinutes, calculateSpecialLeavePeriods, getAdjustedShiftTimes } from '../utils/taiwanHrEngine';

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

  // ── 班表更新通知 ──
  const [scheduleNotice, setScheduleNotice] = useState<{ message: string; updatedAt: number } | null>(null);
  const [lastNoticeSeen, setLastNoticeSeen] = useState<number>(0);

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
  const [shiftsList, setShiftsList] = useState<any[]>([]);

  // 任務指示 Modal
  const [viewingInstruction, setViewingInstruction] = useState<{ date: string; station: string; text: string } | null>(null);

  // ── 請假表單 ──
  const [leaveType, setLeaveType] = useState('sick');
  const [leaveStart, setLeaveStart] = useState('');
  const [leaveEnd, setLeaveEnd] = useState('');
  const [leavePeriod, setLeavePeriod] = useState<'full' | 'morning' | 'afternoon' | 'hour'>('full');
  const [leaveHours, setLeaveHours] = useState<number>(8);
  const [annualLeaveUnit, setAnnualLeaveUnit] = useState<'day' | 'hour'>('day');
  const [leaveDaysInput, setLeaveDaysInput] = useState<number>(1);
  const [leaveReason, setLeaveReason] = useState('');
  const [leaveStartTime, setLeaveStartTime] = useState('');
  const [leaveEndTime, setLeaveEndTime] = useState('');
  const [leaveSubmitting, setLeaveSubmitting] = useState(false);
  const [leaveMsg, setLeaveMsg] = useState({ type: '', text: '' });

  // ── 編輯請假 ──
  const [showEditLeaveModal, setShowEditLeaveModal] = useState(false);
  const [editLeaveId, setEditLeaveId] = useState('');
  const [editLeaveType, setEditLeaveType] = useState('sick');
  const [editLeaveStart, setEditLeaveStart] = useState('');
  const [editLeaveEnd, setEditLeaveEnd] = useState('');
  const [editLeavePeriod, setEditLeavePeriod] = useState<'full' | 'morning' | 'afternoon' | 'hour'>('full');
  const [editLeaveHours, setEditLeaveHours] = useState<number>(8);
  const [editAnnualLeaveUnit, setEditAnnualLeaveUnit] = useState<'day' | 'hour'>('day');
  const [editLeaveDaysInput, setEditLeaveDaysInput] = useState<number>(1);
  const [editLeaveReason, setEditLeaveReason] = useState('');
  const [editLeaveStartTime, setEditLeaveStartTime] = useState('');
  const [editLeaveEndTime, setEditLeaveEndTime] = useState('');

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

  // ── 載入上次看過的班表通知時間 ──
  useEffect(() => {
    if (user) {
      const seen = localStorage.getItem(`lastScheduleNoticeSeen_${user.uid}`);
      if (seen) {
        setLastNoticeSeen(Number(seen));
      } else {
        setLastNoticeSeen(0);
      }
    } else {
      setLastNoticeSeen(0);
    }
  }, [user]);

  // ── 系統設定監聽 ──
  useEffect(() => {
    const unsubRules = onSnapshot(doc(db, 'settings', 'rules'), (docSnap) => {
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
    const unsubShifts = onSnapshot(doc(db, 'settings', 'shifts'), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data && data.list) {
          setShiftsList(data.list);
        }
      }
    });
    const unsubNotice = onSnapshot(doc(db, 'settings', 'scheduleNotice'), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data && typeof data.updatedAt === 'number') {
          setScheduleNotice({
            message: data.message || '班表已更新',
            updatedAt: data.updatedAt
          });
        }
      }
    });
    return () => { unsubRules(); unsubShifts(); unsubNotice(); };
  }, []);

  // ── 自動計算班別調整時長 ──
  useEffect(() => {
    if (leaveType === 'shift_adj' && leaveStartTime && leaveEndTime) {
      const parseTimeToMins = (t: string) => {
        const [h, m] = t.split(':').map(Number);
        return h * 60 + m;
      };
      const start = parseTimeToMins(leaveStartTime);
      let end = parseTimeToMins(leaveEndTime);
      if (end < start) end += 24 * 60; // 跨夜
      const diffHrs = Math.round(((end - start) / 60) * 10) / 10;
      setLeaveHours(diffHrs);
    }
  }, [leaveType, leaveStartTime, leaveEndTime]);

  useEffect(() => {
    if (editLeaveType === 'shift_adj' && editLeaveStartTime && editLeaveEndTime) {
      const parseTimeToMins = (t: string) => {
        const [h, m] = t.split(':').map(Number);
        return h * 60 + m;
      };
      const start = parseTimeToMins(editLeaveStartTime);
      let end = parseTimeToMins(editLeaveEndTime);
      if (end < start) end += 24 * 60; // 跨夜
      const diffHrs = Math.round(((end - start) / 60) * 10) / 10;
      setEditLeaveHours(diffHrs);
    }
  }, [editLeaveType, editLeaveStartTime, editLeaveEndTime]);

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

  // ── 特休週年與工時計算 ──
  const specialLeavePeriods = useMemo(() => {
    if (!employeeProfile?.onboardDate) return [];

    const attByDate: { [date: string]: any[] } = {};
    allAttendance.forEach((rec: any) => {
      if (!rec.date) return;
      if (!attByDate[rec.date]) attByDate[rec.date] = [];
      attByDate[rec.date].push(rec);
    });

    const getWorkedHours = (startDateStr: string, endDateStr: string): number => {
      let totalHours = 0;
      let curr = new Date(startDateStr);
      const end = new Date(endDateStr);
      while (curr <= end) {
        const dateStr = curr.toLocaleDateString('sv');
        const dayAtt = attByDate[dateStr] || [];
        if (dayAtt.length > 0) {
          const sorted = [...dayAtt].sort((a, b) => parseTimeStrToMinutes(a.time || '') - parseTimeStrToMinutes(b.time || ''));
          const sched = mySchedules.find(s => s.date === dateStr);
          let shiftDef: any = null;
          if (sched) {
            const shiftName = (sched.shift || '').split('(')[0].trim();
            shiftDef = shiftsList.find(s => s.name === shiftName);
          }

          let dayHours = 0;
          let punchPairsCount = 0;
          let idx = 0;
          while (idx < sorted.length) {
            if (sorted[idx].type === '上班') {
              let nextOut = null;
              let nextOutIdx = -1;
              for (let j = idx + 1; j < sorted.length; j++) {
                if (sorted[j].type === '下班') {
                  nextOut = sorted[j];
                  nextOutIdx = j;
                  break;
                }
              }
              if (nextOut) {
                const inMins = parseTimeStrToMinutes(sorted[idx].time || '');
                let outMins = parseTimeStrToMinutes(nextOut.time || '');
                if (outMins < inMins) outMins += 24 * 60;
                
                let effectiveIn = inMins;
                let effectiveOut = outMins;
                if (sched) {
                  const timeMatch = (sched.shift || '').match(/\((\d{1,2}:\d{2})\s*-\s*[^)]*?(\d{1,2}:\d{2})\)/);
                  if (timeMatch) {
                    let startTimeStr = timeMatch[1];
                    let endTimeStr = timeMatch[2];

                    // 依核准的「班別調整」請假單調整班表時間
                    const dayLeaves = myLeaves.filter(l => l.startDate <= dateStr && l.endDate >= dateStr);
                    const { adjustedStart, adjustedEnd } = getAdjustedShiftTimes(startTimeStr, endTimeStr, dayLeaves);

                    const expectedInMins = parseTimeStrToMinutes(adjustedStart);
                    let expectedOutMins = parseTimeStrToMinutes(adjustedEnd);
                    if (expectedOutMins < expectedInMins) expectedOutMins += 24 * 60;

                    effectiveIn = inMins <= expectedInMins ? expectedInMins : inMins;
                    effectiveOut = outMins >= expectedOutMins ? expectedOutMins : outMins;
                  }
                }

                dayHours += Math.max(0, (effectiveOut - effectiveIn) / 60);
                punchPairsCount++;
                idx = nextOutIdx + 1;
              } else {
                idx++;
              }
            } else {
              idx++;
            }
          }

          if (dayHours > 0 && punchPairsCount === 1 && shiftDef) {
            if (shiftDef.breakStartTime && shiftDef.breakEndTime) {
              const bStart = parseTimeStrToMinutes(shiftDef.breakStartTime);
              let bEnd = parseTimeStrToMinutes(shiftDef.breakEndTime);
              if (bEnd < bStart) bEnd += 24 * 60;
              const overlap = Math.max(0, bEnd - bStart);
              dayHours = Math.max(0, dayHours - (overlap / 60));
            } else if (shiftDef.breakDuration > 0) {
              dayHours = Math.max(0, dayHours - (shiftDef.breakDuration / 60));
            }
          }
          totalHours += Math.round(dayHours * 10) / 10;
        }
        curr.setDate(curr.getDate() + 1);
      }
      return Math.round(totalHours * 10) / 10;
    };

    const approvedAnnualLeaves = myLeaves
      .filter(l => l.leaveType === 'annual' && l.status === 'approved')
      .map(l => ({
        startDate: l.startDate,
        endDate: l.endDate,
        hours: l.hours || 0
      }));

    return calculateSpecialLeavePeriods(
      employeeProfile.onboardDate,
      new Date(),
      employeeProfile.salaryType || 'monthly',
      getWorkedHours,
      approvedAnnualLeaves
    );
  }, [allAttendance, mySchedules, shiftsList, myLeaves, employeeProfile]);

  // ── 假別剩餘天數計算 ──
  const leaveBalance = useMemo(() => {
    const approvedLeaves = myLeaves.filter(l => l.status === 'approved');
    const usedDays = (type: string) =>
      approvedLeaves
        .filter(l => l.leaveType === type)
        .reduce((sum, l) => sum + (l.hours || 0) / 8, 0);

    const activePeriods = specialLeavePeriods.filter(p => p.isActive);
    const annualTotalHours = activePeriods.reduce((sum, p) => sum + p.entitledHours, 0);
    const annualRemainingHours = activePeriods.reduce((sum, p) => sum + p.remainingHours, 0);

    return {
      annual:      { 
        total: annualTotalHours / 8, 
        used: (annualTotalHours - annualRemainingHours) / 8, 
        remaining: annualRemainingHours / 8,
        totalHours: annualTotalHours,
        remainingHours: annualRemainingHours
      },
      sick:        { total: 30,          used: usedDays('sick'),         remaining: Math.max(0, 30 - usedDays('sick')) },
      personal:    { total: 14,          used: usedDays('personal'),     remaining: Math.max(0, 14 - usedDays('personal')) },
      menstrual:   { total: 3,           used: usedDays('menstrual'),    remaining: Math.max(0, 3 - usedDays('menstrual')) },
    };
  }, [myLeaves, specialLeavePeriods]);

  // ── 特休文字格式化 ──
  const formatAnnualText = (hours: number) => {
    const d = Math.floor(hours / 8);
    const h = Math.round((hours % 8) * 10) / 10;
    if (d > 0 && h > 0) return `${d}天${h}h`;
    if (d > 0) return `${d}天`;
    return `${h}小時`;
  };

  // ── 特休通知彙整 ──
  const specialLeaveNotifications = useMemo(() => {
    const list: Array<{ id: string; type: 'new' | 'expiring' | 'expired'; message: string; color: string; bg: string; border: string }> = [];
    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth();

    specialLeavePeriods.forEach(period => {
      // 1. 本月產生特休
      const start = new Date(period.startDate);
      if (start.getFullYear() === currentYear && start.getMonth() === currentMonth) {
        list.push({
          id: `new-${period.name}-${period.startDate}`,
          type: 'new',
          message: `🎉 您本月起產生新特休【${period.name}】，額度為 ${formatAnnualText(period.entitledHours)}，使用期限至 ${period.endDate}。`,
          color: '#10b981',
          bg: 'rgba(16,185,129,0.08)',
          border: '1px solid rgba(16,185,129,0.2)'
        });
      }

      // 2. 本月即將到期 / 本月已到期特休 (且有剩餘)
      const end = new Date(period.endDate);
      if (end.getFullYear() === currentYear && end.getMonth() === currentMonth) {
        const unused = Math.round((period.entitledHours - period.usedHours) * 10) / 10;
        if (unused > 0) {
          const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
          const isExpiredNow = todayStr > period.endDate;
          
          const isHourly = employeeProfile?.salaryType === 'hourly';
          const monthlySalary = employeeProfile?.monthlySalary || 32000;
          const roleAllowance = employeeProfile?.roleAllowance || 0;
          const attendanceBonus = employeeProfile?.attendanceBonus || 0;
          const evaluationAllowance = employeeProfile?.evaluationAllowance || 0;
          const monthlySalaryBasis = isHourly
            ? monthlySalary
            : (monthlySalary + roleAllowance + attendanceBonus + evaluationAllowance);

          const hourlyRate = isHourly ? monthlySalary : (monthlySalaryBasis / 240);
          const payoffMoney = Math.round(unused * hourlyRate);

          if (isExpiredNow) {
            list.push({
              id: `expired-${period.name}-${period.endDate}`,
              type: 'expired',
              message: `⏳ 您的特休【${period.name}】已於本月 (${period.endDate}) 到期，剩餘 ${formatAnnualText(unused)} 未使用（折合金額 NT$ ${payoffMoney.toLocaleString()}），已自動以特休結算併入當月薪資。`,
              color: '#6b7280',
              bg: 'rgba(107,114,128,0.08)',
              border: '1px solid rgba(107,114,128,0.2)'
            });
          } else {
            list.push({
              id: `expiring-${period.name}-${period.endDate}`,
              type: 'expiring',
              message: `⏰ 您的特休【${period.name}】將於本月 (${period.endDate}) 到期，剩餘 ${formatAnnualText(unused)} 尚未動用（折合金額 NT$ ${payoffMoney.toLocaleString()}），到期後未使用時數將以特休結算併入當月薪資。`,
              color: '#d97706',
              bg: 'rgba(217,119,6,0.08)',
              border: '1px solid rgba(217,119,6,0.2)'
            });
          }
        }
      }
    });

    return list;
  }, [specialLeavePeriods]);

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

      const shiftName = (sched.shift || '').split('(')[0].trim();
      const matchedShiftDef = shiftsList.find(s => s.name === shiftName);
      const expectsFour = matchedShiftDef ? ((matchedShiftDef.breakStartTime && matchedShiftDef.breakEndTime) || (matchedShiftDef.breakDuration > 0)) : false;

      const inRecs = dayAtt.filter(r => r.type === '上班').sort((a, b) => parseTimeStrToMinutes(a.time || '') - parseTimeStrToMinutes(b.time || ''));
      const outRecs = dayAtt.filter(r => r.type === '下班').sort((a, b) => parseTimeStrToMinutes(a.time || '') - parseTimeStrToMinutes(b.time || ''));
      const actualPunches = dayAtt.length;
      const hasApprovedOvertime = myOvertimes.some(ot => ot.date === date && ot.status === 'approved');
      const expectedPunches = (expectsFour && !hasApprovedOvertime) ? 4 : 2;

      if (actualPunches === 0) {
        list.push({ id: `absent-${date}`, date, type: '曠職', message: `當天有班表 (${sched.shift})，但無 any 打卡紀錄。`, recId: '' });
      } else if (actualPunches < expectedPunches) {
        let missingDetail = '';
        if (expectsFour) {
          missingDetail = `應打卡 4 次，實際僅打卡 ${actualPunches} 次。`;
        } else {
          missingDetail = `${inRecs.length === 0 ? '缺上班卡' : '缺下班卡'}。`;
        }
        list.push({ id: `miss-${date}`, date, type: '缺卡', message: `打卡不完整：${missingDetail}`, recId: inRecs[0]?.id || outRecs[0]?.id || '' });
      } else {
        let startTimeStr = '';
        let endTimeStr = '';
        const timeMatch = (sched.shift || '').match(/\((\d{1,2}:\d{2})\s*-\s*[^)]*?(\d{1,2}:\d{2})\)/);
        if (timeMatch) {
          startTimeStr = timeMatch[1];
          endTimeStr = timeMatch[2];
        }
        const { isLate, isEarly } = evaluatePunchesStatus(dayAtt, startTimeStr, endTimeStr, expectsFour, matchedShiftDef?.breakDuration);
        const dayStatuses = [];
        if (isLate) dayStatuses.push('遲到');
        if (isEarly) dayStatuses.push('早退');
        
        if (dayStatuses.length > 0) {
          list.push({ id: `exc-${date}`, date, type: dayStatuses.join('、'), message: `打卡時間：上班 ${inRecs.map(r => r.time).join(', ') || '-'} / 下班 ${outRecs.map(r => r.time).join(', ') || '-'} (班表: ${sched.shift})。`, recId: inRecs[0]?.id || '' });
        }
      }
    });
    return list.sort((a, b) => b.date.localeCompare(a.date));
  }, [allAttendance, mySchedules, myLeaves, myOvertimes, user, shiftsList]);

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
        const now = new Date();
        const hh = String(now.getHours()).padStart(2, '0');
        const mm = String(now.getMinutes()).padStart(2, '0');
        const timeStr = `${hh}:${mm}`;
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
            const timeMatch = (matchedSched.shift || '').match(/\((\d{1,2}:\d{2})\s*-\s*[^)]*?(\d{1,2}:\d{2})\)/);
            if (timeMatch && workDate) {
              const [yr, mo, dy] = workDate.split('-').map(Number);
              const [sh, sm] = timeMatch[1].split(':').map(Number);
              const [eh, em] = timeMatch[2].split(':').map(Number);
              const expectedIn  = new Date(yr, mo - 1, dy, sh, sm);
              let   expectedOut = new Date(yr, mo - 1, dy, eh, em);
              if (expectedOut < expectedIn) expectedOut.setDate(expectedOut.getDate() + 1);

              const shiftName = (matchedSched.shift || '').split('(')[0].trim();
              const matchedShiftDef = shiftsList.find(s => s.name === shiftName);
              const hasFixedBreak = matchedShiftDef && matchedShiftDef.breakStartTime && matchedShiftDef.breakEndTime;
              const expectsFour = matchedShiftDef ? ((matchedShiftDef.breakStartTime && matchedShiftDef.breakEndTime) || (matchedShiftDef.breakDuration > 0)) : false;

              const dateAtts = allAttendance.filter((r: any) => r.date === matchResult.workDate);
              const inCount = dateAtts.filter((r: any) => r.type === '上班').length;
              const outCount = dateAtts.filter((r: any) => r.type === '下班').length;

              let expectedBreakOut: Date | null = null;

              if (hasFixedBreak) {
                const [beh, bem] = matchedShiftDef.breakEndTime.split(':').map(Number);
                
                let bEnd = new Date(yr, mo - 1, dy, beh, bem);
                if (bEnd < expectedIn) bEnd.setDate(bEnd.getDate() + 1);
                
                expectedBreakOut = bEnd;
              }

              if (type === 'in') {
                if (inCount === 0) {
                  if (now.getTime() > expectedIn.getTime() + 60000) clockStatus = '遲到';
                } else if (inCount === 1 && expectsFour) {
                  if (hasFixedBreak && expectedBreakOut) {
                    if (now.getTime() > expectedBreakOut.getTime() + 60000) clockStatus = '遲到';
                  } else {
                    const maxBreakMin = (matchedShiftDef && matchedShiftDef.breakDuration) ? matchedShiftDef.breakDuration : 30;
                    const firstOut = dateAtts.find((r: any) => r.type === '下班');
                    if (firstOut && firstOut.time) {
                      const breakStartMin = parseTimeStrToMinutes(firstOut.time);
                      const currentMin = now.getHours() * 60 + now.getMinutes();
                      let diff = currentMin - breakStartMin;
                      if (diff < 0) diff += 24 * 60; // cross-midnight
                      if (diff > maxBreakMin) {
                        clockStatus = '遲到';
                      } else {
                        clockStatus = '正常';
                      }
                    } else {
                      clockStatus = '正常';
                    }
                  }
                } else {
                  clockStatus = '正常';
                }
              } else if (type === 'out') {
                if (expectsFour && outCount === 0) {
                  clockStatus = '正常';
                } else {
                  if (now.getTime() < expectedOut.getTime() - 60000) clockStatus = '早退';
                }
              }
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
    if (leaveEnd < leaveStart) { setLeaveMsg({ type: 'error', text: '結束日期不能小於開始日期' }); return; }

    // 檢查所選請假期間內是否有排班
    let hasAnyShift = false;
    let checkDate = new Date(leaveStart);
    const endLeaveDate = new Date(leaveEnd);
    while (checkDate <= endLeaveDate) {
      const dStr = checkDate.toLocaleDateString('sv');
      const sched = mySchedules.find(s => s.date === dStr);
      if (sched && !isOffShift(sched.shift)) {
        hasAnyShift = true;
        break;
      }
      checkDate.setDate(checkDate.getDate() + 1);
    }
    if (!hasAnyShift) {
      setLeaveMsg({ type: 'error', text: '所選的請假期間內無任何排班，無法申請請假！' });
      return;
    }

    let periodLabel = leavePeriod === 'morning' ? '上午' : leavePeriod === 'afternoon' ? '下午' : '全天';
    let computedHours = leavePeriod === 'full' ? leaveHours : 4;

    if (leaveType === 'annual') {
      if (annualLeaveUnit === 'day') {
        const diffDays = Math.round((new Date(leaveEnd).getTime() - new Date(leaveStart).getTime()) / (1000 * 60 * 60 * 24)) + 1;
        computedHours = diffDays * 8;
        periodLabel = '按天';
      } else {
        computedHours = leaveHours;
        periodLabel = '按小時';
      }
    } else if (leaveType === 'shift_adj') {
      computedHours = leaveHours;
      periodLabel = `調整 (${leaveStartTime} - ${leaveEndTime})`;
    }

    if (computedHours <= 0) {
      setLeaveMsg({ type: 'error', text: '請輸入大於 0 的請假時間' });
      return;
    }

    setLeaveSubmitting(true);
    setLeaveMsg({ type: '', text: '' });
    try {
      const docData: any = {
        employeeId: user.uid,
        empName: employeeName || user.email || '未名員工',
        leaveType,
        startDate: leaveStart,
        endDate: leaveEnd,
        leavePeriod: leaveType === 'annual' ? (annualLeaveUnit === 'day' ? 'full' : 'hour') : (leaveType === 'shift_adj' ? 'hour' : leavePeriod),
        periodLabel,
        hours: computedHours,
        reason: leaveReason,
        status: 'pending',
        timestamp: Date.now()
      };
      if (leaveType === 'shift_adj') {
        docData.startTime = leaveStartTime;
        docData.endTime = leaveEndTime;
      }
      await addDoc(collection(db, 'leaves'), docData);
      setLeaveMsg({ type: 'success', text: '請假申請已送出，等待主管審核' });
      setLeaveStart(''); setLeaveEnd(''); setLeaveReason(''); setLeaveHours(8); setLeavePeriod('full');
      setLeaveDaysInput(1);
      setLeaveStartTime(''); setLeaveEndTime('');
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
    setEditLeaveStartTime(lv.startTime || '');
    setEditLeaveEndTime(lv.endTime || '');

    const isAnnual = lv.leaveType === 'annual';
    if (isAnnual) {
      const unit = (lv.periodLabel === '按小時' || lv.leavePeriod === 'hour' || (Number(lv.hours) % 8 !== 0)) ? 'hour' : 'day';
      setEditAnnualLeaveUnit(unit);
      if (unit === 'day') {
        setEditLeaveDaysInput(Math.round(Number(lv.hours) / 8));
      }
    }
    setShowEditLeaveModal(true);
  };

  const handleUpdateLeave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editLeaveEnd < editLeaveStart) {
      alert('結束日期不能小於開始日期');
      return;
    }

    // 檢查修改的請假期間內是否有排班
    let hasAnyShift = false;
    let checkDate = new Date(editLeaveStart);
    const endLeaveDate = new Date(editLeaveEnd);
    while (checkDate <= endLeaveDate) {
      const dStr = checkDate.toLocaleDateString('sv');
      const sched = mySchedules.find(s => s.date === dStr);
      if (sched && !isOffShift(sched.shift)) {
        hasAnyShift = true;
        break;
      }
      checkDate.setDate(checkDate.getDate() + 1);
    }
    if (!hasAnyShift) {
      alert('所選的請假期間內無任何排班，無法修改為該請假日期！');
      return;
    }
    try {
      let finalHours = editLeavePeriod === 'full' ? Number(editLeaveHours) : 4;
      let periodLbl = editLeavePeriod === 'full' ? '全天' : editLeavePeriod === 'morning' ? '上半天' : '下半天';
      let finalPeriod = editLeavePeriod;

      if (editLeaveType === 'annual') {
        if (editAnnualLeaveUnit === 'day') {
          const diffDays = Math.round((new Date(editLeaveEnd).getTime() - new Date(editLeaveStart).getTime()) / (1000 * 60 * 60 * 24)) + 1;
          finalHours = diffDays * 8;
          periodLbl = '按天';
          finalPeriod = 'full';
        } else {
          finalHours = Number(editLeaveHours);
          periodLbl = '按小時';
          finalPeriod = 'hour';
        }
      } else if (editLeaveType === 'shift_adj') {
        finalHours = Number(editLeaveHours);
        periodLbl = `調整 (${editLeaveStartTime} - ${editLeaveEndTime})`;
        finalPeriod = 'hour';
      }

      if (finalHours <= 0) {
        alert('請輸入大於 0 的請假時間');
        return;
      }

      const updateData: any = {
        leaveType: editLeaveType,
        startDate: editLeaveStart,
        endDate: editLeaveEnd,
        leavePeriod: finalPeriod,
        periodLabel: periodLbl,
        hours: finalHours,
        reason: editLeaveReason
      };

      if (editLeaveType === 'shift_adj') {
        updateData.startTime = editLeaveStartTime;
        updateData.endTime = editLeaveEndTime;
      }

      await updateDoc(doc(db, 'leaves', editLeaveId), updateData);
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
      // 1. 取得當天及隔天打卡紀錄 (因可能跨夜下班)
      const nextDayStr = (() => {
        const d = new Date(otDate);
        d.setDate(d.getDate() + 1);
        return d.toLocaleDateString('sv');
      })();
      const relevantPunches = allAttendance.filter((rec: any) => 
        (rec.date === otDate || rec.date === nextDayStr) && rec.time && (rec.type === '上班' || rec.type === '下班')
      );

      if (relevantPunches.length === 0) {
        setOtMsg({ type: 'error', text: '所選期間內無任何打卡紀錄，無法申請加班！' });
        setOtSubmitting(false);
        return;
      }

      // 2. 按時間先後排序
      const sortedPunches = [...relevantPunches].sort((a, b) => {
        const dtA = new Date(`${a.date}T${a.time}`).getTime();
        const dtB = new Date(`${b.date}T${b.time}`).getTime();
        return dtA - dtB;
      });

      // 3. 配對出所有的工作區間
      const workIntervals: { start: Date; end: Date }[] = [];
      let pIdx = 0;
      while (pIdx < sortedPunches.length) {
        if (sortedPunches[pIdx].type === '上班') {
          let nextOut = null;
          let nextOutIdx = -1;
          for (let j = pIdx + 1; j < sortedPunches.length; j++) {
            if (sortedPunches[j].type === '下班') {
              nextOut = sortedPunches[j];
              nextOutIdx = j;
              break;
            }
          }
          if (nextOut) {
            const startDt = new Date(`${sortedPunches[pIdx].date}T${sortedPunches[pIdx].time}`);
            const endDt = new Date(`${nextOut.date}T${nextOut.time}`);
            workIntervals.push({ start: startDt, end: endDt });
            pIdx = nextOutIdx + 1;
          } else {
            pIdx++;
          }
        } else {
          pIdx++;
        }
      }

      if (workIntervals.length === 0) {
        setOtMsg({ type: 'error', text: '您在該期間沒有任何完整的「上班-下班」打卡區間，無法申請加班！' });
        setOtSubmitting(false);
        return;
      }

      // 4. 建立加班起迄時間的 Date 物件
      const otStartDt = new Date(`${otDate}T${otStartTime}`);
      let otEndDt = new Date(`${otDate}T${otEndTime}`);
      if (otEndDt < otStartDt) {
        // 跨夜
        otEndDt.setDate(otEndDt.getDate() + 1);
      }

      // 5. 判斷加班區間是否完全包含在某一個工作區間內
      const isWithinClocked = workIntervals.some(interval => {
        return interval.start <= otStartDt && interval.end >= otEndDt;
      });

      if (!isWithinClocked) {
        // 尋找當天的有效打卡區間以提供友善提示
        const sameDayIntervals = workIntervals.filter(interval => {
          return interval.start.toLocaleDateString('sv') === otDate;
        });
        
        let errorText = '';
        if (sameDayIntervals.length > 0) {
          const rangeStr = sameDayIntervals.map(i => {
            const sh = String(i.start.getHours()).padStart(2, '0');
            const sm = String(i.start.getMinutes()).padStart(2, '0');
            const eh = String(i.end.getHours()).padStart(2, '0');
            const em = String(i.end.getMinutes()).padStart(2, '0');
            const isCross = i.end.toLocaleDateString('sv') !== i.start.toLocaleDateString('sv');
            return `${sh}:${sm} ~ ${isCross ? '隔日' : ''}${eh}:${em}`;
          }).join('、');
          errorText = `加班時段 (${otStartTime} ~ ${otEndTime}) 必須完全在您當天實際打卡工作時段 (${rangeStr}) 之內！`;
        } else {
          errorText = `當天無對應的上班與下班打卡紀錄，或者加班時段 (${otStartTime} ~ ${otEndTime}) 不在打卡工作時間內！`;
        }
        setOtMsg({ type: 'error', text: errorText });
        setOtSubmitting(false);
        return;
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
  const leaveTypeLabel = (type: string) => {
    const allTypes = [...LEAVE_TYPES, { value: 'shift_adj', label: '班別調整' }];
    return allTypes.find(l => l.value === type)?.label || type;
  };

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
        {activeSubTab === 'clock' && (() => {
          const todayStrLocal = new Date().toLocaleDateString('sv');
          const todaySched = mySchedules.find(s => s.date === todayStrLocal && !isOffShift(s.shift));
          const hasStationOrInstruction = todaySched && (todaySched.station || todaySched.stationInstruction);

          return (
          <div className="tab-panel">
            {/* 班表更新通知 */}
            {user && scheduleNotice && scheduleNotice.updatedAt > lastNoticeSeen && (
              <div style={{
                background: 'rgba(217,119,6,0.1)',
                border: '1px solid rgba(217,119,6,0.3)',
                borderRadius: '12px',
                padding: '12px 16px',
                marginBottom: '16px',
                textAlign: 'left',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                color: '#b45309',
                fontSize: '13px',
                fontWeight: '600'
              }}>
                <span style={{ fontSize: '16px' }}>📅</span>
                <div style={{ flex: 1, lineHeight: '1.4' }}>{scheduleNotice.message}</div>
                <button
                  onClick={() => {
                    localStorage.setItem(`lastScheduleNoticeSeen_${user.uid}`, String(scheduleNotice.updatedAt));
                    setLastNoticeSeen(scheduleNotice.updatedAt);
                  }}
                  style={{
                    fontSize: '11px',
                    color: '#fff',
                    backgroundColor: '#d97706',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '5px 10px',
                    cursor: 'pointer',
                    fontWeight: '700',
                    whiteSpace: 'nowrap'
                  }}
                >
                  已確認
                </button>
              </div>
            )}

            {/* 今日任務卡片 */}
            {hasStationOrInstruction && (
              <div style={{ background: 'linear-gradient(135deg, #f5f3ff 0%, #e0e7ff 100%)', border: '1px solid rgba(99, 102, 241, 0.2)', borderRadius: '12px', padding: '16px', marginBottom: '16px', textAlign: 'left', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--primary)', fontWeight: '800', fontSize: '15px', marginBottom: '8px' }}>
                  <span>📋 今日崗位任務</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {todaySched.station && (
                    <div style={{ fontSize: '14px', color: '#374151', fontWeight: '700' }}>
                      📍 負責崗位：<span style={{ color: '#4f46e5', backgroundColor: '#e0e7ff', padding: '2px 8px', borderRadius: '6px' }}>{todaySched.station}</span>
                    </div>
                  )}
                  {todaySched.stationInstruction && (
                    <div style={{ fontSize: '13px', color: '#4b5563', backgroundColor: '#ffffff', padding: '10px', borderRadius: '8px', border: '1px solid #e5e7eb', marginTop: '4px', whiteSpace: 'pre-wrap', lineHeight: '1.5' }}>
                      <div style={{ fontWeight: '700', marginBottom: '4px', color: '#6b7280', fontSize: '12px' }}>📝 主管指示：</div>
                      {todaySched.stationInstruction}
                    </div>
                  )}
                </div>
>>>>>>> origin/weekly-shift-station-assignment
              </div>
            )}

            {/* 特休產生與過期通知 */}
            {specialLeaveNotifications.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
                {specialLeaveNotifications.map((notif) => (
                  <div key={notif.id} style={{ background: notif.bg, border: notif.border, borderRadius: '12px', padding: '12px 16px', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '8px', color: notif.color, fontSize: '13px', fontWeight: '500' }}>
                    <div style={{ flex: 1, lineHeight: '1.4' }}>{notif.message}</div>
                    {(notif.type === 'new' || notif.type === 'expiring') && (
                      <button onClick={() => { setActiveSubTab('apply'); setApplySubTab('leave'); }}
                        style={{ fontSize: '11px', color: '#fff', backgroundColor: 'var(--primary)', border: 'none', borderRadius: '6px', padding: '5px 10px', cursor: 'pointer', fontWeight: '700', whiteSpace: 'nowrap' }}>
                        立即請假
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

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
          );
        })()}

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
                  const isToday   = dateStr === todayStr;
                  const isFuture  = dateStr > todayStr;
                  const dow = new Date(dateStr).getDay();
                  const hasLeave  = myLeaves.some(l => l.startDate <= dateStr && l.endDate >= dateStr && l.status === 'approved');
                  
                  const shiftName = sched ? (sched.shift || '').split('(')[0].trim() : '';
                  const matchedShiftDef = shiftsList.find(s => s.name === shiftName);
                  const expectsFour = matchedShiftDef ? ((matchedShiftDef.breakStartTime && matchedShiftDef.breakEndTime) || (matchedShiftDef.breakDuration > 0)) : false;
                  const hasApprovedOvertime = myOvertimes.some(ot => ot.date === dateStr && ot.status === 'approved');
                  const expectedPunches = (expectsFour && !hasApprovedOvertime) ? 4 : 2;

                  const isOff = sched ? isOffShift(sched.shift) : false;
                  const isException = sched && !isOff && !isFuture && !hasLeave && (dayAtts.length < expectedPunches);
                  const shiftShort = sched ? (sched.shift || '').replace(/\s*\(.*?\)/, '').slice(0, 4) : '';
                  const shiftTime  = sched ? ((sched.shift || '').match(/\((.+?)\)/) || [])[1] || '' : '';

                  return (
                    <div key={dateStr} style={{
                      minHeight: '68px', borderRadius: '8px', padding: '5px 4px',
                      backgroundColor: isToday ? 'rgba(79,70,229,0.08)' : isOff ? '#f9fafb' : sched ? 'rgba(16,185,129,0.05)' : '#fafafa',
                      border: isToday ? '2px solid var(--primary)'
                        : isException ? '1px solid rgba(239,68,68,0.35)'
                        : isOff ? '1px solid #e5e7eb'
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
                        isOff ? (
                          <div style={{
                            fontSize: '9px', fontWeight: '700',
                            color: sched.shift === '休假' ? '#d97706' : sched.shift === '國定假日' ? '#7c3aed' : '#ef4444',
                            backgroundColor: sched.shift === '休假' ? '#fef3c7' : sched.shift === '國定假日' ? '#f3e8ff' : '#fee2e2',
                            borderRadius: '12px', padding: '1px 5px', whiteSpace: 'nowrap',
                            maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis',
                            border: `1px solid ${sched.shift === '休假' ? '#fde68a' : sched.shift === '國定假日' ? '#e9d5ff' : '#fecdd3'}`
                          }}>
                            {sched.shift === '例假' ? '例' : sched.shift === '休假' ? '休' : sched.shift === '國定假日' ? '國' : sched.shift.slice(0, 1)}
                          </div>
                        ) : (
                          <>
                            <div style={{ fontSize: '10px', fontWeight: '700', color: '#fff', backgroundColor: '#10b981',
                              borderRadius: '4px', padding: '1px 5px', whiteSpace: 'nowrap',
                              maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis' }}>{shiftShort}</div>
                            {sched.station && (
                              <div style={{ fontSize: '9px', fontWeight: '800', color: '#4f46e5', backgroundColor: '#e0e7ff', borderRadius: '4px', padding: '1px 4px', whiteSpace: 'nowrap', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: '2px' }}>
                                {sched.station}
                              </div>
                            )}
                            {sched.stationInstruction && (
                              <div 
                                onClick={(e) => { e.stopPropagation(); setViewingInstruction({ date: dateStr, station: sched.station || '未指定崗位', text: sched.stationInstruction }); }} 
                                style={{ fontSize: '12px', cursor: 'pointer', marginTop: '1px' }} 
                                title="點擊查看工作指示"
                              >
                                📝
                              </div>
                            )}
                            {shiftTime && !sched.stationInstruction && (
                              <div style={{ fontSize: '8px', color: '#6b7280', lineHeight: 1.3, textAlign: 'center', wordBreak: 'break-all', marginTop: '1px' }}>{shiftTime}</div>
                            )}
                          </>
                        )
                      )}

                      {/* 請假標示 */}
                      {hasLeave && (
                        <div style={{ fontSize: '9px', color: '#d97706', fontWeight: '700',
                          backgroundColor: 'rgba(245,158,11,0.12)', borderRadius: '3px', padding: '1px 5px' }}>假</div>
                      )}

                      {/* 打卡狀態圓點 */}
                      {sched && !isOff && !isFuture && !hasLeave && (
                        <div style={{ display: 'flex', gap: '3px', marginTop: '2px' }}>
                          {dayAtts.map((att: any, attIdx: number) => (
                            <div key={attIdx} title={`${att.type} (${att.time})`} style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#10b981' }} />
                          ))}
                          {Array.from({ length: Math.max(0, expectedPunches - dayAtts.length) }).map((_, missingIdx) => (
                            <div key={`m-${missingIdx}`} title="缺卡" style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#ef4444' }} />
                          ))}
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
                <span>⚠️ 缺卡/曠職</span>
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
                          <td style={{ color: '#10b981' }}>+NT$ {((pay.attendanceBonus || 0) + (pay.otherAllowance || 0)).toLocaleString()}</td>
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
                const bal = leaveBalance[item.key as keyof typeof leaveBalance] as any;
                const isAnnual = item.key === 'annual';
                const remainingText = isAnnual ? formatAnnualText(bal.remainingHours) : `${bal.remaining}天`;
                const totalText = isAnnual ? formatAnnualText(bal.totalHours) : `${bal.total}天`;

                return (
                  <div key={item.key} style={{ background: `rgba(${item.color === '#4f46e5' ? '79,70,229' : item.color === '#059669' ? '5,150,105' : item.color === '#d97706' ? '217,119,6' : '219,39,119'},0.06)`, border: `1px solid rgba(${item.color === '#4f46e5' ? '79,70,229' : item.color === '#059669' ? '5,150,105' : item.color === '#d97706' ? '217,119,6' : '219,39,119'},0.15)`, borderRadius: '10px', padding: '10px', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', minHeight: '82px' }}>
                    <div style={{ fontSize: '16px', marginBottom: '2px' }}>{item.icon}</div>
                    <div style={{ fontSize: '10px', color: '#6b7280', marginBottom: '2px' }}>{item.label}</div>
                    <div style={{ fontSize: '13px', fontWeight: '800', color: item.color, whiteSpace: 'nowrap' }}>{remainingText}</div>
                    <div style={{ fontSize: '9px', color: '#9ca3af', whiteSpace: 'nowrap' }}>/ {totalText}</div>
                  </div>
                );
              })}
            </div>

            {/* 特休年度明細 */}
            {specialLeavePeriods.length > 0 && (
              <div style={{ background: '#f9fafb', borderRadius: '10px', padding: '12px', border: '1px solid #e5e7eb', marginBottom: '16px', fontSize: '11px', textAlign: 'left' }}>
                <div style={{ fontWeight: '700', color: 'var(--text-main)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span>📅</span> 特休效期與額度明細（到職日：{employeeProfile?.onboardDate || '未設定'}，{employeeProfile?.salaryType === 'hourly' ? '時薪工讀' : '月薪制'}）
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid #e5e7eb', color: '#6b7280' }}>
                        <th style={{ padding: '6px 4px' }}>項目</th>
                        <th style={{ padding: '6px 4px' }}>起訖期間</th>
                        <th style={{ padding: '6px 4px' }}>額度</th>
                        <th style={{ padding: '6px 4px' }}>已用</th>
                        <th style={{ padding: '6px 4px' }}>剩餘</th>
                        <th style={{ padding: '6px 4px' }}>狀態</th>
                      </tr>
                    </thead>
                    <tbody>
                      {specialLeavePeriods.map((period, idx) => {
                        const isExpiringThisMonth = (() => {
                          if (!period.endDate) return false;
                          const today = new Date();
                          const todayYm = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
                          return period.endDate.startsWith(todayYm);
                        })();

                        const isNewThisMonth = (() => {
                          if (!period.startDate) return false;
                          const today = new Date();
                          const todayYm = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
                          return period.startDate.startsWith(todayYm);
                        })();

                        let statusBadge = null;
                        if (period.isExpired) {
                          statusBadge = <span style={{ padding: '2px 6px', borderRadius: '4px', fontSize: '9px', backgroundColor: '#f3f4f6', color: '#9ca3af' }}>已失效</span>;
                        } else if (!period.isActive) {
                          statusBadge = <span style={{ padding: '2px 6px', borderRadius: '4px', fontSize: '9px', backgroundColor: '#e0e7ff', color: '#4f46e5' }}>未開始</span>;
                        } else {
                          statusBadge = <span style={{ padding: '2px 6px', borderRadius: '4px', fontSize: '9px', backgroundColor: '#d1fae5', color: '#065f46', fontWeight: 'bold' }}>使用中</span>;
                        }

                        return (
                          <tr key={idx} style={{ borderBottom: idx === specialLeavePeriods.length - 1 ? 'none' : '1px solid #f3f4f6' }}>
                            <td style={{ padding: '6px 4px', fontWeight: '600' }}>{period.name}</td>
                            <td style={{ padding: '6px 4px', color: '#4b5563' }}>
                              {period.startDate} ～ {period.endDate}
                              {isExpiringThisMonth && <span style={{ color: '#ef4444', fontSize: '9px', marginLeft: '4px', fontWeight: 'bold' }}>(本月到期)</span>}
                              {isNewThisMonth && <span style={{ color: '#10b981', fontSize: '9px', marginLeft: '4px', fontWeight: 'bold' }}>(本月新增)</span>}
                            </td>
                            <td style={{ padding: '6px 4px' }}>{formatAnnualText(period.entitledHours)}</td>
                            <td style={{ padding: '6px 4px', color: '#9ca3af' }}>{period.usedHours > 0 ? `${period.usedHours}h` : '0'}</td>
                            <td style={{ padding: '6px 4px', fontWeight: '700', color: period.remainingHours > 0 && !period.isExpired ? 'var(--primary)' : '#9ca3af' }}>
                              {period.isExpired ? '0' : formatAnnualText(period.remainingHours)}
                            </td>
                            <td style={{ padding: '6px 4px' }}>{statusBadge}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div style={{ marginTop: '8px', fontSize: '10px', color: '#6b7280', lineHeight: '1.4' }}>
                  ※ 特休無法跨期累計，到期未使用完畢自動失效。工讀特休依勞基法規定比例折算核給。
                </div>
              </div>
            )}

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
                          {(employeeProfile?.salaryType === 'hourly'
                            ? [...LEAVE_TYPES, { value: 'shift_adj', label: '班別調整' }]
                            : LEAVE_TYPES
                          ).map(lt => <option key={lt.value} value={lt.value}>{lt.label}</option>)}
                        </select>
                      </div>
                      {leaveType === 'annual' ? (
                        <>
                          <div>
                            <label style={labelStyle}>請假單位</label>
                            <select value={annualLeaveUnit} onChange={e => setAnnualLeaveUnit(e.target.value as 'day' | 'hour')} style={inputStyle}>
                              <option value="day">按天 (8 小時/天)</option>
                              <option value="hour">按小時</option>
                            </select>
                          </div>
                          {annualLeaveUnit === 'day' ? (
                            <div>
                              <label style={labelStyle}>請假天數</label>
                              <input type="number" min={1} max={30} value={leaveDaysInput} onChange={e => setLeaveDaysInput(Number(e.target.value))} style={inputStyle} />
                            </div>
                          ) : (
                            <div>
                              <label style={labelStyle}>請假時數 (小時)</label>
                              <input type="number" min={0.5} step={0.5} max={240} value={leaveHours} onChange={e => setLeaveHours(Number(e.target.value))} style={inputStyle} />
                            </div>
                          )}
                        </>
                      ) : leaveType === 'shift_adj' ? (
                        <>
                          <div>
                            <label style={labelStyle}>請假開始時間</label>
                            <input type="time" required value={leaveStartTime} onChange={e => setLeaveStartTime(e.target.value)} style={inputStyle} />
                          </div>
                          <div>
                            <label style={labelStyle}>請假結束時間</label>
                            <input type="time" required value={leaveEndTime} onChange={e => setLeaveEndTime(e.target.value)} style={inputStyle} />
                          </div>
                          <div>
                            <label style={labelStyle}>請假時數 (根據時間自動計算)</label>
                            <input type="number" disabled value={leaveHours} style={{ ...inputStyle, backgroundColor: '#f3f4f6', cursor: 'not-allowed' }} />
                          </div>
                        </>
                      ) : (
                        <>
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
                        </>
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
      {selectedSlip && (() => {
        const baseSalary = selectedSlip.baseSalary || 0;
        const roleAllowance = selectedSlip.roleAllowance || 0;
        const evaluationAllowance = selectedSlip.evaluationAllowance || 0;
        const baseSalaryTotal = baseSalary + roleAllowance + evaluationAllowance;

        const attendanceBonus = selectedSlip.attendanceBonus || 0;
        const overtime = selectedSlip.overtime || 0;
        const adminBonus = selectedSlip.adminBonus || 0;
        const otherAllowance = selectedSlip.otherAllowance || 0;
        const annualLeavePayoff = selectedSlip.annualLeavePayoff || 0;
        const retroactivePay = selectedSlip.retroactivePay || 0;
        const otherAdditionsTotal = attendanceBonus + overtime + adminBonus + otherAllowance + annualLeavePayoff + retroactivePay;

        const lateMinutes = selectedSlip.lateMinutes || 0;
        const lateDeduction = selectedSlip.lateDeduction || 0;
        const weekdayOvertime = selectedSlip.weekdayOvertime || 0;
        const restDayOvertime = selectedSlip.restDayOvertime || 0;
        const holidayOvertime = selectedSlip.holidayOvertime || 0;
        const leaveHours = selectedSlip.leaveHours || 0;
        const leaveDeduction = selectedSlip.leaveDeduction || 0;
        const missedPunches = selectedSlip.missedPunches || 0;

        const withholdingTax = selectedSlip.withholdingTax || 0;
        const employeeLabor = selectedSlip.employeeLabor || 0;
        const employeeNhi = selectedSlip.employeeNhi || 0;
        const insuranceAdjustment = selectedSlip.insuranceAdjustment || 0;
        const otherDeductions = selectedSlip.otherDeductions || 0;
        const pensionVoluntary = selectedSlip.pensionVoluntary || 0;
        const withholdingsTotal = withholdingTax + employeeLabor + employeeNhi + insuranceAdjustment + otherDeductions + pensionVoluntary;

        const grossPay = baseSalaryTotal + otherAdditionsTotal;
        const totalDeductions = withholdingsTotal + lateDeduction + leaveDeduction;
        const netPay = grossPay - totalDeductions;

        const monthParts = (selectedSlip.month || '').split('-');
        const yearStr = monthParts[0] || '';
        const monthStr = monthParts[1] || '';

        return (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(8px)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}
            onClick={() => setSelectedSlip(null)}>
            <div style={{
              backgroundColor: '#fff',
              border: '2px solid #000',
              borderRadius: '8px',
              padding: '32px',
              maxWidth: '750px',
              width: '100%',
              boxShadow: '0 25px 50px -12px rgba(0,0,0,0.3)',
              color: '#000',
              position: 'relative',
              maxHeight: '90vh',
              overflowY: 'auto',
              fontFamily: '"Courier New", Courier, monospace, "Noto Sans TC", sans-serif'
            }} onClick={e => e.stopPropagation()}>
              
              {/* Close Button */}
              <button onClick={() => setSelectedSlip(null)} style={{ position: 'absolute', right: '16px', top: '16px', background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', color: '#000', fontWeight: 'bold' }}>×</button>

              {/* Header */}
              <div style={{ textAlign: 'center', marginBottom: '20px' }}>
                <div style={{ fontSize: '22px', fontWeight: 'bold', letterSpacing: '4px', marginBottom: '8px' }}>態度甜點企業社</div>
                <div style={{ fontSize: '16px', fontWeight: '600', color: '#333' }}>{yearStr ? `${yearStr} 年 ${monthStr} 月` : ''} 薪資單</div>
              </div>

              {/* Employee info */}
              <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '20px', fontSize: '14px', padding: '0 8px' }}>
                <div style={{ flex: '1 1 45%' }}><strong>姓名：</strong>{selectedSlip.empName || employeeProfile?.name}</div>
                <div style={{ flex: '1 1 45%' }}><strong>到職日：</strong>{selectedSlip.onboardDate || employeeProfile?.onboardDate || 'N/A'}</div>
                <div style={{ flex: '1 1 100%' }}><strong>職位：</strong>{selectedSlip.empRole || employeeProfile?.role || '正職員工'}</div>
              </div>

              {/* Inner Border Box */}
              <div style={{ border: '2px solid #000', padding: '24px', display: 'flex', flexDirection: 'column' }}>
                
                {/* Columns layout */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px', borderBottom: '2px solid #000', paddingBottom: '20px' }}>
                  
                  {/* Left Column: 基本薪資 & 其他加項 */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                    
                    {/* 基本薪資 */}
                    <div>
                      <div style={{ fontWeight: 'bold', borderBottom: '1px solid #000', paddingBottom: '4px', marginBottom: '8px', fontSize: '14px' }}>
                        基本薪資
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', paddingLeft: '8px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                          <span>基本底薪</span>
                          <span>NT$ {baseSalary.toLocaleString()}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                          <span>職位加給</span>
                          <span>NT$ {roleAllowance.toLocaleString()}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                          <span>考核加給</span>
                          <span>NT$ {evaluationAllowance.toLocaleString()}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', fontWeight: 'bold', borderTop: '1px dashed #ccc', paddingTop: '4px', marginTop: '2px' }}>
                          <span>合計</span>
                          <span>NT$ {baseSalaryTotal.toLocaleString()}</span>
                        </div>
                      </div>
                    </div>

                    {/* 其他加項 */}
                    <div>
                      <div style={{ fontWeight: 'bold', borderBottom: '1px solid #000', paddingBottom: '4px', marginBottom: '8px', fontSize: '14px' }}>
                        其他加項
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', paddingLeft: '8px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                          <span>全勤獎金{selectedSlip.attendanceBonusNote && <span style={{ fontSize: '10px', color: '#dc2626' }}>({selectedSlip.attendanceBonusNote})</span>}</span>
                          <span>NT$ {attendanceBonus.toLocaleString()}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                          <span>加班費</span>
                          <span>NT$ {overtime.toLocaleString()}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                          <span>行政獎金</span>
                          <span>NT$ {adminBonus.toLocaleString()}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                          <span>其他補貼</span>
                          <span>NT$ {otherAllowance.toLocaleString()}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                          <span>特休結算</span>
                          <span>NT$ {annualLeavePayoff.toLocaleString()}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                          <span>上月補發</span>
                          <span>NT$ {retroactivePay.toLocaleString()}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', fontWeight: 'bold', borderTop: '1px dashed #ccc', paddingTop: '4px', marginTop: '2px' }}>
                          <span>合計</span>
                          <span>NT$ {otherAdditionsTotal.toLocaleString()}</span>
                        </div>
                      </div>
                    </div>

                  </div>

                  {/* Right Column: 考勤相關 & 代扣項目 */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                    
                    {/* 考勤相關 */}
                    <div>
                      <div style={{ fontWeight: 'bold', borderBottom: '1px solid #000', paddingBottom: '4px', marginBottom: '8px', fontSize: '14px' }}>
                        考勤相關
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', paddingLeft: '8px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                          <span>遲到時數（分鐘）</span>
                          <span>{lateMinutes} 分鐘</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#dc2626' }}>
                          <span>遲到扣款</span>
                          <span>-NT$ {lateDeduction.toLocaleString()}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                          <span>平日加班時數</span>
                          <span>{weekdayOvertime} 小時</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                          <span>休息日加班時數</span>
                          <span>{restDayOvertime} 小時</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                          <span>節日加班時數</span>
                          <span>{holidayOvertime} 小時</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                          <span>請假/曠職/早退時數</span>
                          <span>{leaveHours} 小時</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#dc2626' }}>
                          <span>請假/曠職/早退扣款</span>
                          <span>-NT$ {leaveDeduction.toLocaleString()}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                          <span>未打卡次數</span>
                          <span>{missedPunches} 次</span>
                        </div>
                      </div>
                    </div>

                    {/* 代扣項目 */}
                    <div>
                      <div style={{ fontWeight: 'bold', borderBottom: '1px solid #000', paddingBottom: '4px', marginBottom: '8px', fontSize: '14px' }}>
                        代扣項目
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', paddingLeft: '8px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#dc2626' }}>
                          <span>代扣所得稅</span>
                          <span>-NT$ {withholdingTax.toLocaleString()}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#dc2626' }}>
                          <span>勞保自付額</span>
                          <span>-NT$ {employeeLabor.toLocaleString()}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#dc2626' }}>
                          <span>健保自付額</span>
                          <span>-NT$ {employeeNhi.toLocaleString()}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#dc2626' }}>
                          <span>保費調整</span>
                          <span>-NT$ {insuranceAdjustment.toLocaleString()}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#dc2626' }}>
                          <span>其他扣款</span>
                          <span>-NT$ {otherDeductions.toLocaleString()}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#dc2626' }}>
                          <span>勞退自提</span>
                          <span>-NT$ {pensionVoluntary.toLocaleString()}</span>
                        </div>
                      </div>
                    </div>

                  </div>

                </div>

                {/* Bottom Summaries inside the Inner Box */}
                <div style={{ paddingTop: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                    <div style={{ fontSize: '14px', fontWeight: 'bold' }}>應發小記：NT$ {grossPay.toLocaleString()}</div>
                    <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#dc2626' }}>應扣小記：-NT$ {totalDeductions.toLocaleString()}</div>
                  </div>
                  <div style={{ display: 'flex', fontSize: '18px', fontWeight: '900', color: '#000' }}>
                    <span>實發金額：NT$ {netPay.toLocaleString()}</span>
                  </div>
                </div>

              </div>

            </div>
          </div>
        );
      })()}

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
                  {(employeeProfile?.salaryType === 'hourly'
                    ? [...LEAVE_TYPES, { value: 'shift_adj', label: '班別調整' }]
                    : LEAVE_TYPES
                  ).map(lt => (
                    <option key={lt.value} value={lt.value}>{lt.label}</option>
                  ))}
                </select>
              </div>

              {editLeaveType === 'annual' ? (
                <>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '13px', fontWeight: '600' }}>請假單位</label>
                    <select 
                      value={editAnnualLeaveUnit} 
                      onChange={(e) => setEditAnnualLeaveUnit(e.target.value as 'day' | 'hour')}
                      style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px', backgroundColor: '#fff' }}
                    >
                      <option value="day">按天 (8 小時/天)</option>
                      <option value="hour">按小時</option>
                    </select>
                  </div>
                  {editAnnualLeaveUnit === 'day' ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <label style={{ fontSize: '13px', fontWeight: '600' }}>請假天數</label>
                      <input 
                        type="number" 
                        min={1} 
                        max={30} 
                        value={editLeaveDaysInput} 
                        onChange={(e) => setEditLeaveDaysInput(Number(e.target.value))} 
                        style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px' }}
                      />
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <label style={{ fontSize: '13px', fontWeight: '600' }}>請假時數 (小時)</label>
                      <input 
                        type="number" 
                        min={0.5} 
                        step={0.5}
                        max={240} 
                        value={editLeaveHours} 
                        onChange={(e) => setEditLeaveHours(Number(e.target.value))} 
                        style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px' }}
                      />
                    </div>
                  )}
                </>
              ) : editLeaveType === 'shift_adj' ? (
                <>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '13px', fontWeight: '600' }}>請假開始時間</label>
                    <input 
                      type="time" 
                      required 
                      value={editLeaveStartTime} 
                      onChange={(e) => setEditLeaveStartTime(e.target.value)} 
                      style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px' }}
                    />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '13px', fontWeight: '600' }}>請假結束時間</label>
                    <input 
                      type="time" 
                      required 
                      value={editLeaveEndTime} 
                      onChange={(e) => setEditLeaveEndTime(e.target.value)} 
                      style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px' }}
                    />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '13px', fontWeight: '600' }}>請假時數 (根據時間自動計算)</label>
                    <input 
                      type="number" 
                      disabled 
                      value={editLeaveHours} 
                      style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px', backgroundColor: '#f3f4f6', cursor: 'not-allowed' }}
                    />
                  </div>
                </>
              ) : (
                <>
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
                </>
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

      {/* 工作指示 Modal */}
      {viewingInstruction && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0, 0, 0, 0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1001, padding: '20px' }}>
          <div className="glass-card fade-in" style={{ width: '100%', maxWidth: '400px', padding: '24px', borderRadius: '16px', backgroundColor: '#ffffff', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h4 style={{ margin: 0, color: 'var(--primary)', fontSize: '18px', fontWeight: '800' }}>📋 任務指示</h4>
              <button onClick={() => setViewingInstruction(null)} style={{ border: 'none', background: 'none', fontSize: '20px', cursor: 'pointer', color: '#9ca3af' }}>×</button>
            </div>
            <div style={{ marginBottom: '12px', fontSize: '14px', color: '#4b5563', fontWeight: '600' }}>
              日期：{viewingInstruction.date}
            </div>
            <div style={{ marginBottom: '16px', fontSize: '14px', color: '#4b5563', fontWeight: '600' }}>
              崗位：<span style={{ color: '#4f46e5', backgroundColor: '#e0e7ff', padding: '2px 8px', borderRadius: '6px' }}>{viewingInstruction.station}</span>
            </div>
            <div style={{ fontSize: '14px', color: '#374151', backgroundColor: '#f9fafb', padding: '16px', borderRadius: '8px', border: '1px solid #e5e7eb', whiteSpace: 'pre-wrap', lineHeight: '1.6' }}>
              {viewingInstruction.text}
            </div>
            <button onClick={() => setViewingInstruction(null)} style={{ width: '100%', marginTop: '20px', padding: '12px', borderRadius: '8px', border: 'none', backgroundColor: 'var(--primary)', color: '#fff', fontWeight: '700', fontSize: '15px', cursor: 'pointer' }}>
              我知道了
            </button>
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
