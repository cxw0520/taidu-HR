import React, { useState, useMemo } from 'react';
import { useAdminData } from '../context/AdminDataContext';
import { db } from '../firebase';
import { collection, getDocs, setDoc, doc, updateDoc, deleteDoc, where, query } from 'firebase/firestore';

export const PayrollCalculator: React.FC = () => {
  const {
    employees,
    payroll,
    insuranceRates,
    shifts,
    holidays,
    typhoonLeaves
  } = useAdminData();

  // Local states for calculation and UI
  const [payMonthFilter, setPayMonthFilter] = useState<string>(
    new Date().toISOString().substring(0, 7)
  );
  const [viewPayMonth, setViewPayMonth] = useState<string>(
    new Date().toISOString().substring(0, 7)
  );
  const [generatingPayroll, setGeneratingPayroll] = useState(false);
  const [payError, setPayError] = useState('');
  const [paySuccess, setPaySuccess] = useState('');

  // Manual payroll creation states
  const [showAddPayrollModal, setShowAddPayrollModal] = useState(false);
  const [addPayEmployeeId, setAddPayEmployeeId] = useState('');
  const [addPayMonth, setAddPayMonth] = useState('');
  const [addPayBaseSalary, setAddPayBaseSalary] = useState<number>(32000);
  const [addPayAttendanceBonus, setAddPayAttendanceBonus] = useState<number>(0);
  const [addPayOtherAllowance, setAddPayOtherAllowance] = useState<number>(0);
  const [addPayRoleAllowance, setAddPayRoleAllowance] = useState<number>(0);
  const [addPayEvaluationAllowance, setAddPayEvaluationAllowance] = useState<number>(0);
  const [addPayOvertime, setAddPayOvertime] = useState<number>(0);

  // New manual payroll expansion states
  const [addPayAdminBonus, setAddPayAdminBonus] = useState<number>(0);
  const [addPayAnnualLeavePayoff, setAddPayAnnualLeavePayoff] = useState<number>(0);
  const [addPayRetroactivePay, setAddPayRetroactivePay] = useState<number>(0);
  const [addPayLateDeduction, setAddPayLateDeduction] = useState<number>(0);
  const [addPayWithholdingTax, setAddPayWithholdingTax] = useState<number>(0);
  const [addPayInsuranceAdjustment, setAddPayInsuranceAdjustment] = useState<number>(0);
  const [addPayOtherDeductions, setAddPayOtherDeductions] = useState<number>(0);
  const [addPayPensionVoluntary, setAddPayPensionVoluntary] = useState<number>(0);
  const [addPayEmployeeLabor, setAddPayEmployeeLabor] = useState<number>(800);
  const [addPayEmployeeNhi, setAddPayEmployeeNhi] = useState<number>(400);
  const [addPayLeaveDeduction, setAddPayLeaveDeduction] = useState<number>(0);

  // Manual payroll creation states for attendance
  const [addPayLateMinutes, setAddPayLateMinutes] = useState<number>(0);
  const [addPayWeekdayOvertime, setAddPayWeekdayOvertime] = useState<number>(0);
  const [addPayRestDayOvertime, setAddPayRestDayOvertime] = useState<number>(0);
  const [addPayHolidayOvertime, setAddPayHolidayOvertime] = useState<number>(0);
  const [addPayLeaveHours, setAddPayLeaveHours] = useState<number>(0);
  const [addPayMissedPunches, setAddPayMissedPunches] = useState<number>(0);

  // Edit payroll states
  const [showEditPayrollModal, setShowEditPayrollModal] = useState(false);
  const [editPayrollId, setEditPayrollId] = useState('');
  const [editPayEmployeeName, setEditPayEmployeeName] = useState('');
  const [editPayMonth, setEditPayMonth] = useState('');
  const [editPayBaseSalary, setEditPayBaseSalary] = useState<number>(0);
  const [editPayAttendanceBonus, setEditPayAttendanceBonus] = useState<number>(0);
  const [editPayOtherAllowance, setEditPayOtherAllowance] = useState<number>(0);
  const [editPayRoleAllowance, setEditPayRoleAllowance] = useState<number>(0);
  const [editPayEvaluationAllowance, setEditPayEvaluationAllowance] = useState<number>(0);
  const [editPayOvertime, setEditPayOvertime] = useState<number>(0);

  // New edit payroll expansion states
  const [editPayAdminBonus, setEditPayAdminBonus] = useState<number>(0);
  const [editPayAnnualLeavePayoff, setEditPayAnnualLeavePayoff] = useState<number>(0);
  const [editPayRetroactivePay, setEditPayRetroactivePay] = useState<number>(0);
  const [editPayLateDeduction, setEditPayLateDeduction] = useState<number>(0);
  const [editPayWithholdingTax, setEditPayWithholdingTax] = useState<number>(0);
  const [editPayInsuranceAdjustment, setEditPayInsuranceAdjustment] = useState<number>(0);
  const [editPayOtherDeductions, setEditPayOtherDeductions] = useState<number>(0);
  const [editPayPensionVoluntary, setEditPayPensionVoluntary] = useState<number>(0);
  const [editPayEmployeeLabor, setEditPayEmployeeLabor] = useState<number>(0);
  const [editPayEmployeeNhi, setEditPayEmployeeNhi] = useState<number>(0);
  const [editPayLeaveDeduction, setEditPayLeaveDeduction] = useState<number>(0);

  // Edit payroll states for attendance
  const [editPayLateMinutes, setEditPayLateMinutes] = useState<number>(0);
  const [editPayWeekdayOvertime, setEditPayWeekdayOvertime] = useState<number>(0);
  const [editPayRestDayOvertime, setEditPayRestDayOvertime] = useState<number>(0);
  const [editPayHolidayOvertime, setEditPayHolidayOvertime] = useState<number>(0);
  const [editPayLeaveHours, setEditPayLeaveHours] = useState<number>(0);
  const [editPayMissedPunches, setEditPayMissedPunches] = useState<number>(0);

  const [editPayStatus, setEditPayStatus] = useState('待審核');

  // Filtered payroll
  const filteredPayroll = useMemo(() => {
    return payroll.filter(p => {
      return viewPayMonth ? p.month === viewPayMonth : true;
    });
  }, [payroll, viewPayMonth]);

  // Payroll summary stats
  const payrollSummary = useMemo(() => {
    let totalGrossSalary = 0;
    let totalEmployeeDeductions = 0;
    let totalNetSalary = 0;
    let totalEmployerInsurance = 0;
    let totalLaborCost = 0;

    filteredPayroll.forEach((p: any) => {
      const gross = (p.baseSalary || 0) + 
                    (p.attendanceBonus || 0) + 
                    (p.otherAllowance || 0) + 
                    (p.roleAllowance || 0) + 
                    (p.evaluationAllowance || 0) + 
                    (p.overtime || 0);
      
      // 差勤扣款：請假扣薪、遲到扣款、其他扣款
      const attendanceDed = (p.leaveDeduction || 0) + (p.lateDeduction || 0) + (p.otherDeductions || 0);
      // 應發薪資 = 薪資合計 - 差勤扣款
      const grossAfterAttendance = gross - attendanceDed;

      const empDed = (p.employeeLabor || 0) + (p.employeeNhi || 0);
      const net = p.netSalary || 0;
      const compIns = (p.employerLabor || 0) + (p.employerNhi || 0) + (p.employerPension || 0);
      const laborCost = grossAfterAttendance + compIns;

      totalGrossSalary += grossAfterAttendance;
      totalEmployeeDeductions += empDed;
      totalNetSalary += net;
      totalEmployerInsurance += compIns;
      totalLaborCost += laborCost;
    });

    return {
      totalGrossSalary,
      totalEmployeeDeductions,
      totalNetSalary,
      totalEmployerInsurance,
      totalLaborCost,
      count: filteredPayroll.length
    };
  }, [filteredPayroll]);

  // Run calculation logic
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

      const schedulesSnapshot = await getDocs(collection(db, 'schedules'));
      const schedulesList = schedulesSnapshot.docs.map(doc => doc.data() as any);

      const overtimeSnapshot = await getDocs(collection(db, 'overtime_requests'));
      const overtimeRecords = overtimeSnapshot.docs.map(doc => doc.data() as any);

      const { calculatePayrollInsurance, calculateOvertimePay, isOffShift, parseTimeStrToMinutes, calculateSpecialLeavePeriods, getAdjustedShiftTimes, getEffectiveSalaryConfig, getShiftStartEndTimes, roundToHalfHour, calculateTyphoonLeaveHours, analyzeDayPunches } = await import('../utils/taiwanHrEngine');

      for (const emp of employeesList) {
        const isMock = emp.id === 'EMP001' || emp.id === 'EMP002' || emp.id === 'EMP003';
        
        // 取得當月生效的薪資與保費設定（歷史隔離保護機制）
        const effConfig = getEffectiveSalaryConfig(emp, monthStr);
        let monthlySalary = effConfig.monthlySalary;
        const salaryType = effConfig.salaryType;
        let laborSub = effConfig.laborSub;
        let nhiSub = effConfig.nhiSub;
        let pensionSub = effConfig.pensionSub;
        let onboardDateStr = emp.onboardDate || '2025-01-01';
        let resignDateStr = emp.resignDate || null;

        // 檢查當月是否為「轉正職月份」
        const isTransitionMonth = !!(emp.transitionDate && emp.transitionDate.substring(0, 7) === monthStr);
        const transitionDateStr = emp.transitionDate || '';

        // ── 檢查入職與離職月份 ──
        const onboardMonth = onboardDateStr.substring(0, 7);
        if (onboardMonth > monthStr) {
          // 計算月份在入職月之前，代表當月尚未入職，刪除可能存在的舊薪資單並跳過
          const payrollId = `${emp.id}-${monthStr}`;
          await deleteDoc(doc(db, 'payroll', payrollId));
          continue;
        }
        if (resignDateStr && resignDateStr.substring(0, 7) < monthStr) {
          // 計算月份在離職月之後，代表當月已離職，刪除可能存在的舊薪資單並跳過
          const payrollId = `${emp.id}-${monthStr}`;
          await deleteDoc(doc(db, 'payroll', payrollId));
          continue;
        }

        // 有離職日：薪資重新計算後自動刪除離職日之後的班表
        if (resignDateStr) {
          const schedsRef = collection(db, 'schedules');
          const schedsQuery = query(schedsRef, where('employeeId', '==', emp.id));
          const schedsSnap = await getDocs(schedsQuery);
          for (const d of schedsSnap.docs) {
            const sDate = (d.data().date || '');
            if (sDate > resignDateStr) {
              await deleteDoc(doc(db, 'schedules', d.id));
            }
          }
        }

        const nhiDependents = emp.nhiDependents || 0;
        let attendanceBonus = effConfig.attendanceBonus;
        const otherAllowance = effConfig.otherAllowance;
        const roleAllowance = effConfig.roleAllowance;
        const evaluationAllowance = effConfig.evaluationAllowance;

        if (isMock) {
          if (emp.role && emp.role.includes('工程師')) {
            monthlySalary = 45000; laborSub = 45800; nhiSub = 45800; pensionSub = 45800;
          } else if (emp.role && emp.role.includes('設計師')) {
            monthlySalary = 38000; laborSub = 38200; nhiSub = 38200; pensionSub = 38200;
          }
        }

        const isHourly = salaryType === 'hourly';
        
        // 月薪基準 = 底薪 + 職務加給 + 全勤 + 考核加給 (時薪人員為時薪值)
        const monthlySalaryBasis = isHourly
          ? monthlySalary
          : (monthlySalary + roleAllowance + attendanceBonus + evaluationAllowance);

        const hourlyRate = isHourly ? monthlySalary : (monthlySalaryBasis / 240);

        const empAttendance = attendanceRecords.filter((rec: any) => 
          rec.employeeId === emp.id && 
          rec.date && rec.date.startsWith(monthStr)
        );

        // Calculate late counts and accumulated minutes for attendance bonus
        let lateCount = 0;
        let lateMinutesTotal = 0;

        // Group '上班' records by date
        const allInRecordsByDate: { [date: string]: any[] } = {};
        empAttendance.forEach((rec: any) => {
          if (rec.type === '上班' && rec.time && rec.date) {
            if (!allInRecordsByDate[rec.date]) {
              allInRecordsByDate[rec.date] = [];
            }
            allInRecordsByDate[rec.date].push(rec);
          }
        });

        Object.keys(allInRecordsByDate).forEach(date => {
          const dayRecs = allInRecordsByDate[date].sort((a, b) => parseTimeStrToMinutes(a.time) - parseTimeStrToMinutes(b.time));
          const dateSched = schedulesList.find((s: any) => s.employeeId === emp.id && s.date === date);
          if (dateSched) {
            const { startTimeStr, shiftDef } = getShiftStartEndTimes(dateSched, shifts);
            if (startTimeStr) {
              const expectedInMins = parseTimeStrToMinutes(startTimeStr);
              const hasFixedBreak = shiftDef && shiftDef.breakStartTime && shiftDef.breakEndTime;
              
              dayRecs.forEach((rec, idx) => {
                let expectedStart = expectedInMins;
                if (hasFixedBreak && idx === 1) {
                  expectedStart = parseTimeStrToMinutes(shiftDef.breakEndTime);
                }
                
                const actualInMins = parseTimeStrToMinutes(rec.time);
                const isLate = rec.status === '遲到' || (!rec.status && idx === 0 && actualInMins > expectedStart + 5) || (!rec.status && idx === 1 && hasFixedBreak && actualInMins > expectedStart + 5);
                
                if (isLate) {
                  lateCount++;
                  lateMinutesTotal += Math.max(0, actualInMins - expectedStart);
                }
              });
            }
          }
        });

        let attendanceBonusNote = '';
        if (lateMinutesTotal > 30 || lateCount > 3) {
          attendanceBonus = 0;
          attendanceBonusNote = `遲到超限不發放全勤 (遲到 ${lateCount} 次，累計 ${lateMinutesTotal} 分鐘)`;
        }

        const daysWorked = new Set(empAttendance.map((rec: any) => rec.date)).size;
        
        const empOvertimeReqs = overtimeRecords.filter((req: any) => 
          req.employeeId === emp.id && 
          req.date && req.date.startsWith(monthStr) &&
          req.status === 'approved'
        );

        // 判斷是否按天數比例計算底薪（fullMonthSalary 未設定或 true = 整月計算，false = 按在職天數比例）
        // 離職月或轉正職月一律按天數分段計算
        const fullMonthSalary = emp.fullMonthSalary !== false;
        const isResignMonth = !!(resignDateStr && resignDateStr.substring(0, 7) === monthStr);
        let calculatedBaseSalary = 0;
        let transitionNote = '';

        if (isTransitionMonth) {
          // ── 破月轉正職：正職月薪部分段計算 ──
          const [salYr, salMo] = monthStr.split('-').map(Number);
          const daysInMonth = new Date(salYr, salMo, 0).getDate();
          const transDay = parseInt(transitionDateStr.substring(8, 10));
          let endDay = daysInMonth;
          if (isResignMonth) endDay = parseInt(resignDateStr!.substring(8, 10));

          const fullTimeDays = Math.max(0, endDay - transDay + 1);
          const proRatedMonthlySalary = Math.round(monthlySalary * fullTimeDays / daysInMonth);
          calculatedBaseSalary += proRatedMonthlySalary;

          const prevHourlyRate = emp.previousMonthlySalary || 190;
          transitionNote = `【破月轉正職】${transDay}日生效正職 (${fullTimeDays}天=$${proRatedMonthlySalary.toLocaleString()})，工讀期間時薪 $${prevHourlyRate}`;
        } else if (!isHourly) {
          if (!fullMonthSalary || isResignMonth) {
            // 按在職天數比例計算底薪（離職月一律此邏輯）
            const [salYr, salMo] = monthStr.split('-').map(Number);
            const daysInMonth = new Date(salYr, salMo, 0).getDate();
            let startDay = 1;
            let endDay = daysInMonth;
            if (onboardMonth === monthStr) {
              // 入職月：從入職日計算到月底
              startDay = parseInt(onboardDateStr.substring(8, 10));
            }
            if (isResignMonth) {
              // 離職月：從月初計算到離職日
              endDay = parseInt(resignDateStr!.substring(8, 10));
            }
            const inServiceDays = Math.max(0, endDay - startDay + 1);
            calculatedBaseSalary = Math.round(monthlySalary * inServiceDays / daysInMonth);
          } else {
            calculatedBaseSalary = monthlySalary;
          }
        }
        let overtimePay = 0;
        
        let weekdayOvertimeHours = 0;
        let restDayOvertimeHours = 0;
        let holidayOvertimeHours = 0;
        
        const attendanceByDate: { [date: string]: any[] } = {};
        empAttendance.forEach((rec: any) => {
          if (!rec.date) return;
          if (!attendanceByDate[rec.date]) attendanceByDate[rec.date] = [];
          attendanceByDate[rec.date].push(rec);
        });

        // 1. Calculate hourly workers' base and double holidays salary (包含破月轉正職工讀階段)
        // 使用 analyzeDayPunches 引擎統一處理，可正確處理4槽位班別缺打卡（3次打卡）的情況
        if (isHourly || isTransitionMonth) {
          Object.keys(attendanceByDate).forEach(date => {
            if (isTransitionMonth && date >= transitionDateStr) return; // 轉正後日期歸月薪正職段計算

            const dayRecords = attendanceByDate[date];

            // 需至少有一筆打卡（引擎會自行判斷是否缺卡）
            if (dayRecords.length === 0) return;

            const dateSched = schedulesList.find((s: any) => s.employeeId === emp.id && s.date === date);

            // 使用統一引擎計算當日有效工時（已處理4槽位缺打卡、休息扣除、半小時取捨）
            const analysis = analyzeDayPunches(dayRecords, dateSched, shifts);
            let hours = analysis.effectiveHours;

            if (hours > 0) {
              // 修正：使用 movedDate 判斷實際放假日（節日移轉後以新日期為準）
              const isActualHolidayDate = holidays.some(h =>
                h.movedDate ? h.movedDate === date : h.date === date
              );
              const isCompensatoryWorkdayDate = holidays.some(h => h.workdayDate === date);
              const regHours = Math.min(hours, 8);
              const effHourlyRate = isTransitionMonth ? (emp.previousMonthlySalary || 190) : hourlyRate;
              // 補班日視同平日，不給節日雙薪；正常放假日才給
              if (!isCompensatoryWorkdayDate) {
                calculatedBaseSalary += regHours * effHourlyRate;
                if (isActualHolidayDate) {
                  overtimePay += regHours * effHourlyRate; // 國定假日工作 → 額外再給一倍
                }
              } else {
                // 補班日：視同平日計薪
                calculatedBaseSalary += regHours * effHourlyRate;
              }
            }
          });
        }


        // 2. Overtime calculation
        empOvertimeReqs.forEach((req: any) => {
          const isActualHoliday = holidays.some(h =>
            h.movedDate ? h.movedDate === req.date : h.date === req.date
          );

          const isCompensatoryWorkday = holidays.some(h =>
            h.workdayDate && h.workdayDate === req.date
          );

          const d = new Date(req.date);
          const dayOfWeek = d.getDay();
          const otHours = roundToHalfHour(req.hours || 0);

          if (isHourly) {
            const dateSched = schedulesList.find((s: any) => s.employeeId === emp.id && s.date === req.date);
            const shiftType = dateSched ? dateSched.shift : '';

            if (shiftType === '休假') {
              overtimePay += calculateOvertimePay(hourlyRate, otHours, 'rest');
              restDayOvertimeHours += otHours;
            } else if (shiftType === '例假') {
              overtimePay += Math.round(otHours * hourlyRate * 2.0);
              holidayOvertimeHours += otHours;
            } else if (isActualHoliday) {
              overtimePay += calculateOvertimePay(hourlyRate, otHours, 'regular');
              holidayOvertimeHours += otHours;
            } else {
              overtimePay += calculateOvertimePay(hourlyRate, otHours, 'regular');
              weekdayOvertimeHours += otHours;
            }
          } else {
            let dayType: 'regular' | 'rest' | 'holiday' = 'regular';
            if (isActualHoliday) {
              dayType = 'holiday';
              holidayOvertimeHours += otHours;
            } else if (isCompensatoryWorkday) {
              dayType = 'regular';
              weekdayOvertimeHours += otHours;
            } else if (dayOfWeek === 6) {
              dayType = 'rest';
              restDayOvertimeHours += otHours;
            } else if (dayOfWeek === 0) {
              dayType = 'holiday';
              holidayOvertimeHours += otHours;
            } else {
              dayType = 'regular';
              weekdayOvertimeHours += otHours;
            }
            overtimePay += calculateOvertimePay(hourlyRate, otHours, dayType);
          }
        });

        if (daysWorked === 0) {
          overtimePay = 0;
        }

        const dailyRate = monthlySalaryBasis / 30;
        let totalSickHours = 0;
        let totalPersonalHours = 0;
        let totalTyphoonHours = 0;
        let totalLeaveHours = 0;
        
        const empLeaves = approvedLeaves.filter(l => l.employeeId === emp.id);
        for (const lv of empLeaves) {
          if (lv.leaveType === 'shift_adj') continue;
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
          const totalDays = Math.round((new Date(lvEnd).getTime() - new Date(lvStart).getTime()) / 86400000) + 1;
          const leaveHours = lv.hours || (totalDays * 8);
          const monthLeaveHours = (days / totalDays) * leaveHours;
          const roundedMonthLeaveHours = roundToHalfHour(monthLeaveHours);
          totalLeaveHours += roundedMonthLeaveHours;

          if (lv.leaveType === 'personal') totalPersonalHours += roundedMonthLeaveHours;
          else if (lv.leaveType === 'sick') totalSickHours += roundedMonthLeaveHours;
          else if (lv.leaveType === 'typhoon') totalTyphoonHours += roundedMonthLeaveHours;
        }

        // 自動對照後台設定之颱風假 (與該員工當月排班比對)
        const [tYear, tMonth] = monthStr.split('-').map(Number);
        const daysInMonthCnt = new Date(tYear, tMonth, 0).getDate();
        for (let d = 1; d <= daysInMonthCnt; d++) {
          const dStr = `${monthStr}-${String(d).padStart(2, '0')}`;
          const activeTyphoon = (typhoonLeaves || []).find((t: any) => t.date === dStr);
          if (activeTyphoon) {
            const dateSched = schedulesList.find((s: any) => s.employeeId === emp.id && s.date === dStr);
            if (dateSched && !isOffShift(dateSched.shift)) {
              const { startTimeStr, endTimeStr, shiftDef } = getShiftStartEndTimes(dateSched, shifts);
              const typHours = calculateTyphoonLeaveHours(
                startTimeStr,
                endTimeStr,
                activeTyphoon.mode,
                activeTyphoon.startTime,
                shiftDef?.breakDuration || 60
              );
              if (typHours > 0) {
                totalTyphoonHours += roundToHalfHour(typHours);
              }
            }
          }
        }

        const personalLeaveDays = Math.round((totalPersonalHours / 8) * 100) / 100;
        const sickLeaveDays = Math.round((totalSickHours / 8) * 100) / 100;
        const typhoonLeaveDays = Math.round((totalTyphoonHours / 8) * 100) / 100;

        if (sickLeaveDays > 0 && attendanceBonus > 0) {
          const sickBonusDeduction = Math.min(attendanceBonus, Math.round(sickLeaveDays * ((emp.attendanceBonus || 0) / 30)));
          attendanceBonus -= sickBonusDeduction;
          if (sickBonusDeduction > 0) {
            attendanceBonusNote = attendanceBonusNote
              ? `${attendanceBonusNote}；病假扣全勤 ${sickBonusDeduction} 元`
              : `請病假 ${sickLeaveDays.toFixed(1)} 天，扣減全勤獎金 ${sickBonusDeduction} 元`;
          }
        }

        // Calculate missed punch count
        let missedPunchCount = 0;
        const [yr, mo] = monthStr.split('-').map(Number);
        const daysInMonthCount = new Date(yr, mo, 0).getDate();
        for (let d = 1; d <= daysInMonthCount; d++) {
          const dateStr = `${monthStr}-${String(d).padStart(2, '0')}`;
          const daySched = schedulesList.find((s: any) => s.employeeId === emp.id && s.date === dateStr);
          if (daySched && !isOffShift(daySched.shift)) {
            const hasLeave = approvedLeaves.some(l => 
              l.employeeId === emp.id && 
              l.startDate <= dateStr && 
              l.endDate >= dateStr &&
              l.status === 'approved'
            );
            if (!hasLeave) {
              const dayAtt = empAttendance.filter((rec: any) => rec.date === dateStr);
              const shiftName = (daySched.shift || '').split('(')[0].trim();
              const shiftDef = shifts.find(s => s.name === shiftName);
              const expectsFour = shiftDef ? ((shiftDef.breakStartTime && shiftDef.breakEndTime) || (shiftDef.breakDuration > 0)) : false;
              const hasApprovedOvertime = empOvertimeReqs.some((ot: any) => ot.date === dateStr);
              const expectedPunches = (expectsFour && !hasApprovedOvertime) ? 4 : 2;
              
              if (dayAtt.length < expectedPunches) {
                missedPunchCount += (expectedPunches - dayAtt.length);
              }
            }
          }
        }
        
        // Calculate special leave periods and see if any expire in this month
        const getWorkedHours = (startDateStr: string, endDateStr: string): number => {
          const empAtt = (attendanceRecords || []).filter(rec => rec.employeeId === emp.id);
          const attByDate: { [date: string]: any[] } = {};
          empAtt.forEach((rec: any) => {
            if (!rec.date) return;
            if (!attByDate[rec.date]) attByDate[rec.date] = [];
            attByDate[rec.date].push(rec);
          });
          const empScheds = (schedulesList || []).filter(s => s.employeeId === emp.id);

          let totalHours = 0;
          let curr = new Date(startDateStr);
          const end = new Date(endDateStr);
          while (curr <= end) {
            const y = curr.getFullYear();
            const m = String(curr.getMonth() + 1).padStart(2, '0');
            const dVal = String(curr.getDate()).padStart(2, '0');
            const dateStr = `${y}-${m}-${dVal}`;

            const dayAtt = attByDate[dateStr] || [];
            if (dayAtt.length > 0) {
              const sorted = [...dayAtt].sort((a, b) => parseTimeStrToMinutes(a.time || '') - parseTimeStrToMinutes(b.time || ''));
              const sched = empScheds.find(s => s.date === dateStr);
              let shiftDef: any = null;
              if (sched) {
                const shiftName = (sched.shift || '').split('(')[0].trim();
                shiftDef = (shifts || []).find(s => s.name === shiftName);
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

                        // 依核准的「班別調整」請假單調整預期上下班時間
                        const dayLeaves = approvedLeaves.filter(l => l.employeeId === emp.id && l.startDate <= dateStr && l.endDate >= dateStr);
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

        const [yrPay, moPay] = monthStr.split('-').map(Number);
        const lastDayOfPayMonth = new Date(yrPay, moPay, 0);

        const approvedAnnualLeaves = (approvedLeaves || [])
          .filter(l => l.employeeId === emp.id && l.leaveType === 'annual')
          .map(l => ({
            startDate: l.startDate,
            endDate: l.endDate,
            hours: l.hours || 0
          }));

        const specialPeriods = calculateSpecialLeavePeriods(
          onboardDateStr,
          lastDayOfPayMonth,
          salaryType as 'monthly' | 'hourly',
          getWorkedHours,
          approvedAnnualLeaves
        );

        let annualLeavePayoff = 0;
        specialPeriods.forEach(period => {
          if (period.endDate && period.endDate.startsWith(monthStr)) {
            const unused = Math.max(0, period.entitledHours - period.usedHours);
            if (unused > 0) {
              annualLeavePayoff += Math.round(unused * hourlyRate);
            }
          }
        });

        const leaveDeduction = Math.round(
          personalLeaveDays * dailyRate * 1.0 + 
          sickLeaveDays * dailyRate * 0.5 + 
          typhoonLeaveDays * dailyRate * 1.0
        );
        const lateDeduction = isHourly ? 0 : Math.round(lateMinutesTotal * (monthlySalaryBasis / 14400));

        const ins = calculatePayrollInsurance(
          onboardDateStr,
          resignDateStr,
          monthStr,
          { laborSub, nhiSub, pensionSub, nhiDependents },
          insuranceRates
        );

        const deductions = ins.employeeLabor + ins.employeeNhi + leaveDeduction + lateDeduction;
        const totalAllowance = attendanceBonus + otherAllowance + roleAllowance + evaluationAllowance;
        const netSalary = calculatedBaseSalary + totalAllowance + overtimePay + annualLeavePayoff - deductions;
        
        const payrollId = `${emp.id}-${monthStr}`;
        const existingRecord = payroll.find(p => p.id === payrollId);
        const isPublished = existingRecord ? (existingRecord.isPublished ?? false) : false;

        await setDoc(doc(db, 'payroll', payrollId), {
          empName: emp.name,
          employeeId: emp.id,
          month: monthStr,
          baseSalary: calculatedBaseSalary,
          attendanceBonus,
          attendanceBonusNote,
          otherAllowance,
          roleAllowance,
          evaluationAllowance,
          empRole: emp.role || '',
          onboardDate: onboardDateStr,
          salaryType: salaryType,
          transitionNote: transitionNote || '',
          overtime: overtimePay,
          leaveDeduction,
          personalLeaveDays,
          sickLeaveDays,
          deductions,
          netSalary,
          status: existingRecord ? existingRecord.status : '待審核',
          isPublished,
          timestamp: new Date().getTime(),
          lateMinutes: lateMinutesTotal,
          weekdayOvertime: weekdayOvertimeHours,
          restDayOvertime: restDayOvertimeHours,
          holidayOvertime: holidayOvertimeHours,
          leaveHours: Math.round(totalLeaveHours * 10) / 10,
          missedPunches: missedPunchCount,
          laborDays: ins.laborDays,
          employeeLabor: ins.employeeLabor,
          employerLabor: ins.employerLabor,
          employeeNhi: ins.employeeNhi,
          employerNhi: ins.employerNhi,
          employerPension: ins.employerPension,
          laborSub,
          nhiSub,
          pensionSub,
          nhiDependents,
          adminBonus: 0,
          annualLeavePayoff: annualLeavePayoff,
          retroactivePay: 0,
          lateDeduction,
          withholdingTax: 0,
          insuranceAdjustment: 0,
          otherDeductions: 0,
          pensionVoluntary: 0
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

  // Publish payroll for the month
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

  // Unpublish payroll for the month
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
    setEditPayAttendanceBonus(record.attendanceBonus || 0);
    setEditPayOtherAllowance(record.otherAllowance || 0);
    setEditPayRoleAllowance(record.roleAllowance || 0);
    setEditPayEvaluationAllowance(record.evaluationAllowance || 0);
    setEditPayOvertime(record.overtime || 0);
    setEditPayLateMinutes(record.lateMinutes || 0);
    setEditPayWeekdayOvertime(record.weekdayOvertime || 0);
    setEditPayRestDayOvertime(record.restDayOvertime || 0);
    setEditPayHolidayOvertime(record.holidayOvertime || 0);
    setEditPayLeaveHours(record.leaveHours || 0);
    setEditPayMissedPunches(record.missedPunches || 0);
    setEditPayStatus(record.status);
    
    // Populate new edit states
    setEditPayAdminBonus(record.adminBonus || 0);
    setEditPayAnnualLeavePayoff(record.annualLeavePayoff || 0);
    setEditPayRetroactivePay(record.retroactivePay || 0);
    setEditPayLateDeduction(record.lateDeduction || 0);
    setEditPayWithholdingTax(record.withholdingTax || 0);
    setEditPayInsuranceAdjustment(record.insuranceAdjustment || 0);
    setEditPayOtherDeductions(record.otherDeductions || 0);
    setEditPayPensionVoluntary(record.pensionVoluntary || 0);
    setEditPayEmployeeLabor(record.employeeLabor || 0);
    setEditPayEmployeeNhi(record.employeeNhi || 0);
    setEditPayLeaveDeduction(record.leaveDeduction || 0);

    setShowEditPayrollModal(true);
  };

  const handleUpdatePayroll = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const gross = Number(editPayBaseSalary) +
                    Number(editPayRoleAllowance) +
                    Number(editPayEvaluationAllowance) +
                    Number(editPayAttendanceBonus) +
                    Number(editPayOtherAllowance) +
                    Number(editPayOvertime) +
                    Number(editPayAdminBonus) +
                    Number(editPayAnnualLeavePayoff) +
                    Number(editPayRetroactivePay);
      const totalDeds = Number(editPayEmployeeLabor) +
                        Number(editPayEmployeeNhi) +
                        Number(editPayLeaveDeduction) +
                        Number(editPayLateDeduction) +
                        Number(editPayWithholdingTax) +
                        Number(editPayInsuranceAdjustment) +
                        Number(editPayOtherDeductions) +
                        Number(editPayPensionVoluntary);
      const net = gross - totalDeds;

      await updateDoc(doc(db, 'payroll', editPayrollId), {
        baseSalary: Number(editPayBaseSalary),
        attendanceBonus: Number(editPayAttendanceBonus),
        otherAllowance: Number(editPayOtherAllowance),
        roleAllowance: Number(editPayRoleAllowance),
        evaluationAllowance: Number(editPayEvaluationAllowance),
        overtime: Number(editPayOvertime),
        deductions: totalDeds,
        netSalary: net,
        status: editPayStatus,
        lateMinutes: Number(editPayLateMinutes),
        weekdayOvertime: Number(editPayWeekdayOvertime),
        restDayOvertime: Number(editPayRestDayOvertime),
        holidayOvertime: Number(editPayHolidayOvertime),
        leaveHours: Number(editPayLeaveHours),
        missedPunches: Number(editPayMissedPunches),
        adminBonus: Number(editPayAdminBonus),
        annualLeavePayoff: Number(editPayAnnualLeavePayoff),
        retroactivePay: Number(editPayRetroactivePay),
        lateDeduction: Number(editPayLateDeduction),
        withholdingTax: Number(editPayWithholdingTax),
        insuranceAdjustment: Number(editPayInsuranceAdjustment),
        otherDeductions: Number(editPayOtherDeductions),
        pensionVoluntary: Number(editPayPensionVoluntary),
        employeeLabor: Number(editPayEmployeeLabor),
        employeeNhi: Number(editPayEmployeeNhi),
        leaveDeduction: Number(editPayLeaveDeduction)
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
      const gross = Number(addPayBaseSalary) +
                    Number(addPayRoleAllowance) +
                    Number(addPayEvaluationAllowance) +
                    Number(addPayAttendanceBonus) +
                    Number(addPayOtherAllowance) +
                    Number(addPayOvertime) +
                    Number(addPayAdminBonus) +
                    Number(addPayAnnualLeavePayoff) +
                    Number(addPayRetroactivePay);
      const totalDeds = Number(addPayEmployeeLabor) +
                        Number(addPayEmployeeNhi) +
                        Number(addPayLeaveDeduction) +
                        Number(addPayLateDeduction) +
                        Number(addPayWithholdingTax) +
                        Number(addPayInsuranceAdjustment) +
                        Number(addPayOtherDeductions) +
                        Number(addPayPensionVoluntary);
      const net = gross - totalDeds;
      const payrollId = `${addPayEmployeeId}-${monthStr}`;

      await setDoc(doc(db, 'payroll', payrollId), {
        empName: empName,
        employeeId: addPayEmployeeId,
        month: monthStr,
        baseSalary: Number(addPayBaseSalary),
        attendanceBonus: Number(addPayAttendanceBonus),
        otherAllowance: Number(addPayOtherAllowance),
        roleAllowance: Number(addPayRoleAllowance),
        evaluationAllowance: Number(addPayEvaluationAllowance),
        overtime: Number(addPayOvertime),
        deductions: totalDeds,
        netSalary: net,
        empRole: emp?.role || '',
        onboardDate: emp?.onboardDate || '',
        status: '待審核',
        isPublished: false,
        timestamp: new Date().getTime(),
        lateMinutes: Number(addPayLateMinutes),
        weekdayOvertime: Number(addPayWeekdayOvertime),
        restDayOvertime: Number(addPayRestDayOvertime),
        holidayOvertime: Number(addPayHolidayOvertime),
        leaveHours: Number(addPayLeaveHours),
        missedPunches: Number(addPayMissedPunches),
        adminBonus: Number(addPayAdminBonus),
        annualLeavePayoff: Number(addPayAnnualLeavePayoff),
        retroactivePay: Number(addPayRetroactivePay),
        lateDeduction: Number(addPayLateDeduction),
        withholdingTax: Number(addPayWithholdingTax),
        insuranceAdjustment: Number(addPayInsuranceAdjustment),
        otherDeductions: Number(addPayOtherDeductions),
        pensionVoluntary: Number(addPayPensionVoluntary),
        employeeLabor: Number(addPayEmployeeLabor),
        employeeNhi: Number(addPayEmployeeNhi),
        leaveDeduction: Number(addPayLeaveDeduction)
      });

      setShowAddPayrollModal(false);
      setAddPayEmployeeId('');
      setAddPayBaseSalary(32000);
      setAddPayAttendanceBonus(0);
      setAddPayOtherAllowance(0);
      setAddPayRoleAllowance(0);
      setAddPayEvaluationAllowance(0);
      setAddPayLateMinutes(0);
      setAddPayWeekdayOvertime(0);
      setAddPayRestDayOvertime(0);
      setAddPayHolidayOvertime(0);
      setAddPayLeaveHours(0);
      setAddPayMissedPunches(0);
      setAddPayOvertime(0);
      setAddPayAdminBonus(0);
      setAddPayAnnualLeavePayoff(0);
      setAddPayRetroactivePay(0);
      setAddPayLateDeduction(0);
      setAddPayWithholdingTax(0);
      setAddPayInsuranceAdjustment(0);
      setAddPayOtherDeductions(0);
      setAddPayPensionVoluntary(0);
      setAddPayEmployeeLabor(800);
      setAddPayEmployeeNhi(400);
      setAddPayLeaveDeduction(0);
    } catch (err) {
      console.error("Failed to create payroll manually:", err);
      alert('建立失敗，此月份薪資單可能已存在，或無寫入權限');
    }
  };

  // CSV Export Utility
  const exportCSV = (headers: string[], rows: string[][], filename: string) => {
    const BOM = '\uFEFF';
    const csvContent = BOM + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportPayrollCSV = () => {
    const headers = ['員工姓名', '結算月份', '底薪', '職務加給', '考核加給', '全勤獎金', '其他津貼', '加班費', '請假扣薪', '勞保自付', '健保自付', '實發薪資', '狀態'];
    const rows = filteredPayroll.map((r: any) => [
      `"${r.empName || ''}"`,
      r.month || '',
      r.baseSalary || 0,
      r.roleAllowance || 0,
      r.evaluationAllowance || 0,
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

  return (
    <div className="card">
      <div className="card-header">
        <h3>薪資結算管理</h3>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
          {payError && <span style={{ color: '#ef4444', fontSize: '13px' }}>⚠️ {payError}</span>}
          {paySuccess && <span style={{ color: '#10b981', fontSize: '13px' }}>✅ {paySuccess}</span>}
          
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
              style={{ fontSize: '12px', color: '#ef4444', fontWeight: '600', cursor: 'pointer', border: 'none', background: 'none' }}
            >
              顯示全部
            </button>
          )}
        </div>
      </div>

      {filteredPayroll.length > 0 && (
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
          gap: '16px', 
          padding: '20px 24px', 
          backgroundColor: '#f8fafc', 
          borderBottom: '1px solid var(--border)' 
        }}>
          <div style={{ 
            backgroundColor: '#fff', 
            borderRadius: '12px', 
            padding: '16px', 
            boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.05)', 
            border: '1px solid #e2e8f0',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px'
          }}>
            <span style={{ fontSize: '13px', color: '#64748b', fontWeight: '500' }}>應發薪資總和 (扣差勤後)</span>
            <span style={{ fontSize: '20px', fontWeight: '700', color: '#1e293b' }}>
              NT$ {payrollSummary.totalGrossSalary.toLocaleString()}
            </span>
          </div>

          <div style={{ 
            backgroundColor: '#fff', 
            borderRadius: '12px', 
            padding: '16px', 
            boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.05)', 
            border: '1px solid #e2e8f0',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px'
          }}>
            <span style={{ fontSize: '13px', color: '#64748b', fontWeight: '500' }}>員工自負總和 (代收款)</span>
            <span style={{ fontSize: '20px', fontWeight: '700', color: '#1e293b' }}>
              NT$ {payrollSummary.totalEmployeeDeductions.toLocaleString()}
            </span>
          </div>

          <div style={{ 
            backgroundColor: '#fff', 
            borderRadius: '12px', 
            padding: '16px', 
            boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.05)', 
            border: '1px solid #e2e8f0',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px'
          }}>
            <span style={{ fontSize: '13px', color: '#64748b', fontWeight: '500' }}>實際發放薪資</span>
            <span style={{ fontSize: '20px', fontWeight: '700', color: '#10b981' }}>
              NT$ {payrollSummary.totalNetSalary.toLocaleString()}
            </span>
          </div>

          <div style={{ 
            backgroundColor: '#fff', 
            borderRadius: '12px', 
            padding: '16px', 
            boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.05)', 
            border: '1px solid #e2e8f0',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px'
          }}>
            <span style={{ fontSize: '13px', color: '#64748b', fontWeight: '500' }}>公司負擔勞健退總和</span>
            <span style={{ fontSize: '20px', fontWeight: '700', color: '#2563eb' }}>
              NT$ {payrollSummary.totalEmployerInsurance.toLocaleString()}
            </span>
          </div>

          <div style={{ 
            backgroundColor: '#eff6ff', 
            borderRadius: '12px', 
            padding: '16px', 
            boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.05)', 
            border: '1px solid #bfdbfe',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px'
          }}>
            <span style={{ fontSize: '13px', color: '#1e40af', fontWeight: '600' }}>總人力成本</span>
            <span style={{ fontSize: '20px', fontWeight: '800', color: '#1d4ed8' }}>
              NT$ {payrollSummary.totalLaborCost.toLocaleString()}
            </span>
          </div>
        </div>
      )}

      <div className="payroll-table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>員工姓名</th>
              <th>結算月份</th>
              <th>底薪</th>
              <th>加班費</th>
              <th>扣款 (勞健保)</th>
              <th>扣款 (差勤)</th>
              <th>雇主負擔勞健保</th>
              <th>人力成本</th>
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
                <td data-label="底薪">
                  <div style={{ fontWeight: '600' }}>NT$ {record.baseSalary?.toLocaleString()}</div>
                  {record.transitionNote && (
                    <div style={{ fontSize: '11px', color: '#047857', marginTop: '3px', backgroundColor: '#ecfdf5', padding: '4px 6px', borderRadius: '4px', border: '1px solid #a7f3d0', fontWeight: '500', lineHeight: '1.3' }}>
                      ⚡ {record.transitionNote}
                    </div>
                  )}
                  {((record.roleAllowance || 0) > 0 || (record.evaluationAllowance || 0) > 0 || (record.attendanceBonus || 0) > 0 || (record.otherAllowance || 0) > 0 || (record.annualLeavePayoff || 0) > 0) && (
                    <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px', lineHeight: '1.4', backgroundColor: '#f8fafc', padding: '6px', borderRadius: '4px', border: '1px dashed #e2e8f0', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      {(record.roleAllowance || 0) > 0 && <div>💼 職加: +{(record.roleAllowance || 0).toLocaleString()}</div>}
                      {(record.evaluationAllowance || 0) > 0 && <div>🏆 考加: +{(record.evaluationAllowance || 0).toLocaleString()}</div>}
                      {(record.attendanceBonus || 0) > 0 && <div>💯 全勤: +{(record.attendanceBonus || 0).toLocaleString()}</div>}
                      {(record.otherAllowance || 0) > 0 && <div>📦 其他: +{(record.otherAllowance || 0).toLocaleString()}</div>}
                      {(record.annualLeavePayoff || 0) > 0 && <div>🏖️ 特休: +{(record.annualLeavePayoff || 0).toLocaleString()}</div>}
                    </div>
                  )}
                </td>
                <td data-label="加班費">NT$ {record.overtime?.toLocaleString()}</td>
                <td data-label="扣款 (勞健保)">
                  <div style={{ fontWeight: '500' }}>
                    -NT$ {(((record.employeeLabor !== undefined && record.employeeNhi !== undefined) ? ((record.employeeLabor || 0) + (record.employeeNhi || 0)) : ((record.deductions || 0) - (record.leaveDeduction || 0)))).toLocaleString()}
                  </div>
                  <div style={{ fontSize: '10px', color: '#64748b', marginTop: '2px' }}>
                    (勞保自付: {record.employeeLabor !== undefined ? (record.employeeLabor || 0).toLocaleString() : '--'} / 健保自付: {record.employeeNhi !== undefined ? (record.employeeNhi || 0).toLocaleString() : '--'})
                  </div>
                </td>
                <td data-label="扣款 (差勤)">
                  -NT$ {(record.leaveDeduction || 0).toLocaleString()}
                </td>
                <td data-label="雇主負擔勞健保">
                  <div>NT$ {((record.employerLabor || 0) + (record.employerNhi || 0)).toLocaleString()}</div>
                  <div style={{ fontSize: '10px', color: '#64748b', marginTop: '2px' }}>
                    (勞保雇主: {(record.employerLabor || 0).toLocaleString()} / 健保雇主: {(record.employerNhi || 0).toLocaleString()} / 勞退6%: {(record.employerPension || 0).toLocaleString()})
                  </div>
                </td>
                <td data-label="人力成本" style={{ fontWeight: '600', color: '#1e293b' }}>
                  <div>NT$ {(
                    (record.netSalary || 0) + 
                    ((record.employeeLabor !== undefined && record.employeeNhi !== undefined) ? ((record.employeeLabor || 0) + (record.employeeNhi || 0)) : ((record.deductions || 0) - (record.leaveDeduction || 0))) + 
                    (record.employerLabor || 0) + 
                    (record.employerNhi || 0) + 
                    (record.employerPension || 0)
                  ).toLocaleString()}</div>
                  <div style={{ fontSize: '10px', color: '#64748b', fontWeight: 'normal', marginTop: '2px' }}>
                    (薪資總額 + 雇主負擔 + 勞退)
                  </div>
                </td>
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
                  <button className="btn-text" style={{ color: record.isPublished ? '#6b7280' : '#10b981', border: 'none', background: 'none', cursor: 'pointer' }} onClick={() => handleTogglePayrollPublish(record.id, record.isPublished)}>
                    {record.isPublished ? '取消發佈' : '發佈'}
                  </button>
                  <button className="btn-text" style={{ border: 'none', background: 'none', cursor: 'pointer' }} onClick={() => handleTogglePayrollStatus(record.id, record.status)}>
                    切換狀態
                  </button>
                  <button className="btn-text" style={{ color: 'var(--primary)', border: 'none', background: 'none', cursor: 'pointer' }} onClick={() => handleOpenEditPayroll(record)}>
                    編輯
                  </button>
                  <button className="btn-text" style={{ color: '#ef4444', border: 'none', background: 'none', cursor: 'pointer' }} onClick={() => handleDeletePayroll(record.id)}>
                    刪除
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add Payroll Modal */}
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
                      setAddPayBaseSalary(emp.monthlySalary || 32000);
                      setAddPayAttendanceBonus(emp.attendanceBonus || 0);
                      setAddPayOtherAllowance(emp.otherAllowance || 0);
                      setAddPayRoleAllowance(emp.roleAllowance || 0);
                      setAddPayEvaluationAllowance(emp.evaluationAllowance || 0);
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

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '13px', fontWeight: '600' }}>職務加給 (NT$)</label>
                  <input type="number" required value={addPayRoleAllowance} onChange={(e) => setAddPayRoleAllowance(Number(e.target.value))} style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px' }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '13px', fontWeight: '600' }}>考核加給 (NT$)</label>
                  <input type="number" required value={addPayEvaluationAllowance} onChange={(e) => setAddPayEvaluationAllowance(Number(e.target.value))} style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px' }} />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '13px', fontWeight: '600' }}>全勤獎金 (NT$)</label>
                  <input type="number" required value={addPayAttendanceBonus} onChange={(e) => setAddPayAttendanceBonus(Number(e.target.value))} style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px' }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '13px', fontWeight: '600' }}>其他津貼 (NT$)</label>
                  <input type="number" required value={addPayOtherAllowance} onChange={(e) => setAddPayOtherAllowance(Number(e.target.value))} style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px' }} />
                </div>
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

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '13px', fontWeight: '600' }}>行政獎金 (NT$)</label>
                  <input type="number" required value={addPayAdminBonus} onChange={(e) => setAddPayAdminBonus(Number(e.target.value))} style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px' }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '13px', fontWeight: '600' }}>特休結算 (NT$)</label>
                  <input type="number" required value={addPayAnnualLeavePayoff} onChange={(e) => setAddPayAnnualLeavePayoff(Number(e.target.value))} style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px' }} />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '13px', fontWeight: '600' }}>上月補發 (NT$)</label>
                  <input type="number" required value={addPayRetroactivePay} onChange={(e) => setAddPayRetroactivePay(Number(e.target.value))} style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px' }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '13px', fontWeight: '600' }}>遲到扣款 (NT$)</label>
                  <input type="number" required value={addPayLateDeduction} onChange={(e) => setAddPayLateDeduction(Number(e.target.value))} style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px' }} />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '13px', fontWeight: '600' }}>勞保自付額 (NT$)</label>
                  <input type="number" required value={addPayEmployeeLabor} onChange={(e) => setAddPayEmployeeLabor(Number(e.target.value))} style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px' }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '13px', fontWeight: '600' }}>健保自付額 (NT$)</label>
                  <input type="number" required value={addPayEmployeeNhi} onChange={(e) => setAddPayEmployeeNhi(Number(e.target.value))} style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px' }} />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '13px', fontWeight: '600' }}>請假/曠職扣款 (NT$)</label>
                  <input type="number" required value={addPayLeaveDeduction} onChange={(e) => setAddPayLeaveDeduction(Number(e.target.value))} style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px' }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '13px', fontWeight: '600' }}>代扣所得稅 (NT$)</label>
                  <input type="number" required value={addPayWithholdingTax} onChange={(e) => setAddPayWithholdingTax(Number(e.target.value))} style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px' }} />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '13px', fontWeight: '600' }}>保費調整 (NT$)</label>
                  <input type="number" required value={addPayInsuranceAdjustment} onChange={(e) => setAddPayInsuranceAdjustment(Number(e.target.value))} style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px' }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '13px', fontWeight: '600' }}>其他扣款 (NT$)</label>
                  <input type="number" required value={addPayOtherDeductions} onChange={(e) => setAddPayOtherDeductions(Number(e.target.value))} style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px' }} />
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '13px', fontWeight: '600' }}>勞退自提 (NT$)</label>
                <input type="number" required value={addPayPensionVoluntary} onChange={(e) => setAddPayPensionVoluntary(Number(e.target.value))} style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px' }} />
              </div>

              <div style={{ fontSize: '13px', fontWeight: '700', borderBottom: '1px solid #e5e7eb', paddingBottom: '4px', marginTop: '10px', color: 'var(--primary)' }}>
                考勤統計資料
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '13px', fontWeight: '600' }}>遲到時數（分鐘）</label>
                  <input type="number" required value={addPayLateMinutes} onChange={(e) => setAddPayLateMinutes(Number(e.target.value))} style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px' }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '13px', fontWeight: '600' }}>請假時數</label>
                  <input type="number" required value={addPayLeaveHours} onChange={(e) => setAddPayLeaveHours(Number(e.target.value))} style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px' }} />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '13px', fontWeight: '600' }}>未打卡次數</label>
                  <input type="number" required value={addPayMissedPunches} onChange={(e) => setAddPayMissedPunches(Number(e.target.value))} style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px' }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '13px', fontWeight: '600' }}>平日加班時數</label>
                  <input type="number" required value={addPayWeekdayOvertime} onChange={(e) => setAddPayWeekdayOvertime(Number(e.target.value))} style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px' }} />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '13px', fontWeight: '600' }}>休息日加班時數</label>
                  <input type="number" required value={addPayRestDayOvertime} onChange={(e) => setAddPayRestDayOvertime(Number(e.target.value))} style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px' }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '13px', fontWeight: '600' }}>節日加班時數</label>
                  <input type="number" required value={addPayHolidayOvertime} onChange={(e) => setAddPayHolidayOvertime(Number(e.target.value))} style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px' }} />
                </div>
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

      {/* Edit Payroll Modal */}
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

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '13px', fontWeight: '600' }}>職務加給 (NT$)</label>
                  <input type="number" required value={editPayRoleAllowance} onChange={(e) => setEditPayRoleAllowance(Number(e.target.value))} style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px' }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '13px', fontWeight: '600' }}>考核加給 (NT$)</label>
                  <input type="number" required value={editPayEvaluationAllowance} onChange={(e) => setEditPayEvaluationAllowance(Number(e.target.value))} style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px' }} />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '13px', fontWeight: '600' }}>全勤獎金 (NT$)</label>
                  <input type="number" required value={editPayAttendanceBonus} onChange={(e) => setEditPayAttendanceBonus(Number(e.target.value))} style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px' }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '13px', fontWeight: '600' }}>其他津貼 (NT$)</label>
                  <input type="number" required value={editPayOtherAllowance} onChange={(e) => setEditPayOtherAllowance(Number(e.target.value))} style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px' }} />
                </div>
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

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '13px', fontWeight: '600' }}>行政獎金 (NT$)</label>
                  <input type="number" required value={editPayAdminBonus} onChange={(e) => setEditPayAdminBonus(Number(e.target.value))} style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px' }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '13px', fontWeight: '600' }}>特休結算 (NT$)</label>
                  <input type="number" required value={editPayAnnualLeavePayoff} onChange={(e) => setEditPayAnnualLeavePayoff(Number(e.target.value))} style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px' }} />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '13px', fontWeight: '600' }}>上月補發 (NT$)</label>
                  <input type="number" required value={editPayRetroactivePay} onChange={(e) => setEditPayRetroactivePay(Number(e.target.value))} style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px' }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '13px', fontWeight: '600' }}>遲到扣款 (NT$)</label>
                  <input type="number" required value={editPayLateDeduction} onChange={(e) => setEditPayLateDeduction(Number(e.target.value))} style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px' }} />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '13px', fontWeight: '600' }}>勞保自付額 (NT$)</label>
                  <input type="number" required value={editPayEmployeeLabor} onChange={(e) => setEditPayEmployeeLabor(Number(e.target.value))} style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px' }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '13px', fontWeight: '600' }}>健保自付額 (NT$)</label>
                  <input type="number" required value={editPayEmployeeNhi} onChange={(e) => setEditPayEmployeeNhi(Number(e.target.value))} style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px' }} />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '13px', fontWeight: '600' }}>請假/曠職扣款 (NT$)</label>
                  <input type="number" required value={editPayLeaveDeduction} onChange={(e) => setEditPayLeaveDeduction(Number(e.target.value))} style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px' }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '13px', fontWeight: '600' }}>代扣所得稅 (NT$)</label>
                  <input type="number" required value={editPayWithholdingTax} onChange={(e) => setEditPayWithholdingTax(Number(e.target.value))} style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px' }} />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '13px', fontWeight: '600' }}>保費調整 (NT$)</label>
                  <input type="number" required value={editPayInsuranceAdjustment} onChange={(e) => setEditPayInsuranceAdjustment(Number(e.target.value))} style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px' }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '13px', fontWeight: '600' }}>其他扣款 (NT$)</label>
                  <input type="number" required value={editPayOtherDeductions} onChange={(e) => setEditPayOtherDeductions(Number(e.target.value))} style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px' }} />
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '13px', fontWeight: '600' }}>勞退自提 (NT$)</label>
                <input type="number" required value={editPayPensionVoluntary} onChange={(e) => setEditPayPensionVoluntary(Number(e.target.value))} style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px' }} />
              </div>

              <div style={{ fontSize: '13px', fontWeight: '700', borderBottom: '1px solid #e5e7eb', paddingBottom: '4px', marginTop: '10px', color: 'var(--primary)' }}>
                考勤統計資料
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '13px', fontWeight: '600' }}>遲到時數（分鐘）</label>
                  <input type="number" required value={editPayLateMinutes} onChange={(e) => setEditPayLateMinutes(Number(e.target.value))} style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px' }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '13px', fontWeight: '600' }}>請假時數</label>
                  <input type="number" required value={editPayLeaveHours} onChange={(e) => setEditPayLeaveHours(Number(e.target.value))} style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px' }} />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '13px', fontWeight: '600' }}>未打卡次數</label>
                  <input type="number" required value={editPayMissedPunches} onChange={(e) => setEditPayMissedPunches(Number(e.target.value))} style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px' }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '13px', fontWeight: '600' }}>平日加班時數</label>
                  <input type="number" required value={editPayWeekdayOvertime} onChange={(e) => setEditPayWeekdayOvertime(Number(e.target.value))} style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px' }} />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '13px', fontWeight: '600' }}>休息日加班時數</label>
                  <input type="number" required value={editPayRestDayOvertime} onChange={(e) => setEditPayRestDayOvertime(Number(e.target.value))} style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px' }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '13px', fontWeight: '600' }}>節日加班時數</label>
                  <input type="number" required value={editPayHolidayOvertime} onChange={(e) => setEditPayHolidayOvertime(Number(e.target.value))} style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px' }} />
                </div>
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
    </div>
  );
};
