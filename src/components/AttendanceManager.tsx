import React, { useState, useMemo } from 'react';
import { useAdminData } from '../context/AdminDataContext';
import { parseTimeStrToMinutes, isOffShift, evaluatePunchesStatus, getAdjustedShiftTimes } from '../utils/taiwanHrEngine';

const AttendanceManager: React.FC = () => {
  const {
    employees,
    attendance,
    schedules,
    shifts,
    leaves,
    overtimeReqs,
    addAttendanceRecord,
    updateAttendanceRecord,
    deleteAttendanceRecord
  } = useAdminData();

  // Sub Tab selection
  const [subTab, setSubTab] = useState<'summary' | 'exceptions' | 'records'>('summary');

  // Search & Filters for Attendance List
  const [searchTerm, setSearchTerm] = useState('');
  const [filterDate, setFilterDate] = useState('');

  // Calendar view year/month for stats report
  const todayDate = new Date();
  const [viewYear, setViewYear] = useState<number>(todayDate.getFullYear());
  const [viewMonth, setViewMonth] = useState<number>(todayDate.getMonth() + 1);

  // Month navigation for worked hours summary
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
      setViewMonth(prev => prev - 1);
    }
  };

  // worked hours detail modal
  const [showWorkHoursDetailModal, setShowWorkHoursDetailModal] = useState(false);
  const [selectedDetailEmployee, setSelectedDetailEmployee] = useState<any>(null);

  // add manual attendance modal
  const [showAddAttendanceModal, setShowAddAttendanceModal] = useState(false);
  const [addAttEmployeeId, setAddAttEmployeeId] = useState('');
  const [addAttDate, setAddAttDate] = useState(new Date().toISOString().substring(0, 10));
  const [addAttTime, setAddAttTime] = useState('09:00');
  const [addAttType, setAddAttType] = useState('上班');
  const [addAttStatus, setAddAttStatus] = useState('正常');

  // edit attendance modal
  const [showEditAttendanceModal, setShowEditAttendanceModal] = useState(false);
  const [editAttendanceId, setEditAttendanceId] = useState('');
  const [editAttName, setEditAttName] = useState('');
  const [editAttDate, setEditAttDate] = useState('');
  const [editAttTime, setEditAttTime] = useState('');
  const [editAttType, setEditAttType] = useState('上班');
  const [editAttStatus, setEditAttStatus] = useState('正常');

  // 補卡 modal
  const [showPunchCorrModal, setShowPunchCorrModal] = useState(false);
  const [punchCorrException, setPunchCorrException] = useState<any>(null);
  // Four time pickers: [time, enabled], null = no punch
  const [punchCorr1, setPunchCorr1] = useState('');
  const [punchCorr1En, setPunchCorr1En] = useState(false);
  const [punchCorr2, setPunchCorr2] = useState('');
  const [punchCorr2En, setPunchCorr2En] = useState(false);
  const [punchCorr3, setPunchCorr3] = useState('');
  const [punchCorr3En, setPunchCorr3En] = useState(false);
  const [punchCorr4, setPunchCorr4] = useState('');
  const [punchCorr4En, setPunchCorr4En] = useState(false);
  const [punchCorrSubmitting, setPunchCorrSubmitting] = useState(false);

  // Calculated Month worked hours summary (Memoized)
  const monthlyWorkedHoursSummary = useMemo(() => {
    const monthStr = `${viewYear}-${String(viewMonth).padStart(2, '0')}`;
    const summary: { 
      [empId: string]: { 
        name: string; 
        daysCount: number; 
        totalHours: number;
        dailyDetails?: Array<{
          date: string;
          punch1: string;
          punch1Eff?: string;
          punch2: string;
          punch2Eff?: string;
          punch3: string;
          punch3Eff?: string;
          punch4: string;
          punch4Eff?: string;
          hours: number;
        }>;
      } 
    } = {};

    employees.forEach(emp => {
      summary[emp.id] = { name: emp.name, daysCount: 0, totalHours: 0, dailyDetails: [] };
    });

    const attMap: { [empId: string]: { [date: string]: any[] } } = {};
    attendance.forEach(rec => {
      if (!rec.employeeId || !rec.date || !rec.date.startsWith(monthStr)) return;
      if (!attMap[rec.employeeId]) attMap[rec.employeeId] = {};
      if (!attMap[rec.employeeId][rec.date]) attMap[rec.employeeId][rec.date] = [];
      attMap[rec.employeeId][rec.date].push(rec);
    });

    Object.keys(attMap).forEach(empId => {
      if (!summary[empId]) {
        const firstRec = Object.values(attMap[empId])[0]?.[0];
        summary[empId] = { name: firstRec?.empName || empId, daysCount: 0, totalHours: 0, dailyDetails: [] };
      }

      const empDates = attMap[empId];
      const dates = Object.keys(empDates).sort((a, b) => a.localeCompare(b));
      summary[empId].daysCount = dates.length;

      const dailyDetails: Array<{
        date: string;
        punch1: string;
        punch1Eff?: string;
        punch2: string;
        punch2Eff?: string;
        punch3: string;
        punch3Eff?: string;
        punch4: string;
        punch4Eff?: string;
        hours: number;
      }> = [];

      let totalHours = 0;
      dates.forEach(date => {
        const dayRecords = empDates[date];
        const sortedRecs = dayRecords.filter(r => r.time).sort((a, b) => parseTimeStrToMinutes(a.time) - parseTimeStrToMinutes(b.time));

        let dayHours = 0;
        const parseTime = (timeStr: string) => {
          return parseTimeStrToMinutes(timeStr) / 60;
        };

        const dateSched = schedules.find((s: any) => s.employeeId === empId && s.date === date);
        let shiftDef: any = null;
        let startTimeStr = '';
        let endTimeStr = '';
        if (dateSched) {
          const shiftName = dateSched.shift.split('(')[0].trim();
          shiftDef = shifts.find(s => s.name === shiftName);
          startTimeStr = dateSched.startTime || '';
          endTimeStr = dateSched.endTime || '';
          if (!startTimeStr || !endTimeStr) {
            const timeMatch = (dateSched.shift || '').match(/\((\d{1,2}:\d{2})\s*-\s*[^)]*?(\d{1,2}:\d{2})\)/);
            if (timeMatch) {
              if (!startTimeStr) startTimeStr = timeMatch[1];
              if (!endTimeStr) endTimeStr = timeMatch[2];
            }
          }
          // 依核准的「班別調整」請假單調整預期上下班時間
          const dayLeaves = (leaves || []).filter(l => l.employeeId === empId && l.startDate <= date && l.endDate >= date);
          const { adjustedStart, adjustedEnd } = getAdjustedShiftTimes(startTimeStr, endTimeStr, dayLeaves);
          startTimeStr = adjustedStart;
          endTimeStr = adjustedEnd;
        }

        const hasFixedBreak = shiftDef && shiftDef.breakStartTime && shiftDef.breakEndTime;
        let start1 = 0;
        let end1 = 0;
        let start2 = 0;
        let end2 = 0;

        if (dateSched && startTimeStr && endTimeStr) {
          if (hasFixedBreak) {
            start1 = parseTime(startTimeStr);
            end1 = parseTime(shiftDef.breakStartTime);
            if (end1 < start1) end1 += 24;

            start2 = parseTime(shiftDef.breakEndTime);
            if (start2 < start1) start2 += 24;

            end2 = parseTime(endTimeStr);
            if (end2 < start2) end2 += 24;
          } else {
            start1 = parseTime(startTimeStr);
            end1 = parseTime(endTimeStr);
            if (end1 < start1) end1 += 24;
          }
        }

        // Count total punch pairs
        let totalPairs = 0;
        for (let k = 0; k < sortedRecs.length; k++) {
          if (sortedRecs[k].type === '上班') {
            for (let l = k + 1; l < sortedRecs.length; l++) {
              if (sortedRecs[l].type === '下班') {
                totalPairs++;
                k = l;
                break;
              }
            }
          }
        }

        dayHours = 0;
        let punchPairsCount = 0;
        let firstInTime = 0;
        let lastOutTime = 0;

        // Initialize punches fallbacks
        let punch1 = '—';
        let punch2 = '—';
        let punch3 = '—';
        let punch4 = '—';

        const ins = sortedRecs.filter(r => r.type === '上班');
        const outs = sortedRecs.filter(r => r.type === '下班');
        if (sortedRecs.length <= 2) {
          punch1 = ins[0]?.time || '—';
          punch4 = outs[0]?.time || '—';
        } else {
          punch1 = ins[0]?.time || '—';
          punch2 = outs[0]?.time || '—';
          punch3 = ins[1]?.time || '—';
          punch4 = outs[1]?.time || '—';
        }

        let punch1Eff = punch1;
        let punch2Eff = punch2;
        let punch3Eff = punch3;
        let punch4Eff = punch4;

        let idx = 0;
        while (idx < sortedRecs.length) {
          if (sortedRecs[idx].type === '上班') {
            let nextOut = null;
            let nextOutIndex = -1;
            for (let j = idx + 1; j < sortedRecs.length; j++) {
              if (sortedRecs[j].type === '下班') {
                nextOut = sortedRecs[j];
                nextOutIndex = j;
                break;
              }
            }
            if (nextOut) {
              const inTime = parseTime(sortedRecs[idx].time);
              let outTime = parseTime(nextOut.time);
              if (outTime < inTime) outTime += 24;

              let effectiveIn = inTime;
              let effectiveOut = outTime;

              if (dateSched && startTimeStr && endTimeStr) {
                let expectedStart = undefined;
                let expectedEnd = undefined;

                if (hasFixedBreak && totalPairs >= 2) {
                  if (punchPairsCount === 0) {
                    expectedStart = start1;
                    expectedEnd = end1;
                  } else if (punchPairsCount === 1) {
                    expectedStart = start2;
                    expectedEnd = end2;
                  }
                } else {
                  if (punchPairsCount === 0) {
                    expectedStart = start1;
                  }
                  if (punchPairsCount === totalPairs - 1) {
                    expectedEnd = hasFixedBreak ? end2 : end1;
                  }
                }

                if (expectedStart !== undefined) {
                  effectiveIn = Math.max(inTime, expectedStart);
                }
                if (expectedEnd !== undefined) {
                  effectiveOut = Math.min(outTime, expectedEnd);
                }
              }

              if (punchPairsCount === 0) {
                firstInTime = effectiveIn;
              }
              lastOutTime = effectiveOut;

              dayHours += Math.max(0, effectiveOut - effectiveIn);

              const formatDecimalToTimeStr = (tDec: number) => {
                const totalMins = Math.round(tDec * 60);
                const hrs = Math.floor(totalMins / 60) % 24;
                const mins = totalMins % 60;
                return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
              };

              const actInStr = sortedRecs[idx].time || '—';
              const actOutStr = nextOut.time || '—';
              const effInStr = formatDecimalToTimeStr(effectiveIn);
              const effOutStr = formatDecimalToTimeStr(effectiveOut);

              if (punchPairsCount === 0) {
                punch1 = actInStr;
                punch1Eff = effInStr;
                if (totalPairs <= 1) {
                  punch4 = actOutStr;
                  punch4Eff = effOutStr;
                } else {
                  punch2 = actOutStr;
                  punch2Eff = effOutStr;
                }
              } else if (punchPairsCount === 1) {
                punch3 = actInStr;
                punch3Eff = effInStr;
                punch4 = actOutStr;
                punch4Eff = effOutStr;
              }

              punchPairsCount++;
              idx = nextOutIndex + 1;
            } else {
              idx++;
            }
          } else {
            idx++;
          }
        }

        if (dayHours > 0) {
          if (dateSched && shiftDef) {
            if (punchPairsCount === 1) {
              if (shiftDef.breakStartTime && shiftDef.breakEndTime) {
                const bStart = parseTime(shiftDef.breakStartTime);
                let bEnd = parseTime(shiftDef.breakEndTime);
                if (bEnd < bStart) bEnd += 24;

                let adjustedBStart = bStart;
                let adjustedBEnd = bEnd;
                if (adjustedBStart < firstInTime && adjustedBStart + 24 >= firstInTime && adjustedBStart + 24 <= lastOutTime) {
                  adjustedBStart += 24;
                  adjustedBEnd += 24;
                } else if (adjustedBStart + 24 >= firstInTime && adjustedBStart + 24 <= lastOutTime) {
                  adjustedBStart += 24;
                  adjustedBEnd += 24;
                } else if (adjustedBStart - 24 >= firstInTime) {
                  adjustedBStart -= 24;
                  adjustedBEnd -= 24;
                }

                const startOverlap = Math.max(firstInTime, adjustedBStart);
                const endOverlap = Math.min(lastOutTime, adjustedBEnd);
                const overlap = Math.max(0, endOverlap - startOverlap);
                dayHours = Math.max(0, dayHours - overlap);
              } else if (shiftDef.breakDuration > 0) {
                dayHours = Math.max(0, dayHours - (shiftDef.breakDuration / 60));
              }
            }
          }
        }

        dayHours = Math.round(dayHours * 10) / 10;
        totalHours += dayHours;

        dailyDetails.push({
          date,
          punch1,
          punch1Eff,
          punch2,
          punch2Eff,
          punch3,
          punch3Eff,
          punch4,
          punch4Eff,
          hours: dayHours
        });
      });

      summary[empId].totalHours = Math.round(totalHours * 10) / 10;
      summary[empId].dailyDetails = dailyDetails;
    });

    return Object.keys(summary).map(empId => ({
      id: empId,
      ...summary[empId]
    })).filter(row => row.daysCount > 0);
  }, [employees, attendance, schedules, shifts, viewYear, viewMonth]);

  // Filtered attendance records for list
  const filteredAttendance = useMemo(() => {
    let list = [...attendance];
    
    if (searchTerm.trim() !== '') {
      list = list.filter(r => r.empName && r.empName.toLowerCase().includes(searchTerm.toLowerCase()));
    }
    
    if (filterDate) {
      list = list.filter(r => r.date === filterDate);
    }
    
    return list;
  }, [attendance, searchTerm, filterDate]);

  // Grouped exceptions for exception report
  const groupedExceptions = useMemo(() => {
    const list: Array<{
      employeeId: string;
      empName: string;
      date: string;
      type: string;
      message: string;
      punchesStr: string;
      shift: string;
      shiftDef: any;
      expectedPunches: number;
    }> = [];

    const monthStr = `${viewYear}-${String(viewMonth).padStart(2, '0')}`;

    const todayStr = new Date().toLocaleDateString('sv');
    // Find all past schedules in the month (up to today)
    const monthSchedules = schedules.filter(s => s.date && s.date.startsWith(monthStr) && s.date <= todayStr);

    // Build attendance map by employee and date
    const attMap: { [empId: string]: { [date: string]: any[] } } = {};
    attendance.forEach(rec => {
      if (!rec.employeeId || !rec.date || !rec.date.startsWith(monthStr)) return;
      if (!attMap[rec.employeeId]) attMap[rec.employeeId] = {};
      if (!attMap[rec.employeeId][rec.date]) attMap[rec.employeeId][rec.date] = [];
      attMap[rec.employeeId][rec.date].push(rec);
    });

    // Build leaves map
    const leavesMap: { [empId: string]: any[] } = {};
    (leaves || []).forEach(l => {
      if (!l.employeeId) return;
      if (!leavesMap[l.employeeId]) leavesMap[l.employeeId] = [];
      leavesMap[l.employeeId].push(l);
    });

    // Build overtime map
    const otMap: { [empId: string]: any[] } = {};
    (overtimeReqs || []).forEach(o => {
      if (!o.employeeId) return;
      if (!otMap[o.employeeId]) otMap[o.employeeId] = [];
      otMap[o.employeeId].push(o);
    });

    monthSchedules.forEach((sched: any) => {
      const empId = sched.employeeId;
      const date = sched.date;
      const empName = sched.empName || employees.find(e => e.id === empId)?.name || empId;

      // Skip off shift
      if (isOffShift(sched.shift)) return;

      // Skip approved leave (排除「班別調整」，因為其他時段員工仍然要出勤打卡)
      const empLeaves = leavesMap[empId] || [];
      const hasLeave = empLeaves.some(l => l.leaveType !== 'shift_adj' && l.startDate <= date && l.endDate >= date && l.status === 'approved');
      if (hasLeave) return;

      const dayAtt = (attMap[empId] && attMap[empId][date]) || [];
      const shiftName = (sched.shift || '').split('(')[0].trim();
      const shiftDef = (shifts || []).find(s => s.name === shiftName);
      const expectsFour = shiftDef ? ((shiftDef.breakStartTime && shiftDef.breakEndTime) || (shiftDef.breakDuration > 0)) : false;
      const empOvertimes = otMap[empId] || [];
      const hasApprovedOvertime = empOvertimes.some(ot => ot.date === date && ot.status === 'approved');
      const expectedPunches = (expectsFour && !hasApprovedOvertime) ? 4 : 2;

      let startTimeStr = '';
      let endTimeStr = '';
      const timeMatch = (sched.shift || '').match(/\((\d{1,2}:\d{2})\s*-\s*[^)]*?(\d{1,2}:\d{2})\)/);
      if (timeMatch) {
        startTimeStr = timeMatch[1];
        endTimeStr = timeMatch[2];
      }

      // 依核准的「班別調整」假單調整當天班表起迄時間
      const approvedShiftAdjLeaves = empLeaves.filter(l => l.startDate <= date && l.endDate >= date);
      const { adjustedStart, adjustedEnd } = getAdjustedShiftTimes(startTimeStr, endTimeStr, approvedShiftAdjLeaves);

      // 動態判定當日各打卡狀態，防止「班別調整」被算為遲到/早退
      const adjustedPunches = dayAtt.map(p => {
        let status = p.status || '正常';
        const timeMins = parseTimeStrToMinutes(p.time || '');
        if (p.type === '上班') {
          const inRecs = dayAtt.filter(r => r.type === '上班').sort((a, b) => parseTimeStrToMinutes(a.time || '') - parseTimeStrToMinutes(b.time || ''));
          if (inRecs[0] && inRecs[0].id === p.id) {
            const expectedInMins = parseTimeStrToMinutes(adjustedStart);
            status = timeMins > (expectedInMins + 1) ? '遲到' : '正常';
          }
        } else if (p.type === '下班') {
          const outRecs = dayAtt.filter(r => r.type === '下班').sort((a, b) => parseTimeStrToMinutes(a.time || '') - parseTimeStrToMinutes(b.time || ''));
          if (outRecs[outRecs.length - 1] && outRecs[outRecs.length - 1].id === p.id) {
            const expectedInMins = parseTimeStrToMinutes(adjustedStart);
            let expectedOutMins = parseTimeStrToMinutes(adjustedEnd);
            if (expectedOutMins < expectedInMins) expectedOutMins += 24 * 60;
            
            let actualOutMins = timeMins;
            if (actualOutMins < expectedInMins) actualOutMins += 24 * 60;

            status = actualOutMins < (expectedOutMins - 1) ? '早退' : '正常';
          }
        }
        return { ...p, status };
      });

      const actualPunches = adjustedPunches.length;

      let types: string[] = [];
      let msg = '';
      
      const sortedPunches = [...adjustedPunches].sort((a, b) => parseTimeStrToMinutes(a.time || '') - parseTimeStrToMinutes(b.time || ''));
      const punchesStr = sortedPunches.map(p => `${p.type} ${p.time}${p.status && p.status !== '正常' ? `(${p.status})` : ''}`).join(', ') || '無打卡紀錄';

      if (actualPunches === 0) {
        types.push('未打卡');
        msg = `當天有排班 (${sched.shift})，但無任何打卡紀錄`;
      } else if (actualPunches < expectedPunches) {
        types.push('未打卡');
        msg = `打卡次數不完整：應打卡 ${expectedPunches} 次，實際僅打卡 ${actualPunches} 次 (${sched.shift})`;
      } else {
        const { isLate, isEarly } = evaluatePunchesStatus(adjustedPunches, adjustedStart, adjustedEnd, expectsFour, shiftDef?.breakDuration);

        if (isLate) types.push('遲到');
        if (isEarly) types.push('早退');

        // Check if any individual punch has abnormal status
        adjustedPunches.forEach(p => {
          if (p.status === '異常' && !types.includes('異常')) types.push('異常');
          if (p.status === '遲到' && !types.includes('遲到')) types.push('遲到');
          if (p.status === '早退' && !types.includes('早退')) types.push('早退');
        });

        if (types.length > 0) {
          msg = `班表: ${sched.shift}`;
        }
      }

      if (types.length > 0) {
        list.push({
          employeeId: empId,
          empName,
          date,
          type: types.join('、'),
          message: msg,
          punchesStr,
          shift: sched.shift || '',
          shiftDef: shiftDef || null,
          expectedPunches
        });
      }
    });

    const groups: { [empId: string]: { employeeId: string; empName: string; exceptions: typeof list } } = {};
    
    list.forEach(item => {
      if (!groups[item.employeeId]) {
        groups[item.employeeId] = {
          employeeId: item.employeeId,
          empName: item.empName,
          exceptions: []
        };
      }
      groups[item.employeeId].exceptions.push(item);
    });

    Object.values(groups).forEach(g => {
      g.exceptions.sort((a, b) => a.date.localeCompare(b.date));
    });

    return Object.values(groups).sort((a, b) => a.empName.localeCompare(b.empName, 'zh-Hant'));
  }, [employees, attendance, schedules, shifts, leaves, overtimeReqs, viewYear, viewMonth]);

  // Handlers
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

  const handleUpdateAttendanceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await updateAttendanceRecord(editAttendanceId, {
        date: editAttDate,
        time: editAttTime,
        type: editAttType,
        status: editAttStatus
      });
      setShowEditAttendanceModal(false);
    } catch (err) {
      console.error(err);
      alert('更新失敗');
    }
  };

  // 補卡 handlers
  const handleOpenPunchCorr = (ex: any) => {
    setPunchCorrException(ex);
    // Pre-fill times from the shift definition
    const sd = ex.shiftDef;
    if (sd) {
      setPunchCorr1(sd.startTime || ''); setPunchCorr1En(true);
      if (ex.expectedPunches === 4) {
        setPunchCorr2(sd.breakStartTime || ''); setPunchCorr2En(false);
        setPunchCorr3(sd.breakEndTime || ''); setPunchCorr3En(false);
      } else {
        setPunchCorr2(''); setPunchCorr2En(false);
        setPunchCorr3(''); setPunchCorr3En(false);
      }
      setPunchCorr4(sd.endTime || ''); setPunchCorr4En(true);
    } else {
      // No shift def, parse from shift string
      const m = (ex.shift || '').match(/\((\d{1,2}:\d{2})\s*-\s*[^)]*?(\d{1,2}:\d{2})\)/);
      setPunchCorr1(m ? m[1] : ''); setPunchCorr1En(true);
      setPunchCorr2(''); setPunchCorr2En(false);
      setPunchCorr3(''); setPunchCorr3En(false);
      setPunchCorr4(m ? m[2] : ''); setPunchCorr4En(true);
    }
    setShowPunchCorrModal(true);
  };

  const handlePunchCorrSubmit = async () => {
    if (!punchCorrException) return;
    const { employeeId, empName, date } = punchCorrException;
    const punches = [
      { enabled: punchCorr1En, time: punchCorr1, type: '上班' },
      { enabled: punchCorr2En, time: punchCorr2, type: '下班' },
      { enabled: punchCorr3En, time: punchCorr3, type: '上班' },
      { enabled: punchCorr4En, time: punchCorr4, type: '下班' },
    ].filter(p => p.enabled && p.time);

    if (punches.length === 0) {
      alert('請至少勾選一筆補卡時間');
      return;
    }

    setPunchCorrSubmitting(true);
    try {
      for (const p of punches) {
        await addAttendanceRecord({
          employeeId,
          empName,
          date,
          time: p.time,
          type: p.type,
          status: '正常',
          photo: '',
          location: '後台補卡（異常補登）',
          timestamp: Date.now(),
          source: 'admin_correction'
        });
      }
      setShowPunchCorrModal(false);
      setPunchCorrException(null);
      alert(`✅ 已成功為 ${empName} 在 ${date} 補登 ${punches.length} 筆打卡紀錄！`);
    } catch (err) {
      console.error(err);
      alert('補卡失敗，請重試');
    } finally {
      setPunchCorrSubmitting(false);
    }
  };

  const handleCreateAttendanceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addAttEmployeeId) {
      alert('請選擇員工');
      return;
    }
    const emp = employees.find(e => e.id === addAttEmployeeId);
    const empName = emp ? emp.name : '未知員工';
    try {
      await addAttendanceRecord({
        employeeId: addAttEmployeeId,
        empName: empName,
        date: addAttDate,
        time: addAttTime,
        type: addAttType,
        status: addAttStatus,
        photo: '',
        location: '後台補登（手動）',
        timestamp: Date.now(),
        source: 'admin_manual'
      });
      setShowAddAttendanceModal(false);
      setAddAttEmployeeId('');
    } catch (err) {
      console.error(err);
      alert('新增打卡紀錄失敗');
    }
  };

  const handleDeleteAttendanceClick = async (id: string) => {
    if (id === '1' || id === '2') {
      alert('模擬資料無法刪除。');
      return;
    }
    if (!window.confirm('確定要刪除此筆出勤紀錄嗎？此動作無法復原。')) return;
    try {
      await deleteAttendanceRecord(id);
    } catch (err) {
      console.error(err);
      alert('刪除失敗');
    }
  };

  // CSV Export Tools
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

  const handleExportExceptionCSV = () => {
    const headers = ['員工姓名', '日期', '異常類型', '打卡紀錄', '班表說明'];
    const rows: string[][] = [];
    groupedExceptions.forEach(group => {
      group.exceptions.forEach(ex => {
        rows.push([
          `"${group.empName}"`,
          `"${ex.date}"`,
          `"${ex.type}"`,
          `"${ex.punchesStr}"`,
          `"${ex.message}"`
        ]);
      });
    });
    exportCSV(headers, rows, `出勤異常報告_${viewYear}年${viewMonth}月.csv`);
  };

  return (
    <>
      {/* 頁籤選擇 */}
      <div style={{ 
        display: 'flex', 
        gap: '8px', 
        marginBottom: '24px', 
        borderBottom: '1px solid var(--border)', 
        paddingBottom: '8px',
        flexWrap: 'wrap'
      }}>
        <button 
          onClick={() => setSubTab('summary')}
          style={{
            fontWeight: '700',
            fontSize: '14px',
            color: subTab === 'summary' ? 'var(--primary)' : 'var(--text-muted)',
            border: 'none',
            background: 'none',
            borderBottom: subTab === 'summary' ? '3px solid var(--primary)' : '3px solid transparent',
            padding: '8px 16px',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            outline: 'none'
          }}
        >
          ⏱️ 月工時統計
        </button>
        <button 
          onClick={() => setSubTab('exceptions')}
          style={{
            fontWeight: '700',
            fontSize: '14px',
            color: subTab === 'exceptions' ? '#dc2626' : 'var(--text-muted)',
            border: 'none',
            background: 'none',
            borderBottom: subTab === 'exceptions' ? '3px solid #dc2626' : '3px solid transparent',
            padding: '8px 16px',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            outline: 'none'
          }}
        >
          ⚠️ 出勤異常報告
        </button>
        <button 
          onClick={() => setSubTab('records')}
          style={{
            fontWeight: '700',
            fontSize: '14px',
            color: subTab === 'records' ? 'var(--primary)' : 'var(--text-muted)',
            border: 'none',
            background: 'none',
            borderBottom: subTab === 'records' ? '3px solid var(--primary)' : '3px solid transparent',
            padding: '8px 16px',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            outline: 'none'
          }}
        >
          📋 即時打卡紀錄
        </button>
      </div>

      {/* 1. 個人月工時合計報表 */}
      {subTab === 'summary' && (
        <div className="card" style={{ marginBottom: '24px' }}>
          <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '18px' }}>⏱️</span>
              <h3 style={{ margin: 0 }}>個人月工時合計報表 ({viewYear}年{viewMonth}月)</h3>
            </div>
            <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
              <button onClick={handlePrevMonth} className="btn-text" style={{ padding: '4px 8px', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '12px' }}>◀ 上個月</button>
              <button onClick={handleNextMonth} className="btn-text" style={{ padding: '4px 8px', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '12px' }}>下個月 ▶</button>
            </div>
          </div>
          
          <div className="table-scroll-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>員工姓名</th>
                  <th>本月出勤天數</th>
                  <th>本月累計總工時 (已扣除休息時間)</th>
                  <th>備註</th>
                </tr>
              </thead>
              <tbody>
                {monthlyWorkedHoursSummary.length === 0 ? (
                  <tr>
                    <td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '20px' }}>本月無出勤紀錄。</td>
                  </tr>
                ) : (
                  monthlyWorkedHoursSummary.map(row => (
                    <tr key={row.id}>
                      <td data-label="員工姓名" style={{ fontWeight: '600', color: 'var(--text-main)' }}>{row.name}</td>
                      <td data-label="本月出勤天數">{row.daysCount} 天</td>
                      <td data-label="本月累計總工時">
                        <span 
                          className="badge" 
                          style={{ 
                            backgroundColor: 'rgba(79, 70, 229, 0.1)', 
                            color: 'var(--primary)', 
                            fontWeight: '700', 
                            padding: '4px 10px', 
                            borderRadius: '6px', 
                            fontSize: '13px',
                            cursor: 'pointer',
                            textDecoration: 'underline'
                          }}
                          title="點擊查看每日工時與打卡明細"
                          onClick={() => {
                            setSelectedDetailEmployee(row);
                            setShowWorkHoursDetailModal(true);
                          }}
                        >
                          {row.totalHours} 小時 🔍
                        </span>
                      </td>
                      <td data-label="備註" style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
                        {row.totalHours > 160 ? '💡 已達基本工時基準' : '工時累計中'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 2. 出勤異常報告 */}
      {subTab === 'exceptions' && (
        <div className="card" style={{ marginBottom: '24px' }}>
          <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '18px' }}>⚠️</span>
              <h3 style={{ margin: 0 }}>出勤異常報告 ({viewYear}年{viewMonth}月)</h3>
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <button onClick={handlePrevMonth} className="btn-text" style={{ padding: '4px 8px', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '12px' }}>◀ 上個月</button>
              <button onClick={handleNextMonth} className="btn-text" style={{ padding: '4px 8px', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '12px' }}>下個月 ▶</button>
              <button className="btn-primary btn-sm" onClick={handleExportExceptionCSV} style={{ backgroundColor: '#dc2626', borderColor: '#dc2626' }}>匯出異常報告 (CSV)</button>
            </div>
          </div>

          <div style={{ padding: '24px' }}>
            {groupedExceptions.length === 0 ? (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px 20px', fontSize: '15px' }}>
                🎉 本月無任何出勤異常紀錄，大家出勤非常良好！
              </div>
            ) : (
              groupedExceptions.map(group => (
                <div key={group.employeeId} style={{ 
                  marginBottom: '24px', 
                  border: '1px solid var(--border)', 
                  borderRadius: '12px', 
                  overflow: 'hidden',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                }}>
                  {/* 員工姓名 Header */}
                  <div style={{ 
                    backgroundColor: '#f8fafc', 
                    padding: '14px 20px', 
                    borderBottom: '1px solid var(--border)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}>
                    <span style={{ fontWeight: '700', fontSize: '15px', color: 'var(--text-main)' }}>
                      👤 {group.empName}
                    </span>
                    <span className="badge" style={{ 
                      backgroundColor: 'rgba(239, 68, 68, 0.1)', 
                      color: '#ef4444',
                      fontWeight: '700',
                      fontSize: '12px',
                      padding: '4px 10px',
                      borderRadius: '20px'
                    }}>
                      {group.exceptions.length} 筆異常
                    </span>
                  </div>
                  
                  {/* 異常表格 */}
                  <div className="table-scroll-wrap" style={{ margin: 0, border: 'none' }}>
                    <table className="data-table" style={{ borderCollapse: 'collapse', margin: 0, width: '100%' }}>
                      <thead>
                        <tr>
                          <th style={{ width: '120px' }}>日期</th>
                          <th style={{ width: '150px' }}>異常類型</th>
                          <th>打卡紀錄</th>
                          <th>排班資訊</th>
                          <th style={{ width: '80px', textAlign: 'center' }}>操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.exceptions.map((ex, index) => (
                          <tr key={index}>
                            <td data-label="日期" style={{ fontWeight: '700', color: 'var(--text-main)' }}>{ex.date}</td>
                            <td data-label="異常類型">
                              {ex.type.split('、').map((t, idx) => (
                                <span key={idx} style={{
                                  display: 'inline-block',
                                  padding: '3px 8px',
                                  borderRadius: '6px',
                                  fontSize: '11px',
                                  fontWeight: '700',
                                  backgroundColor: t === '未打卡' ? '#fee2e2' : t === '異常' ? '#ffedd5' : '#fef9c3',
                                  color: t === '未打卡' ? '#ef4444' : t === '異常' ? '#f97316' : '#ca8a04',
                                  marginRight: '4px',
                                  marginBottom: '2px'
                                }}>
                                  {t}
                                </span>
                              ))}
                            </td>
                            <td data-label="打卡紀錄" style={{ fontSize: '13px', color: '#334155' }}>
                              {ex.punchesStr}
                            </td>
                            <td data-label="排班資訊" style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
                              {ex.message}
                            </td>
                            <td data-label="操作" style={{ textAlign: 'center' }}>
                              <button
                                onClick={() => handleOpenPunchCorr(ex)}
                                style={{
                                  padding: '4px 10px',
                                  borderRadius: '6px',
                                  border: 'none',
                                  backgroundColor: 'rgba(79, 70, 229, 0.12)',
                                  color: 'var(--primary)',
                                  fontSize: '12px',
                                  fontWeight: '700',
                                  cursor: 'pointer',
                                  whiteSpace: 'nowrap'
                                }}
                              >
                                ✏️ 補卡
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* 補卡 Modal */}
      {showPunchCorrModal && punchCorrException && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(6px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
          <div style={{ backgroundColor: '#fff', borderRadius: '16px', padding: '32px', width: '90%', maxWidth: '480px', boxShadow: '0 20px 40px rgba(0,0,0,0.15)', maxHeight: '90vh', overflowY: 'auto' }}>
            <h3 style={{ marginBottom: '6px', color: 'var(--primary)', fontSize: '20px', fontWeight: '700' }}>✏️ 補卡登記</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: '20px' }}>
              員工：<strong>{punchCorrException.empName}</strong> ／ 日期：<strong>{punchCorrException.date}</strong><br/>
              班別：{punchCorrException.shift || '不明'}
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {/* Punch 1: 上班 */}
              {[{ label: '① 上班卡', type: '上班', en: punchCorr1En, setEn: setPunchCorr1En, val: punchCorr1, setVal: setPunchCorr1 },
                { label: '② 休息開始（下班卡）', type: '下班', en: punchCorr2En, setEn: setPunchCorr2En, val: punchCorr2, setVal: setPunchCorr2 },
                { label: '③ 休息結束（上班卡）', type: '上班', en: punchCorr3En, setEn: setPunchCorr3En, val: punchCorr3, setVal: setPunchCorr3 },
                { label: '④ 下班卡', type: '下班', en: punchCorr4En, setEn: setPunchCorr4En, val: punchCorr4, setVal: setPunchCorr4 },
              ].map((p, idx) => (
                <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', borderRadius: '10px', backgroundColor: p.en ? 'rgba(79,70,229,0.06)' : '#f9fafb', border: `1px solid ${p.en ? 'rgba(79,70,229,0.25)' : 'var(--border)'}`, transition: 'all 0.2s' }}>
                  <input
                    type="checkbox"
                    checked={p.en}
                    onChange={e => p.setEn(e.target.checked)}
                    style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: 'var(--primary)', flexShrink: 0 }}
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '13px', fontWeight: '600', color: p.en ? 'var(--primary)' : 'var(--text-muted)', marginBottom: '4px' }}>
                      {p.label}
                      <span style={{ marginLeft: '8px', fontSize: '11px', fontWeight: '500', padding: '1px 6px', borderRadius: '4px', backgroundColor: p.type === '上班' ? '#dcfce7' : '#fce7f3', color: p.type === '上班' ? '#16a34a' : '#db2777' }}>{p.type}</span>
                    </div>
                    <input
                      type="time"
                      value={p.val}
                      onChange={e => p.setVal(e.target.value)}
                      disabled={!p.en}
                      style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '14px', backgroundColor: p.en ? '#fff' : '#f3f4f6', color: p.en ? '#1e293b' : '#94a3b8', width: '130px', cursor: p.en ? 'text' : 'not-allowed' }}
                    />
                  </div>
                </div>
              ))}
            </div>

            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '14px' }}>✅ 勾選的項目才會補登打卡紀錄，未勾選的不會建立。</p>

            <div style={{ display: 'flex', gap: '12px', marginTop: '20px' }}>
              <button
                onClick={() => { setShowPunchCorrModal(false); setPunchCorrException(null); }}
                disabled={punchCorrSubmitting}
                style={{ flex: 1, padding: '12px', borderRadius: '8px', border: '1px solid #d1d5db', backgroundColor: '#f3f4f6', cursor: 'pointer', fontWeight: '600', fontSize: '14px' }}
              >
                取消
              </button>
              <button
                onClick={handlePunchCorrSubmit}
                disabled={punchCorrSubmitting}
                style={{ flex: 2, padding: '12px', borderRadius: '8px', border: 'none', backgroundColor: punchCorrSubmitting ? '#a5b4fc' : 'var(--primary)', color: '#fff', cursor: punchCorrSubmitting ? 'not-allowed' : 'pointer', fontWeight: '700', fontSize: '14px' }}
              >
                {punchCorrSubmitting ? '補登中...' : '✅ 確認補卡'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. 即時打卡紀錄 */}
      {subTab === 'records' && (
        <div className="card">
          <div className="card-header">
            <h3>即時打卡紀錄</h3>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button className="btn-primary btn-sm" onClick={() => setShowAddAttendanceModal(true)}>+ 新增打卡紀錄</button>
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
                  style={{ fontSize: '12px', color: '#ef4444', fontWeight: '600', cursor: 'pointer', border: 'none', background: 'none' }}
                >
                  清除
                </button>
              )}
            </div>
          </div>

          <div className="table-scroll-wrap">
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
                    <td data-label="員工姓名" style={{ fontWeight: '600' }}>{record.empName}</td>
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
                          style={{ fontSize: '13px', display: 'inline-flex', alignItems: 'center', gap: '4px', textDecoration: 'underline' }}
                        >
                          📍 查看位置
                        </a>
                      ) : (
                        <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>無定位資料</span>
                      )}
                    </td>
                    <td data-label="操作" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      <button className="btn-text" style={{ color: 'var(--primary)', fontWeight: '600' }} onClick={() => handleOpenEditAttendance(record)}>編輯</button>
                      <button className="btn-text" style={{ color: '#ef4444', fontWeight: '600' }} onClick={() => handleDeleteAttendanceClick(record.id)}>刪除</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 手動新增打卡紀錄彈窗 */}
      {showAddAttendanceModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0, 0, 0, 0.4)', backdropFilter: 'blur(8px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
          <div className="glass-card" style={{ width: '90%', maxWidth: '450px', padding: '32px', borderRadius: '16px', backgroundColor: '#ffffff', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)', maxHeight: '90vh', overflowY: 'auto' }}>
            <h3 style={{ marginBottom: '20px', color: 'var(--primary)', fontSize: '20px', fontWeight: '700' }}>手動新增打卡紀錄</h3>
            <form onSubmit={handleCreateAttendanceSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '13px', fontWeight: '600' }}>選擇員工</label>
                <select value={addAttEmployeeId} onChange={(e) => setAddAttEmployeeId(e.target.value)} style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px', backgroundColor: '#fff' }} required>
                  <option value="">-- 請選擇員工 --</option>
                  {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.name} ({emp.role})</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '13px', fontWeight: '600' }}>打卡日期</label>
                <input type="date" required value={addAttDate} onChange={(e) => setAddAttDate(e.target.value)} style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px' }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '13px', fontWeight: '600' }}>打卡時間</label>
                <input type="text" required value={addAttTime} onChange={(e) => setAddAttTime(e.target.value)} placeholder="例如：09:00" style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px' }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '13px', fontWeight: '600' }}>打卡類型</label>
                <select value={addAttType} onChange={(e) => setAddAttType(e.target.value)} style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px', backgroundColor: '#fff' }}>
                  <option value="上班">上班</option>
                  <option value="下班">下班</option>
                </select>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '13px', fontWeight: '600' }}>狀態</label>
                <select value={addAttStatus} onChange={(e) => setAddAttStatus(e.target.value)} style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px', backgroundColor: '#fff' }}>
                  <option value="正常">正常</option>
                  <option value="遲到">遲到</option>
                  <option value="早退">早退</option>
                  <option value="異常">異常</option>
                  <option value="補打卡">補打卡</option>
                </select>
              </div>
              <div style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
                <button type="button" onClick={() => setShowAddAttendanceModal(false)} style={{ flex: 1, padding: '12px', borderRadius: '8px', border: '1px solid #d1d5db', backgroundColor: '#f3f4f6', cursor: 'pointer', fontWeight: '600', fontSize: '14px' }}>取消</button>
                <button type="submit" style={{ flex: 1, padding: '12px', borderRadius: '8px', border: 'none', backgroundColor: 'var(--primary)', color: '#fff', cursor: 'pointer', fontWeight: '600', fontSize: '14px' }}>新增打卡</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 編輯出勤紀錄彈窗 */}
      {showEditAttendanceModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0, 0, 0, 0.4)', backdropFilter: 'blur(8px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
          <div className="glass-card" style={{ width: '90%', maxWidth: '450px', padding: '32px', borderRadius: '16px', backgroundColor: '#ffffff', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)' }}>
            <h3 style={{ marginBottom: '20px', color: 'var(--primary)', fontSize: '20px', fontWeight: '700' }}>編輯出勤紀錄</h3>
            <form onSubmit={handleUpdateAttendanceSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '13px', fontWeight: '600' }}>員工姓名</label>
                <input type="text" disabled value={editAttName} style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px', backgroundColor: '#f3f4f6', cursor: 'not-allowed' }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '13px', fontWeight: '600' }}>打卡日期</label>
                <input type="date" required value={editAttDate} onChange={(e) => setEditAttDate(e.target.value)} style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px' }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '13px', fontWeight: '600' }}>打卡時間</label>
                <input type="text" required value={editAttTime} onChange={(e) => setEditAttTime(e.target.value)} style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px' }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '13px', fontWeight: '600' }}>打卡類型</label>
                <select value={editAttType} onChange={(e) => setEditAttType(e.target.value)} style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px', backgroundColor: '#fff' }}>
                  <option value="上班">上班</option>
                  <option value="下班">下班</option>
                </select>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '13px', fontWeight: '600' }}>狀態</label>
                <select value={editAttStatus} onChange={(e) => setEditAttStatus(e.target.value)} style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px', backgroundColor: '#fff' }}>
                  <option value="正常">正常</option>
                  <option value="遲到">遲到</option>
                  <option value="早退">早退</option>
                  <option value="補打卡">補打卡</option>
                </select>
              </div>
              <div style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
                <button type="button" onClick={() => setShowEditAttendanceModal(false)} style={{ flex: 1, padding: '12px', borderRadius: '8px', border: '1px solid #d1d5db', backgroundColor: '#f3f4f6', cursor: 'pointer', fontWeight: '600', fontSize: '14px' }}>取消</button>
                <button type="submit" style={{ flex: 1, padding: '12px', borderRadius: '8px', border: 'none', backgroundColor: 'var(--primary)', color: '#fff', cursor: 'pointer', fontWeight: '600', fontSize: '14px' }}>儲存修改</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 個人工時明細彈窗 */}
      {showWorkHoursDetailModal && selectedDetailEmployee && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0, 0, 0, 0.4)', backdropFilter: 'blur(8px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
          <div className="glass-card" style={{ width: '90%', maxWidth: '700px', padding: '32px', borderRadius: '16px', maxHeight: '90vh', overflowY: 'auto', position: 'relative', backgroundColor: '#fff', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', borderBottom: '1px solid #e5e7eb', paddingBottom: '12px' }}>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '700', color: 'var(--text-main)' }}>⏱️ {selectedDetailEmployee.name} - 個人工時明細 ({viewYear}年{viewMonth}月)</h3>
              <button onClick={() => { setShowWorkHoursDetailModal(false); setSelectedDetailEmployee(null); }} style={{ border: 'none', background: 'none', fontSize: '20px', cursor: 'pointer', color: 'var(--text-muted)' }}>✕</button>
            </div>
            <div className="table-scroll-wrap">
              <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f9fafb' }}>
                    <th style={{ padding: '12px', borderBottom: '1px solid #e5e7eb', textAlign: 'left' }}>日期</th>
                    <th style={{ padding: '12px', borderBottom: '1px solid #e5e7eb', textAlign: 'left' }}>上班</th>
                    <th style={{ padding: '12px', borderBottom: '1px solid #e5e7eb', textAlign: 'left' }}>下班</th>
                    <th style={{ padding: '12px', borderBottom: '1px solid #e5e7eb', textAlign: 'left' }}>上班</th>
                    <th style={{ padding: '12px', borderBottom: '1px solid #e5e7eb', textAlign: 'left' }}>下班</th>
                    <th style={{ padding: '12px', borderBottom: '1px solid #e5e7eb', textAlign: 'right' }}>時數</th>
                  </tr>
                </thead>
                <tbody>
                  {!selectedDetailEmployee.dailyDetails || selectedDetailEmployee.dailyDetails.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>此月份無出勤明細紀錄。</td>
                    </tr>
                  ) : (
                    selectedDetailEmployee.dailyDetails.map((detail: any, idx: number) => {
                      const renderPunchCell = (act: string, eff: string) => {
                        if (!act || act === '—') return <span style={{ color: '#9ca3af' }}>—</span>;
                        if (!eff || eff === '—' || act === eff) return <span>{act}</span>;
                        return (
                          <span>
                            <span style={{ textDecoration: 'line-through', color: '#94a3b8', marginRight: '6px' }}>{act}</span>
                            <span style={{ color: '#4f46e5', fontWeight: '700' }}>➔ {eff}</span>
                          </span>
                        );
                      };

                      return (
                        <tr key={idx} style={{ borderBottom: '1px solid #f3f4f6' }}>
                          <td style={{ padding: '12px', fontWeight: '600', color: 'var(--text-main)' }}>{detail.date}</td>
                          <td style={{ padding: '12px' }}>{renderPunchCell(detail.punch1, detail.punch1Eff)}</td>
                          <td style={{ padding: '12px' }}>{renderPunchCell(detail.punch2, detail.punch2Eff)}</td>
                          <td style={{ padding: '12px' }}>{renderPunchCell(detail.punch3, detail.punch3Eff)}</td>
                          <td style={{ padding: '12px' }}>{renderPunchCell(detail.punch4, detail.punch4Eff)}</td>
                          <td style={{ padding: '12px', textAlign: 'right', fontWeight: '700', color: 'var(--primary)' }}>{detail.hours} 小時</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '24px', paddingTop: '16px', borderTop: '1px solid #e5e7eb' }}>
              <span style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-muted)' }}>出勤天數: <strong style={{ color: 'var(--text-main)' }}>{selectedDetailEmployee.daysCount} 天</strong></span>
              <span style={{ fontSize: '15px', fontWeight: '700', color: 'var(--primary)' }}>累計工時: {selectedDetailEmployee.totalHours} 小時</span>
            </div>
            <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={() => { setShowWorkHoursDetailModal(false); setSelectedDetailEmployee(null); }} style={{ padding: '10px 20px', borderRadius: '8px', border: '1px solid #d1d5db', backgroundColor: '#f3f4f6', cursor: 'pointer', fontWeight: '600', fontSize: '14px' }}>關閉明細</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default AttendanceManager;
