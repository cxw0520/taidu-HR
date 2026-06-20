import React, { useState, useEffect, useMemo } from 'react';
import { useAdminData } from '../context/AdminDataContext';

import { isOffShift } from '../utils/taiwanHrEngine';

const Scheduler: React.FC = () => {
  const {
    employees,
    schedules,
    shifts,
    holidays,
    leaves,
    addSchedule,
    updateSchedule,
    deleteSchedule,
    publishSchedules,
    unpublishSchedules
  } = useAdminData();

  // Calendar Year / Month State
  const todayDate = new Date();
  const [viewYear, setViewYear] = useState<number>(todayDate.getFullYear());
  const [viewMonth, setViewMonth] = useState<number>(todayDate.getMonth() + 1);

  // Filters State
  const [calendarEmpFilter, setCalendarEmpFilter] = useState<string>('all');
  const [calendarHideOff, setCalendarHideOff] = useState<boolean>(false);
  const [calendarCompactMode, setCalendarCompactMode] = useState<boolean>(false);

  // Quick Schedule State
  const [isQuickSchedMode, setIsQuickSchedMode] = useState<boolean>(false);
  const [quickSchedEmpId, setQuickSchedEmpId] = useState<string>('');
  const [quickSchedShift, setQuickSchedShift] = useState<string>('');
  const [quickSchedStatus, setQuickSchedStatus] = useState<string>('已確認');

  // Add Schedule Modal
  const [showScheduleModal, setShowScheduleModal] = useState<boolean>(false);
  const [schedEmployeeId, setSchedEmployeeId] = useState<string>('');
  const [schedDate, setSchedDate] = useState<string>('');
  const [schedShift, setSchedShift] = useState<string>('');
  const [creatingSchedule, setCreatingSchedule] = useState<boolean>(false);
  const [schedError, setSchedError] = useState<string>('');
  const [schedSuccess, setSchedSuccess] = useState<string>('');

  // Edit Schedule Modal
  const [showEditScheduleModal, setShowEditScheduleModal] = useState<boolean>(false);
  const [editScheduleId, setEditScheduleId] = useState<string>('');
  const [editSchedEmployeeId, setEditSchedEmployeeId] = useState<string>('');
  const [editSchedDate, setEditSchedDate] = useState<string>('');
  const [editSchedShift, setEditSchedShift] = useState<string>('');
  const [editSchedStatus, setEditSchedStatus] = useState<string>('已確認');

  // Initialize Default Shifts in Dropdown
  useEffect(() => {
    if (shifts.length > 0) {
      const firstShiftStr = `${shifts[0].name} (${shifts[0].startTime} - ${shifts[0].endTime})`;
      setSchedShift(firstShiftStr);
      setQuickSchedShift(firstShiftStr);
    }
  }, [shifts]);

  // Set default employee for quick schedule when enabled
  useEffect(() => {
    if (isQuickSchedMode && employees.length > 0 && !quickSchedEmpId) {
      setQuickSchedEmpId(employees[0].id);
    }
  }, [isQuickSchedMode, employees, quickSchedEmpId]);

  // 1. Calendar Helper calculations
  const daysInMonth = useMemo(() => new Date(viewYear, viewMonth, 0).getDate(), [viewYear, viewMonth]);
  const firstDayOfWeek = useMemo(() => new Date(viewYear, viewMonth - 1, 1).getDay(), [viewYear, viewMonth]);

  const cells = useMemo(() => {
    const list: (number | null)[] = [];
    for (let i = 0; i < firstDayOfWeek; i++) {
      list.push(null);
    }
    for (let d = 1; d <= daysInMonth; d++) {
      list.push(d);
    }
    return list;
  }, [firstDayOfWeek, daysInMonth]);

  // Month navigation
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

  // 2. Schedule Warnings Alg (七休一 + 11小時輪班間隔)
  const checkScheduleWarnings = (empId: string, dateStr: string, shiftStr: string): string[] => {
    const warnings: string[] = [];

    // (1) Please conflict
    const hasApprovedLeave = leaves.some(
      l => l.employeeId === empId && l.status === 'approved' &&
           l.startDate <= dateStr && l.endDate >= dateStr
    );
    if (hasApprovedLeave) {
      warnings.push('⚠️ 請假衝突：該員工此日已有核准的請假紀錄！');
    }

    if (isOffShift(shiftStr)) {
      return warnings;
    }

    // (2) 7-1 Rule
    const empSchedules = schedules.filter(s => s.employeeId === empId && !isOffShift(s.shift));
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

    // (3) Shift Gap
    const parseShiftEnd = (shift: string): number | null => {
      const match = shift.match(/(\d{1,2}):(\d{2})\s*\)\s*$/);
      if (!match) return null;
      return parseInt(match[1]) + parseInt(match[2]) / 60;
    };
    const parseShiftStart = (shift: string): number | null => {
      const match = shift.match(/\((\d{1,2}):(\d{2})/);
      if (!match) return null;
      return parseInt(match[1]) + parseInt(match[2]) / 60;
    };
    const prevDay = new Date(dateStr);
    prevDay.setDate(prevDay.getDate() - 1);
    const prevDayStr = prevDay.toLocaleDateString('sv');
    const prevSched = empSchedules.find((s: any) => s.date === prevDayStr);
    if (prevSched) {
      let prevEnd = parseShiftEnd(prevSched.shift) ?? 18;
      const todayStart = parseShiftStart(shiftStr) ?? 9;
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

  // Quick Schedule Add/Delete (Toggle)
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
    const existing = schedules.find(s => s.employeeId === quickSchedEmpId && s.date === dateStr);
    
    if (existing) {
      if (existing.id === '1' || existing.id === '2') {
        alert('模擬排班無法刪除。');
        return;
      }
      if (window.confirm(`${emp.name} 在 ${dateStr} 已經有排班 (${existing.shift})，確定要刪除此排班嗎？`)) {
        try {
          await deleteSchedule(existing.id);
        } catch (err) {
          console.error(err);
        }
      }
      return;
    }

    try {
      const warnings = checkScheduleWarnings(quickSchedEmpId, dateStr, currentShift);
      if (warnings.length > 0) {
        const proceed = window.confirm(
          '⚠️ 排班防呆警示：\n\n' + warnings.join('\n') + '\n\n您確定仍要建立此排班嗎？'
        );
        if (!proceed) return;
      }
      await addSchedule({
        empName: emp.name,
        employeeId: quickSchedEmpId,
        date: dateStr,
        shift: currentShift,
        status: quickSchedStatus || '已確認',
        timestamp: Date.now()
      });
    } catch (err) {
      console.error(err);
      alert('建立排班失敗');
    }
  };

  const handleCreateScheduleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSchedError('');
    setSchedSuccess('');
    setCreatingSchedule(true);

    if (!schedEmployeeId) {
      setSchedError('請選擇員工');
      setCreatingSchedule(false);
      return;
    }
    if (!schedDate) {
      setSchedError('請選擇日期');
      setCreatingSchedule(false);
      return;
    }

    const emp = employees.find(e => e.id === schedEmployeeId);
    if (!emp) {
      setSchedError('找不到該員工資料');
      setCreatingSchedule(false);
      return;
    }

    const targetDate = schedDate;
    const existing = schedules.find(s => s.employeeId === schedEmployeeId && s.date === targetDate);
    if (existing) {
      setSchedError(`該員工在 ${targetDate} 已有排班 (${existing.shift})`);
      setCreatingSchedule(false);
      return;
    }

    try {
      const warnings = checkScheduleWarnings(schedEmployeeId, targetDate, schedShift);
      if (warnings.length > 0) {
        const proceed = window.confirm(
          '⚠️ 排班防呆警示：\n\n' + warnings.join('\n') + '\n\n您確定仍要建立此排班嗎？'
        );
        if (!proceed) {
          setCreatingSchedule(false);
          return;
        }
      }

      await addSchedule({
        employeeId: schedEmployeeId,
        empName: emp.name,
        date: targetDate,
        shift: schedShift,
        status: '已確認',
        timestamp: Date.now()
      });

      setSchedSuccess('排班建立成功！');
      setTimeout(() => {
        setShowScheduleModal(false);
        setSchedSuccess('');
        setSchedEmployeeId('');
      }, 1000);
    } catch (err: any) {
      console.error(err);
      setSchedError(err.message || '排班失敗，請重試');
    } finally {
      setCreatingSchedule(false);
    }
  };

  const handleOpenEditSchedule = (sched: any) => {
    if (sched.id === '1' || sched.id === '2') {
      alert('模擬資料無法編輯。請新增真實資料以測試完整編輯功能。');
      return;
    }
    setEditScheduleId(sched.id);
    setEditSchedEmployeeId(sched.employeeId);
    setEditSchedDate(sched.date);
    setEditSchedShift(sched.shift);
    setEditSchedStatus(sched.status);
    setShowEditScheduleModal(true);
  };

  const handleUpdateScheduleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const warnings = checkScheduleWarnings(editSchedEmployeeId, editSchedDate, editSchedShift);
      if (warnings.length > 0) {
        const proceed = window.confirm(
          '⚠️ 排班防呆警示：\n\n' + warnings.join('\n') + '\n\n您確定仍要更新此排班嗎？'
        );
        if (!proceed) return;
      }

      const emp = employees.find(e => e.id === editSchedEmployeeId);
      const empName = emp ? emp.name : '未知員工';

      await updateSchedule(editScheduleId, {
        employeeId: editSchedEmployeeId,
        empName: empName,
        date: editSchedDate,
        shift: editSchedShift,
        status: editSchedStatus
      });
      setShowEditScheduleModal(false);
    } catch (err) {
      console.error(err);
      alert('排班修改失敗');
    }
  };

  const handleDeleteScheduleClick = async (id: string) => {
    if (id === '1' || id === '2') {
      alert('模擬資料無法刪除。');
      return;
    }
    if (!window.confirm('確定要刪除此筆排班嗎？')) return;
    try {
      await deleteSchedule(id);
      setShowEditScheduleModal(false);
    } catch (err) {
      console.error(err);
      alert('刪除失敗');
    }
  };

  const handlePublishClick = async () => {
    if (window.confirm(`確定要發佈 ${viewYear} 年 ${viewMonth} 月的全部班表嗎？`)) {
      try {
        await publishSchedules(viewYear, viewMonth);
        alert('班表已成功發佈，員工現在可在前台查看！');
      } catch (err) {
        console.error(err);
        alert('發佈失敗');
      }
    }
  };

  const handleUnpublishClick = async () => {
    if (window.confirm(`確定要取消發佈 ${viewYear} 年 ${viewMonth} 月的全部班表嗎？`)) {
      try {
        await unpublishSchedules(viewYear, viewMonth);
        alert('已取消發佈，員工在前台將無法檢視此月份班表。');
      } catch (err) {
        console.error(err);
        alert('取消發佈失敗');
      }
    }
  };

  return (
    <div className="schedule-layout">
      {/* 1. 控制面板 */}
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
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', backgroundColor: isQuickSchedMode ? 'rgba(79, 70, 229, 0.1)' : 'transparent', padding: '6px 12px', borderRadius: '8px', border: `1px solid ${isQuickSchedMode ? 'rgba(79, 70, 229, 0.2)' : 'var(--border)'}`, transition: 'all 0.2s' }}>
              <input 
                type="checkbox" 
                checked={isQuickSchedMode} 
                onChange={(e) => setIsQuickSchedMode(e.target.checked)}
                style={{ cursor: 'pointer' }}
              />
              <span style={{ fontSize: '13px', fontWeight: '700', color: isQuickSchedMode ? 'var(--primary)' : 'var(--text-muted)' }}>⚡ 啟用快速排班模式</span>
            </label>
            
            <button className="btn-primary btn-sm" onClick={() => {
              setSchedDate(`${viewYear}-${String(viewMonth).padStart(2, '0')}-${String(new Date().getDate()).padStart(2, '0')}`);
              setShowScheduleModal(true);
            }}>+ 新增排班</button>
            <button className="btn-primary btn-sm" onClick={handlePublishClick} style={{ backgroundColor: '#10b981' }}>
              📢 發佈本月班表
            </button>
            <button className="btn-primary btn-sm" onClick={handleUnpublishClick} style={{ backgroundColor: '#ef4444' }}>
              🔕 取消發佈本月班表
            </button>
          </div>
        </div>

        {/* 篩選條件面板 */}
        <div style={{ display: 'flex', gap: '16px', padding: '12px 16px', borderRadius: '10px', backgroundColor: '#f8fafc', border: '1px solid var(--border)', flexWrap: 'wrap', alignItems: 'center', marginTop: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-main)' }}>🔍 篩選與檢視設定：</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>員工篩選：</span>
            <select
              value={calendarEmpFilter}
              onChange={(e) => setCalendarEmpFilter(e.target.value)}
              style={{ padding: '4px 8px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '13px', backgroundColor: '#fff' }}
            >
              <option value="all">顯示全部員工</option>
              {employees.map(emp => (
                <option key={emp.id} value={emp.id}>{emp.name} ({emp.salaryType === 'hourly' ? '工讀' : '正職'})</option>
              ))}
            </select>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', userSelect: 'none' }}>
            <input
              type="checkbox"
              checked={calendarHideOff}
              onChange={(e) => setCalendarHideOff(e.target.checked)}
              style={{ cursor: 'pointer' }}
            />
            <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>🏖️ 隱藏休假/例假人員</span>
          </label>

          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', userSelect: 'none', marginLeft: 'auto' }}>
            <input
              type="checkbox"
              checked={calendarCompactMode}
              onChange={(e) => setCalendarCompactMode(e.target.checked)}
              style={{ cursor: 'pointer' }}
            />
            <span style={{ fontSize: '13px', fontWeight: '600', color: 'var(--primary)' }}>📊 啟用日曆精簡顯示模式</span>
          </label>
        </div>

        {/* 快速排班面板 */}
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
                <optgroup label="一般工作班別">
                  {shifts.map((s, idx) => {
                    const val = `${s.name} (${s.startTime} - ${s.endTime})`;
                    return <option key={idx} value={val}>{val}</option>;
                  })}
                </optgroup>
                <optgroup label="排休設定">
                  <option value="例假">例假 (L)</option>
                  <option value="休假">休假 (S)</option>
                  <option value="國定假日">國定假日 (H)</option>
                </optgroup>
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

      {/* 2. 日曆主體 */}
      <div className="calendar-stats-container" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
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
                
                // Raw Day Schedules (for manpower summary, ignoring UI filters)
                const rawDaySchedules = schedules.filter(s => s.date === dateString);

                // Apply UI filters
                let filteredDayScheds = rawDaySchedules;
                if (calendarEmpFilter !== 'all') {
                  filteredDayScheds = filteredDayScheds.filter(s => s.employeeId === calendarEmpFilter);
                }
                if (calendarHideOff) {
                  filteredDayScheds = filteredDayScheds.filter(s => !isOffShift(s.shift));
                }

                // Daily Manpower count: excludes off days
                const workingManpowerCount = rawDaySchedules.filter(s => !isOffShift(s.shift)).length;

                // Split work shifts and off days for flow styling
                const workScheds = filteredDayScheds.filter(s => !isOffShift(s.shift));
                const offScheds = filteredDayScheds.filter(s => isOffShift(s.shift));
                
                // Color formatting
                let cellBg = '#ffffff';
                let dateColor = 'var(--text-main)';
                let dayLabel = '';
                let badgeBg = '#fde68a';
                let badgeText = '#92400e';

                if (movedHoliday) {
                  cellBg = '#f3e8ff';
                  dateColor = '#7c3aed';
                  dayLabel = `🔄 ${movedHoliday.name} (月薪挪移假)`;
                  badgeBg = '#d8b4fe';
                  badgeText = '#581c87';
                } else if (origHoliday) {
                  cellBg = '#fee2e2';
                  dateColor = '#ef4444';
                  dayLabel = origHoliday.movedDate !== origHoliday.date ? `🎉 ${origHoliday.name} (原)` : `🎉 ${origHoliday.name}`;
                  badgeBg = '#fca5a5';
                  badgeText = '#991b1b';
                } else if (dayOfWeek === 0) {
                  cellBg = '#fff5f5';
                  dateColor = '#ef4444';
                } else if (dayOfWeek === 6) {
                  cellBg = '#fef3c7';
                  dateColor = '#d97706';
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
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: '700', fontSize: '14px', color: dateColor }}>{day}</span>
                      {dayLabel && (
                        <span style={{ fontSize: '9px', fontWeight: '700', padding: '1px 3px', borderRadius: '4px', backgroundColor: badgeBg, color: badgeText, whiteSpace: 'nowrap' }}>
                          {dayLabel}
                        </span>
                      )}
                    </div>

                    <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '2px' }}>
                      今日：{workingManpowerCount} 人
                    </div>

                    {/* Work shifts Prioritized */}
                    <div className="day-schedules-list" style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: calendarCompactMode ? '2px' : '3px',
                      overflowY: 'auto',
                      flex: 1,
                      paddingRight: '2px'
                    }}>
                      {workScheds.map(sched => {
                        let bg = sched.status === '已確認' ? 'rgba(16, 185, 129, 0.12)' : 'rgba(245, 158, 11, 0.12)';
                        let txt = sched.status === '已確認' ? '#065f46' : '#92400e';
                        let borderCol = sched.status === '已確認' ? 'rgba(16, 185, 129, 0.25)' : 'rgba(245, 158, 11, 0.25)';

                        const displayName = calendarCompactMode 
                          ? (sched.empName.length > 2 ? sched.empName.slice(1) : sched.empName) 
                          : sched.empName;
                        const displayShift = calendarCompactMode 
                          ? sched.shift.split(' ')[0].charAt(0) 
                          : sched.shift.split(' ')[0];

                        return (
                          <div 
                            key={sched.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenEditSchedule(sched);
                            }}
                            style={{
                              fontSize: calendarCompactMode ? '10px' : '11px',
                              fontWeight: '600',
                              backgroundColor: bg,
                              color: txt,
                              border: `1px solid ${borderCol}`,
                              borderRadius: '4px',
                              padding: calendarCompactMode ? '1px 3px' : '2px 4px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              cursor: 'pointer',
                              lineHeight: '1.2'
                            }}
                          >
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={`${sched.empName} (${sched.shift})`}>
                              {displayName} ({displayShift})
                            </span>
                            {!calendarCompactMode && (
                              <span 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteScheduleClick(sched.id);
                                }}
                                style={{ fontSize: '12px', fontWeight: '800', marginLeft: '4px', color: '#ef4444', cursor: 'pointer', padding: '0 2px' }}
                                title="刪除排班"
                              >
                                ×
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* Off-duty days circular badges placed at bottom */}
                    {offScheds.length > 0 && (
                      <div className="day-off-list" style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: '3px',
                        marginTop: 'auto',
                        paddingTop: '4px',
                        borderTop: '1px dashed #e2e8f0'
                      }}>
                        {offScheds.map(sched => {
                          let bg = '#fee2e2';
                          let txt = '#b91c1c';
                          let borderCol = '#fecdd3';
                          let typeChar = 'Ⓛ';

                          if (sched.shift === '休假') {
                            bg = '#fef3c7'; txt = '#d97706'; borderCol = '#fde68a'; typeChar = 'Ⓢ';
                          } else if (sched.shift === '國定假日') {
                            bg = '#f3e8ff'; txt = '#7c3aed'; borderCol = '#e9d5ff'; typeChar = 'Ⓗ';
                          }

                          const nameChar = sched.empName.charAt(sched.empName.length - 1);

                          return (
                            <div 
                              key={sched.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenEditSchedule(sched);
                              }}
                              style={{
                                fontSize: '10px',
                                fontWeight: '700',
                                backgroundColor: bg,
                                color: txt,
                                border: `1px solid ${borderCol}`,
                                borderRadius: '12px',
                                padding: '1px 5px',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '2px',
                                cursor: 'pointer',
                                whiteSpace: 'nowrap'
                              }}
                              title={`${sched.empName} (${sched.shift})`}
                            >
                              <span style={{ fontSize: '11px', lineHeight: '1' }}>{typeChar}</span>
                              <span>{nameChar}</span>
                              {!calendarCompactMode && (
                                <span 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteScheduleClick(sched.id);
                                  }}
                                  style={{ fontSize: '10px', fontWeight: '800', marginLeft: '2px', color: '#ef4444', cursor: 'pointer' }}
                                  title="刪除"
                                >
                                  ×
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {!isQuickSchedMode && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSchedDate(dateString);
                          setShowScheduleModal(true);
                        }}
                        style={{ position: 'absolute', right: '6px', bottom: '6px', width: '18px', height: '18px', borderRadius: '50%', backgroundColor: 'rgba(79, 70, 229, 0.1)', color: 'var(--primary)', fontSize: '12px', fontWeight: '800', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
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

        {/* 3. 統計表格 */}
        <div className="card">
          <div className="card-header" style={{ borderBottom: '1px solid var(--border)', paddingBottom: '12px', marginBottom: '16px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: '700', color: 'var(--primary)' }}>📊 員工排班與休假統計 ({viewYear} 年 {viewMonth} 月)</h3>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>* 餐飲業排假模式：月薪員工應休天數以當月紅字（例假＋休假＋假日）計算，並按類別統計；時薪工讀為彈性排班不設限制。</span>
          </div>

          {(() => {
            let monthlyHolidaysCount = 0;
            for (let d = 1; d <= daysInMonth; d++) {
              const dateStr = `${viewYear}-${String(viewMonth).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
              if (holidays.some(h => h.movedDate ? h.movedDate === dateStr : h.date === dateStr)) {
                monthlyHolidaysCount++;
              }
            }
            const hasMonthlyHolidays = monthlyHolidaysCount > 0;

            return (
              <div className="table-responsive">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th rowSpan={2} style={{ verticalAlign: 'middle' }}>員工姓名</th>
                      <th rowSpan={2} style={{ verticalAlign: 'middle' }}>職位職稱</th>
                      <th rowSpan={2} style={{ verticalAlign: 'middle' }}>應排工作天</th>
                      <th rowSpan={2} style={{ verticalAlign: 'middle' }}>已排工作天</th>
                      <th rowSpan={2} style={{ verticalAlign: 'middle' }}>還需排工作天</th>
                      <th colSpan={4} style={{ textAlign: 'center', backgroundColor: '#f3f4f6', color: 'var(--primary)', fontWeight: '700' }}>休假日</th>
                    </tr>
                    <tr>
                      <th style={{ backgroundColor: '#f9fafb' }}>假別</th>
                      <th style={{ backgroundColor: '#f9fafb' }}>應排</th>
                      <th style={{ backgroundColor: '#f9fafb' }}>已排</th>
                      <th style={{ backgroundColor: '#f9fafb' }}>剩餘</th>
                    </tr>
                  </thead>
                  <tbody>
                    {employees.map(emp => {
                      const empMonthScheds = schedules.filter(s => 
                        s.employeeId === emp.id && 
                        s.date && 
                        s.date.startsWith(`${viewYear}-${String(viewMonth).padStart(2, '0')}`)
                      );
                      const isHourly = emp.salaryType === 'hourly';

                      let targetSundays = 0;
                      let targetSaturdays = 0;
                      let targetHolidays = 0;
                      
                      for (let d = 1; d <= daysInMonth; d++) {
                        const dateStr = `${viewYear}-${String(viewMonth).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                        const dayOfWeek = new Date(viewYear, viewMonth - 1, d).getDay();
                        const isMonthlyHoliday = holidays.some(h => h.movedDate ? h.movedDate === dateStr : h.date === dateStr);
                        
                        if (isMonthlyHoliday) {
                          targetHolidays++;
                        } else if (dayOfWeek === 0) {
                          targetSundays++;
                        } else if (dayOfWeek === 6) {
                          targetSaturdays++;
                        }
                      }

                      const personalTargetWorkDays = daysInMonth - (targetSundays + targetSaturdays + targetHolidays);
                      const scheduledWorkDays = empMonthScheds.filter(s => !isOffShift(s.shift)).length;
                      const remainingWorkDays = personalTargetWorkDays - scheduledWorkDays;

                      const scheduledRegularOff = empMonthScheds.filter(s => s.shift === '例假').length;
                      const scheduledRestOff = empMonthScheds.filter(s => s.shift === '休假').length;
                      const scheduledHolidayOff = empMonthScheds.filter(s => s.shift === '國定假日').length;

                      if (isHourly) {
                        return (
                          <tr key={emp.id}>
                            <td data-label="員工姓名" style={{ fontWeight: '600' }}>{emp.name}</td>
                            <td data-label="職位職稱">{emp.role}</td>
                            <td data-label="應排工作天"><span style={{ color: 'var(--text-muted)' }}>時薪工讀</span></td>
                            <td data-label="已排工作天"><span style={{ fontWeight: '700' }}>{scheduledWorkDays} 天</span></td>
                            <td data-label="還需排工作天"><span style={{ color: 'var(--text-muted)' }}>彈性排班</span></td>
                            <td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px', backgroundColor: '#f9fafb' }}>
                              彈性排班，不設排休限制
                            </td>
                          </tr>
                        );
                      }

                      const rowSpanVal = hasMonthlyHolidays ? 3 : 2;
                      const renderRemainingText = (remaining: number) => {
                        if (remaining === 0) {
                          return <span style={{ color: '#10b981', fontWeight: '700' }}>✓ 0</span>;
                        } else if (remaining > 0) {
                          return <span style={{ color: '#f59e0b', fontWeight: '700' }}>{remaining}</span>;
                        } else {
                          return <span style={{ color: '#ef4444', fontWeight: '700' }}>多排 {Math.abs(remaining)}</span>;
                        }
                      };

                      return (
                        <React.Fragment key={emp.id}>
                          <tr>
                            <td rowSpan={rowSpanVal} data-label="員工姓名" style={{ fontWeight: '600', verticalAlign: 'middle' }}>{emp.name}</td>
                            <td rowSpan={rowSpanVal} data-label="職位職稱" style={{ verticalAlign: 'middle' }}>{emp.role}</td>
                            <td rowSpan={rowSpanVal} data-label="應排工作天" style={{ verticalAlign: 'middle' }}>{`${personalTargetWorkDays} 天`}</td>
                            <td rowSpan={rowSpanVal} data-label="已排工作天" style={{ verticalAlign: 'middle' }}>
                              <span style={{ fontWeight: '700', color: scheduledWorkDays === personalTargetWorkDays ? '#10b981' : (scheduledWorkDays > personalTargetWorkDays ? '#3b82f6' : '#f59e0b') }}>
                                {scheduledWorkDays} 天
                              </span>
                            </td>
                            <td rowSpan={rowSpanVal} data-label="還需排工作天" style={{ verticalAlign: 'middle' }}>
                              {remainingWorkDays === 0 ? (
                                <span style={{ color: '#10b981', fontWeight: '600' }}>✓ 已排滿</span>
                              ) : remainingWorkDays > 0 ? (
                                <span style={{ color: '#f59e0b', fontWeight: '600' }}>還差 {remainingWorkDays} 天</span>
                              ) : (
                                <span style={{ color: '#3b82f6', fontWeight: '600' }}>超排 {Math.abs(remainingWorkDays)} 天</span>
                              )}
                            </td>
                            <td data-label="假別" style={{ fontWeight: '600', color: '#b91c1c', backgroundColor: '#fef2f2' }}>例假 (L)</td>
                            <td data-label="應排">{targetSundays} 天</td>
                            <td data-label="已排" style={{ color: '#2563eb', fontWeight: '600' }}>{scheduledRegularOff} 天</td>
                            <td data-label="剩餘">{renderRemainingText(targetSundays - scheduledRegularOff)}</td>
                          </tr>
                          <tr>
                            <td data-label="假別" style={{ fontWeight: '600', color: '#d97706', backgroundColor: '#fffbeb' }}>休假 (S)</td>
                            <td data-label="應排">{targetSaturdays} 天</td>
                            <td data-label="已排" style={{ color: '#2563eb', fontWeight: '600' }}>{scheduledRestOff} 天</td>
                            <td data-label="剩餘">{renderRemainingText(targetSaturdays - scheduledRestOff)}</td>
                          </tr>
                          {hasMonthlyHolidays && (
                            <tr>
                              <td data-label="假別" style={{ fontWeight: '600', color: '#7c3aed', backgroundColor: '#f5f3ff' }}>國定假日 (H)</td>
                              <td data-label="應排">{targetHolidays} 天</td>
                              <td data-label="已排" style={{ color: '#2563eb', fontWeight: '600' }}>{scheduledHolidayOff} 天</td>
                              <td data-label="剩餘">{renderRemainingText(targetHolidays - scheduledHolidayOff)}</td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            );
          })()}
        </div>
      </div>

      {/* 新增排班 Modal */}
      {showScheduleModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0, 0, 0, 0.4)', backdropFilter: 'blur(8px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
          <div className="glass-card" style={{ width: '90%', maxWidth: '450px', padding: '32px', borderRadius: '16px', backgroundColor: '#ffffff', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)' }}>
            <h3 style={{ marginBottom: '20px', color: 'var(--primary)', fontSize: '20px', fontWeight: '700' }}>新增排班</h3>
            {schedError && <div style={{ color: '#ef4444', backgroundColor: 'rgba(239, 68, 68, 0.1)', padding: '10px', borderRadius: '6px', marginBottom: '16px', fontSize: '14px' }}>⚠️ {schedError}</div>}
            {schedSuccess && <div style={{ color: '#10b981', backgroundColor: 'rgba(16, 185, 129, 0.1)', padding: '10px', borderRadius: '6px', marginBottom: '16px', fontSize: '14px' }}>✅ {schedSuccess}</div>}
            <form onSubmit={handleCreateScheduleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '13px', fontWeight: '600' }}>選擇員工</label>
                <select required value={schedEmployeeId} onChange={(e) => setSchedEmployeeId(e.target.value)} style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px', backgroundColor: '#fff' }}>
                  <option value="">-- 請選擇員工 --</option>
                  {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.name} ({emp.role})</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '13px', fontWeight: '600' }}>排班日期</label>
                <input type="date" required value={schedDate} onChange={(e) => setSchedDate(e.target.value)} style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px' }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '13px', fontWeight: '600' }}>班別時間</label>
                <select value={schedShift} onChange={(e) => setSchedShift(e.target.value)} style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px', backgroundColor: '#fff' }}>
                  <optgroup label="一般工作班別">
                    {shifts.map((s, idx) => {
                      const str = `${s.name} (${s.startTime} - ${s.endTime})`;
                      return <option key={idx} value={str}>{str}</option>;
                    })}
                  </optgroup>
                  <optgroup label="排休設定">
                    <option value="例假">例假 (L)</option>
                    <option value="休假">休假 (S)</option>
                    <option value="國定假日">國定假日 (H)</option>
                  </optgroup>
                </select>
              </div>
              <div style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
                <button type="button" onClick={() => setShowScheduleModal(false)} style={{ flex: 1, padding: '12px', borderRadius: '8px', border: '1px solid #d1d5db', backgroundColor: '#f3f4f6', cursor: 'pointer', fontWeight: '600', fontSize: '14px' }}>取消</button>
                <button type="submit" disabled={creatingSchedule} style={{ flex: 1, padding: '12px', borderRadius: '8px', border: 'none', backgroundColor: 'var(--primary)', color: '#fff', cursor: 'pointer', fontWeight: '600', fontSize: '14px' }}>
                  {creatingSchedule ? '建立中...' : '確認排班'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 編輯排班 Modal */}
      {showEditScheduleModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0, 0, 0, 0.4)', backdropFilter: 'blur(8px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
          <div className="glass-card" style={{ width: '90%', maxWidth: '450px', padding: '32px', borderRadius: '16px', backgroundColor: '#ffffff', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ margin: 0, color: 'var(--primary)', fontSize: '20px', fontWeight: '700' }}>編輯排班</h3>
              <button onClick={() => handleDeleteScheduleClick(editScheduleId)} style={{ border: 'none', backgroundColor: '#fee2e2', color: '#ef4444', padding: '6px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: '700', cursor: 'pointer' }}>
                🗑️ 刪除排班
              </button>
            </div>
            <form onSubmit={handleUpdateScheduleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '13px', fontWeight: '600' }}>選擇員工</label>
                <select required value={editSchedEmployeeId} onChange={(e) => setEditSchedEmployeeId(e.target.value)} style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px', backgroundColor: '#fff' }}>
                  {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.name} ({emp.role})</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '13px', fontWeight: '600' }}>排班日期</label>
                <input type="date" required value={editSchedDate} onChange={(e) => setEditSchedDate(e.target.value)} style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px' }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '13px', fontWeight: '600' }}>班別時間</label>
                <select value={editSchedShift} onChange={(e) => setEditSchedShift(e.target.value)} style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px', backgroundColor: '#fff' }}>
                  <optgroup label="一般工作班別">
                    {shifts.map((s, idx) => {
                      const str = `${s.name} (${s.startTime} - ${s.endTime})`;
                      return <option key={idx} value={str}>{str}</option>;
                    })}
                  </optgroup>
                  <optgroup label="排休設定">
                    <option value="例假">例假 (L)</option>
                    <option value="休假">休假 (S)</option>
                    <option value="國定假日">國定假日 (H)</option>
                  </optgroup>
                </select>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '13px', fontWeight: '600' }}>狀態</label>
                <select value={editSchedStatus} onChange={(e) => setEditSchedStatus(e.target.value)} style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px', backgroundColor: '#fff' }}>
                  <option value="待確認">待確認</option>
                  <option value="已確認">已確認</option>
                </select>
              </div>
              <div style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
                <button type="button" onClick={() => setShowEditScheduleModal(false)} style={{ flex: 1, padding: '12px', borderRadius: '8px', border: '1px solid #d1d5db', backgroundColor: '#f3f4f6', cursor: 'pointer', fontWeight: '600', fontSize: '14px' }}>取消</button>
                <button type="submit" style={{ flex: 1, padding: '12px', borderRadius: '8px', border: 'none', backgroundColor: 'var(--primary)', color: '#fff', cursor: 'pointer', fontWeight: '600', fontSize: '14px' }}>
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

export default Scheduler;
