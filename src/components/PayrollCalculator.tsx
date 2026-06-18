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
    holidays
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
  const [addPayOvertime, setAddPayOvertime] = useState<number>(0);
  const [addPayDeductions, setAddPayDeductions] = useState<number>(1200);

  // Edit payroll states
  const [showEditPayrollModal, setShowEditPayrollModal] = useState(false);
  const [editPayrollId, setEditPayrollId] = useState('');
  const [editPayEmployeeName, setEditPayEmployeeName] = useState('');
  const [editPayMonth, setEditPayMonth] = useState('');
  const [editPayBaseSalary, setEditPayBaseSalary] = useState<number>(0);
  const [editPayOvertime, setEditPayOvertime] = useState<number>(0);
  const [editPayDeductions, setEditPayDeductions] = useState<number>(0);
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
                    (p.mealAllowance || 0) + 
                    (p.attendanceBonus || 0) + 
                    (p.otherAllowance || 0) + 
                    (p.overtime || 0);
      
      const empDed = (p.employeeLabor || 0) + (p.employeeNhi || 0);
      const net = p.netSalary || 0;
      const compIns = (p.employerLabor || 0) + (p.employerNhi || 0) + (p.employerPension || 0);
      const leaveDed = p.leaveDeduction || 0;
      const laborCost = (gross - leaveDed) + compIns;

      totalGrossSalary += gross;
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

      const { calculatePayrollInsurance, calculateOvertimePay } = await import('../utils/taiwanHrEngine');

      for (const emp of employeesList) {
        const isMock = emp.id === 'EMP001' || emp.id === 'EMP002' || emp.id === 'EMP003';
        
        let monthlySalary = emp.monthlySalary || 32000;
        const salaryType = emp.salaryType || 'monthly';
        let laborSub = emp.laborSub === 0 ? 0 : (emp.laborSub || (salaryType === 'hourly' ? 11100 : 29500));
        let nhiSub = emp.nhiSub === 0 ? 0 : (emp.nhiSub || 29500);
        let pensionSub = emp.pensionSub === 0 ? 0 : (emp.pensionSub || (salaryType === 'hourly' ? 11100 : 29500));
        let onboardDateStr = emp.onboardDate || '2025-01-01';
        let resignDateStr = emp.resignDate || null;
        const nhiDependents = emp.nhiDependents || 0;
        const mealAllowance = emp.mealAllowance || 0;
        let attendanceBonus = emp.attendanceBonus || 0;
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

        // Calculate late counts and accumulated minutes for attendance bonus
        let lateCount = 0;
        let lateMinutesTotal = 0;

        empAttendance.forEach((rec: any) => {
          if (rec.type === '上班' && rec.time && rec.date) {
            const dateSched = schedulesList.find((s: any) => s.employeeId === emp.id && s.date === rec.date);
            if (dateSched) {
              let startTimeStr = dateSched.startTime || '';
              if (!startTimeStr) {
                const timeMatch = (dateSched.shift || '').match(/\((\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})\)/);
                if (timeMatch) {
                  startTimeStr = timeMatch[1];
                }
              }
              if (startTimeStr) {
                const [sh, sm] = startTimeStr.split(':').map(Number);
                const [ah, am] = rec.time.split(':').map(Number);
                const expectedInMins = sh * 60 + sm;
                const actualInMins = ah * 60 + am;
                
                const isLate = rec.status === '遲到' || (!rec.status && actualInMins > expectedInMins + 1);
                if (isLate) {
                  lateCount++;
                  lateMinutesTotal += Math.max(0, actualInMins - expectedInMins);
                }
              }
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

        let calculatedBaseSalary = isHourly ? 0 : monthlySalary;
        let overtimePay = 0;
        
        const attendanceByDate: { [date: string]: any[] } = {};
        empAttendance.forEach((rec: any) => {
          if (!rec.date) return;
          if (!attendanceByDate[rec.date]) attendanceByDate[rec.date] = [];
          attendanceByDate[rec.date].push(rec);
        });

        // 1. Calculate hourly workers' base and double holidays salary
        if (isHourly) {
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
                
                const dateSched = schedulesList.find((s: any) => s.employeeId === emp.id && s.date === date);
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

                const isOriginalHoliday = holidays.some(h => h.date === date);
                const regHours = Math.min(hours, 8);
                calculatedBaseSalary += regHours * hourlyRate;
                if (isOriginalHoliday) {
                  overtimePay += regHours * hourlyRate;
                }
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

          if (isHourly) {
            const dateSched = schedulesList.find((s: any) => s.employeeId === emp.id && s.date === req.date);
            const shiftType = dateSched ? dateSched.shift : '';

            if (shiftType === '休假') {
              overtimePay += calculateOvertimePay(hourlyRate, req.hours, 'rest');
            } else if (shiftType === '例假') {
              overtimePay += Math.round(req.hours * hourlyRate * 2.0);
            } else if (isActualHoliday) {
              overtimePay += calculateOvertimePay(hourlyRate, req.hours, 'regular');
            } else {
              overtimePay += calculateOvertimePay(hourlyRate, req.hours, 'regular');
            }
          } else {
            let dayType: 'regular' | 'rest' | 'holiday' = 'regular';
            if (isActualHoliday) {
              dayType = 'holiday';
            } else if (isCompensatoryWorkday) {
              dayType = 'regular';
            } else if (dayOfWeek === 6) {
              dayType = 'rest';
            } else if (dayOfWeek === 0) {
              dayType = 'holiday';
            }
            overtimePay += calculateOvertimePay(hourlyRate, req.hours, dayType);
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
          attendanceBonusNote,
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
            <span style={{ fontSize: '13px', color: '#64748b', fontWeight: '500' }}>應發薪資總和 (原本薪資)</span>
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
    </div>
  );
};
