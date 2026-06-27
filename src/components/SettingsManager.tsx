import React, { useState, useEffect } from 'react';
import { useAdminData } from '../context/AdminDataContext';

export const SettingsManager: React.FC = () => {
  const {
    roles,
    shifts,
    schedules,
    insuranceRates,
    toleranceMinutes,
    holidays,
    saveRoles,
    saveShifts,
    saveInsuranceRates,
    saveRules,
    saveHolidays,
    updateSchedule
  } = useAdminData();

  // Local settings save message state
  const [settingsSaveMsg, setSettingsSaveMsg] = useState({ type: '', text: '' });

  // 1. Roles State
  const [customRoleName, setCustomRoleName] = useState('');

  // 2. Shifts States
  const [newShiftName, setNewShiftName] = useState('');
  const [newShiftStart, setNewShiftStart] = useState('09:00');
  const [newShiftEnd, setNewShiftEnd] = useState('18:00');
  const [newShiftBreakStart, setNewShiftBreakStart] = useState('');
  const [newShiftBreakEnd, setNewShiftBreakEnd] = useState('');
  const [breakType, setBreakType] = useState<'time' | 'duration'>('time');
  const [newShiftBreakDuration, setNewShiftBreakDuration] = useState<number>(0);

  // Shift Edit States
  const [editingShiftIndex, setEditingShiftIndex] = useState<number | null>(null);
  const [editShiftName, setEditShiftName] = useState('');
  const [editShiftStart, setEditShiftStart] = useState('09:00');
  const [editShiftEnd, setEditShiftEnd] = useState('18:00');
  const [editShiftBreakStart, setEditShiftBreakStart] = useState('');
  const [editShiftBreakEnd, setEditShiftBreakEnd] = useState('');
  const [editBreakType, setEditBreakType] = useState<'time' | 'duration'>('time');
  const [editShiftBreakDuration, setEditShiftBreakDuration] = useState<number>(0);

  // 3. Insurance & Rules Form States
  const [cfgLaborRate, setCfgLaborRate] = useState(0.12);
  const [cfgNhiRate, setCfgNhiRate] = useState(0.0517);
  const [cfgNhiAvgDeps, setCfgNhiAvgDeps] = useState(0.56);
  const [cfgEmpLaborRatio, setCfgEmpLaborRatio] = useState(0.2);
  const [cfgEmprLaborRatio, setCfgEmprLaborRatio] = useState(0.7);
  const [cfgEmpNhiRatio, setCfgEmpNhiRatio] = useState(0.3);
  const [cfgEmprNhiRatio, setCfgEmprNhiRatio] = useState(0.6);
  const [cfgToleranceMinutes, setCfgToleranceMinutes] = useState(240);

  // 4. Holidays States
  const [newHolidayName, setNewHolidayName] = useState('');
  const [newHolidayDate, setNewHolidayDate] = useState('');
  const [newHolidayMovedDate, setNewHolidayMovedDate] = useState('');
  const [syncingHolidays, setSyncingHolidays] = useState(false);

  // Sync form states from context changes
  useEffect(() => {
    if (insuranceRates) {
      setCfgLaborRate(insuranceRates.laborRate ?? 0.12);
      setCfgNhiRate(insuranceRates.nhiRate ?? 0.0517);
      setCfgNhiAvgDeps(insuranceRates.nhiAvgDependents ?? 0.56);
      setCfgEmpLaborRatio(insuranceRates.employeeLaborRatio ?? 0.2);
      setCfgEmprLaborRatio(insuranceRates.employerLaborRatio ?? 0.7);
      setCfgEmpNhiRatio(insuranceRates.employeeNhiRatio ?? 0.3);
      setCfgEmprNhiRatio(insuranceRates.employerNhiRatio ?? 0.6);
    }
  }, [insuranceRates]);

  useEffect(() => {
    if (toleranceMinutes !== undefined) {
      setCfgToleranceMinutes(toleranceMinutes);
    }
  }, [toleranceMinutes]);

  // Roles Handlers
  const handleAddCustomRole = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanRoleName = customRoleName.trim();
    if (cleanRoleName) {
      if (!roles.includes(cleanRoleName)) {
        const updatedRoles = [...roles, cleanRoleName];
        try {
          await saveRoles(updatedRoles);
          setCustomRoleName('');
          alert(`✅ 職位「${cleanRoleName}」已成功新增！`);
        } catch (err) {
          console.error("Failed to save roles:", err);
          alert('新增失敗');
        }
      } else {
        alert('該職務名稱已存在');
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
    try {
      await saveRoles(updatedRoles);
    } catch (err) {
      console.error("Failed to delete role:", err);
      alert('刪除失敗');
    }
  };

  // Shifts Handlers
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
      breakStartTime: breakType === 'time' ? newShiftBreakStart.trim() : '',
      breakEndTime: breakType === 'time' ? newShiftBreakEnd.trim() : '',
      breakDuration: breakType === 'duration' ? Number(newShiftBreakDuration) : 0
    }];

    try {
      await saveShifts(updatedShifts);
      setNewShiftName('');
      setNewShiftBreakStart('');
      setNewShiftBreakEnd('');
      setNewShiftBreakDuration(0);
      alert(`✅ 班別「${name}」已成功建立！`);
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
    try {
      await saveShifts(updatedShifts);
    } catch (err) {
      console.error("Failed to delete shift:", err);
      alert('刪除班別失敗');
    }
  };

  const handleOpenEditShift = (index: number) => {
    const s = shifts[index];
    setEditingShiftIndex(index);
    setEditShiftName(s.name);
    setEditShiftStart(s.startTime);
    setEditShiftEnd(s.endTime);
    setEditShiftBreakStart(s.breakStartTime || '');
    setEditShiftBreakEnd(s.breakEndTime || '');
    setEditBreakType(s.breakDuration ? 'duration' : 'time');
    setEditShiftBreakDuration(s.breakDuration || 0);
  };

  const handleEditShiftSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingShiftIndex === null) return;
    
    const oldShift = shifts[editingShiftIndex];
    const name = editShiftName.trim();
    if (!name) return;
    const start = editShiftStart.trim();
    const end = editShiftEnd.trim();
    
    // Check duplicate name (excluding itself)
    if (shifts.some((s, idx) => s.name === name && idx !== editingShiftIndex)) {
      alert('該班別名稱已經存在');
      return;
    }
    
    const newShift = {
      name,
      startTime: start,
      endTime: end,
      breakStartTime: editBreakType === 'time' ? editShiftBreakStart.trim() : '',
      breakEndTime: editBreakType === 'time' ? editShiftBreakEnd.trim() : '',
      breakDuration: editBreakType === 'duration' ? Number(editShiftBreakDuration) : 0
    };
    
    const updatedShifts = [...shifts];
    updatedShifts[editingShiftIndex] = newShift;

    try {
      // 1. Save shifts settings
      await saveShifts(updatedShifts);
      
      // 2. Automatically update all schedules referencing this shift
      const oldShiftLabel = `${oldShift.name} (${oldShift.startTime} - ${oldShift.endTime})`;
      const newShiftLabel = `${newShift.name} (${newShift.startTime} - ${newShift.endTime})`;
      
      // Filter schedules that match either the full old label or the same shift name prefix
      const targetSchedules = schedules.filter((s: any) => {
        const schedShiftName = (s.shift || '').split('(')[0].trim();
        return s.shift === oldShiftLabel || schedShiftName === oldShift.name;
      });
      
      if (targetSchedules.length > 0) {
        let updatedCount = 0;
        for (const sched of targetSchedules) {
          try {
            await updateSchedule(sched.id, { shift: newShiftLabel });
            updatedCount++;
          } catch (err) {
            console.error(`Failed to update schedule ${sched.id}:`, err);
          }
        }
        console.log(`Updated ${updatedCount} schedules to match edited shift settings.`);
      }
      
      setEditingShiftIndex(null);
      alert(`✅ 班別「${name}」已成功更新，且已自動將 ${targetSchedules.length} 筆現有排班更新為新的時間規格！`);
    } catch (err) {
      console.error("Failed to edit shift:", err);
      alert('編輯班別失敗');
    }
  };

  // Insurance & Rules Save
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
      toleranceMinutes: Number(cfgToleranceMinutes),
      toleranceHours: Number((cfgToleranceMinutes / 60).toFixed(2))
    };
    
    try {
      await saveInsuranceRates(insData);
      await saveRules(rulesData);
      setSettingsSaveMsg({ type: 'success', text: '設定已成功儲存至雲端資料庫！' });
      setTimeout(() => setSettingsSaveMsg({ type: '', text: '' }), 4000);
    } catch (err) {
      console.error("Failed to save settings:", err);
      setSettingsSaveMsg({ type: 'error', text: '儲存失敗，請檢查權限或連線。' });
    }
  };

  // Holiday Handlers
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
      updatedList = [...holidays];
      updatedList[existingIndex] = newItem;
    } else {
      updatedList = [...holidays, newItem];
    }

    updatedList.sort((a, b) => a.date.localeCompare(b.date));

    try {
      await saveHolidays(updatedList);
      setNewHolidayName('');
      setNewHolidayDate('');
      setNewHolidayMovedDate('');
      alert(`國定假日「${name}」已成功設定為：原始 ${date}，月薪挪移至 ${movedDate}！`);
    } catch (err) {
      console.error("Failed to save holiday:", err);
      alert('儲存假日失敗');
    }
  };

  const handleDeleteHoliday = async (holidayName: string) => {
    if (!window.confirm(`確定要刪除「${holidayName}」國定假日嗎？`)) return;
    const updatedList = holidays.filter(h => h.name !== holidayName);
    try {
      await saveHolidays(updatedList);
    } catch (err) {
      console.error("Failed to delete holiday:", err);
      alert('刪除失敗');
    }
  };

  // Synchronize Taiwan Holiday API
  const handleSyncTaiwanHolidays = async () => {
    const defaultYear = new Date().getFullYear().toString();
    const yearStr = window.prompt("請輸入要同步的西元年份 (例如: 2026):", defaultYear);
    if (!yearStr) return;

    setSyncingHolidays(true);
    try {
      const res = await fetch(`https://cdn.jsdelivr.net/gh/ruyut/TaiwanCalendar/data/${yearStr}.json`);
      if (!res.ok) {
        throw new Error("無法取得該年份的假日資料，請確認年份是否正確。");
      }
      const data = await res.json();
      
      // Filter holidays that have description (excludes normal weekends)
      const apiHolidays = data.filter((item: any) => item.isHoliday && item.description && item.description.trim() !== "");
      
      if (apiHolidays.length === 0) {
        alert("找不到國定假日資料。");
        return;
      }

      const formatted = apiHolidays.map((h: any) => {
        // date format in json is YYYYMMDD -> YYYY-MM-DD
        const y = h.date.substring(0, 4);
        const m = h.date.substring(4, 6);
        const d = h.date.substring(6, 8);
        const dateVal = `${y}-${m}-${d}`;
        return {
          name: h.description,
          date: dateVal,
          movedDate: dateVal
        };
      });

      // Merge with existing holidays (by date or name)
      const mergedList = [...holidays];
      let newCount = 0;
      formatted.forEach((newH: any) => {
        const exists = mergedList.some(h => h.date === newH.date || h.name.toLowerCase() === newH.name.toLowerCase());
        if (!exists) {
          mergedList.push(newH);
          newCount++;
        }
      });

      mergedList.sort((a, b) => a.date.localeCompare(b.date));
      await saveHolidays(mergedList);
      alert(`🎉 同步完成！共新增 ${newCount} 筆國定假日。`);
    } catch (err: any) {
      console.error(err);
      alert(`同步失敗: ${err.message || err}`);
    } finally {
      setSyncingHolidays(false);
    }
  };

  return (
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
        gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
        gap: '24px'
      }}>
        {/* 1. Job Roles Administration */}
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
                    backgroundColor: 'rgba(239, 68, 68, 0.1)',
                    border: 'none',
                    cursor: 'pointer'
                  }}
                >
                  刪除
                </button>
              </div>
            ))}
          </div>

          <form onSubmit={handleAddCustomRole} style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
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
              type="submit"
              style={{
                backgroundColor: 'var(--primary)',
                color: '#fff',
                padding: '10px 16px',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: '600',
                border: 'none',
                cursor: 'pointer'
              }}
            >
              新增
            </button>
          </form>
        </div>

        {/* 2. Shifts Configuration */}
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
                    {s.breakStartTime && s.breakEndTime ? ` (休息：${s.breakStartTime} - ${s.breakEndTime})` : s.breakDuration ? ` (休息時間：${s.breakDuration} 分鐘)` : ''}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button 
                    onClick={() => handleOpenEditShift(index)}
                    style={{
                      color: 'var(--primary)',
                      fontSize: '12px',
                      fontWeight: '600',
                      padding: '4px 8px',
                      borderRadius: '4px',
                      backgroundColor: 'rgba(79, 70, 229, 0.1)',
                      border: 'none',
                      cursor: 'pointer'
                    }}
                  >
                    編輯
                  </button>
                  <button 
                    onClick={() => handleDeleteShift(s.name)}
                    style={{
                      color: '#ef4444',
                      fontSize: '12px',
                      fontWeight: '600',
                      padding: '4px 8px',
                      borderRadius: '4px',
                      backgroundColor: 'rgba(239, 68, 68, 0.1)',
                      border: 'none',
                      cursor: 'pointer'
                    }}
                  >
                    刪除
                  </button>
                </div>
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '4px' }}>
              <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>休息類型：</span>
                <label style={{ fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                  <input type="radio" name="breakType" checked={breakType === 'time'} onChange={() => setBreakType('time')} />
                  固定時間
                </label>
                <label style={{ fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                  <input type="radio" name="breakType" checked={breakType === 'duration'} onChange={() => setBreakType('duration')} />
                  固定時長
                </label>
              </div>

              {breakType === 'time' ? (
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>時間區間：</span>
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
              ) : (
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>休息時長：</span>
                  <select
                    value={newShiftBreakDuration}
                    onChange={(e) => setNewShiftBreakDuration(Number(e.target.value))}
                    style={{
                      flex: 1,
                      padding: '6px 8px',
                      borderRadius: '6px',
                      border: '1px solid var(--border)',
                      fontSize: '12px',
                      backgroundColor: '#fff'
                    }}
                  >
                    <option value={0}>不休息 (0 分鐘)</option>
                    {Array.from({ length: 12 }).map((_, i) => {
                      const minutes = (i + 1) * 5;
                      return (
                        <option key={minutes} value={minutes}>{minutes} 分鐘</option>
                      );
                    })}
                  </select>
                </div>
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
                textAlign: 'center',
                border: 'none',
                cursor: 'pointer'
              }}
            >
              + 建立新班別
            </button>
          </form>
        </div>
      </div>

      {/* 3. Insurance Rates & Attendance Rules */}
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <div className="card-header" style={{ borderBottom: '1px solid var(--border)', paddingBottom: '12px' }}>
          <h3 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--primary)' }}>⚙️ 台灣勞健退費率與差勤規則</h3>
        </div>

        <form onSubmit={handleSaveInsuranceAndRules} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
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
              <label style={{ fontSize: '13px', fontWeight: '600' }}>跨夜打卡匹配容許分鐘 (預設 240 分鐘)</label>
              <input 
                type="number" 
                required
                value={cfgToleranceMinutes}
                onChange={(e) => setCfgToleranceMinutes(Number(e.target.value))}
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
                boxShadow: 'var(--shadow-md)',
                border: 'none',
                cursor: 'pointer'
              }}
            >
              💾 儲存所有費率與差勤規則
            </button>
          </div>
        </form>
      </div>

      {/* 4. Holidays & Shifting */}
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <div className="card-header" style={{ borderBottom: '1px solid var(--border)', paddingBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <h3 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--primary)' }}>🎉 國定假日與挪移管理</h3>
          <button 
            type="button" 
            onClick={handleSyncTaiwanHolidays}
            disabled={syncingHolidays}
            style={{
              backgroundColor: '#10b981',
              color: '#fff',
              border: 'none',
              padding: '8px 16px',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: '700',
              cursor: 'pointer'
            }}
          >
            {syncingHolidays ? '🔄 同步中...' : '🔄 同步政府國定假日'}
          </button>
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
                        backgroundColor: 'rgba(239, 68, 68, 0.1)',
                        border: 'none',
                        cursor: 'pointer'
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
              <div style={{ flex: 1, minWidth: '150px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
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
              <div style={{ flex: 1, minWidth: '150px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
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
              <div style={{ flex: 1, minWidth: '150px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
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
                marginTop: '4px',
                border: 'none',
                cursor: 'pointer'
              }}
            >
              💾 儲存 / 挪移假日
            </button>
          </form>
        </div>
      </div>

      {/* 編輯班別彈窗 */}
      {editingShiftIndex !== null && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0, 0, 0, 0.4)', backdropFilter: 'blur(8px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
          <div className="glass-card" style={{ width: '90%', maxWidth: '450px', padding: '32px', borderRadius: '16px', backgroundColor: '#ffffff', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)', maxHeight: '90vh', overflowY: 'auto' }}>
            <h3 style={{ marginBottom: '20px', color: 'var(--primary)', fontSize: '20px', fontWeight: '700' }}>編輯班別時間</h3>
            <form onSubmit={handleEditShiftSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '13px', fontWeight: '600' }}>班別名稱</label>
                <input 
                  type="text" 
                  required
                  placeholder="名稱 (如: 假日班)"
                  value={editShiftName}
                  onChange={(e) => setEditShiftName(e.target.value)}
                  style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '14px', backgroundColor: '#fff' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '12px' }}>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '13px', fontWeight: '600' }}>上班時間</label>
                  <input 
                    type="time" 
                    required
                    value={editShiftStart}
                    onChange={(e) => setEditShiftStart(e.target.value)}
                    style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '14px', backgroundColor: '#fff' }}
                  />
                </div>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '13px', fontWeight: '600' }}>下班時間</label>
                  <input 
                    type="time" 
                    required
                    value={editShiftEnd}
                    onChange={(e) => setEditShiftEnd(e.target.value)}
                    style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '14px', backgroundColor: '#fff' }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                  <span style={{ fontSize: '13px', fontWeight: '600' }}>休息類型：</span>
                  <label style={{ fontSize: '13px', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                    <input type="radio" name="editBreakType" checked={editBreakType === 'time'} onChange={() => setEditBreakType('time')} />
                    固定時間
                  </label>
                  <label style={{ fontSize: '13px', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                    <input type="radio" name="editBreakType" checked={editBreakType === 'duration'} onChange={() => setEditBreakType('duration')} />
                    固定時長
                  </label>
                </div>

                {editBreakType === 'time' ? (
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '6px' }}>
                    <span style={{ fontSize: '13px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>時間區間：</span>
                    <input 
                      type="time" 
                      value={editShiftBreakStart}
                      onChange={(e) => setEditShiftBreakStart(e.target.value)}
                      style={{ flex: 1, padding: '8px 10px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '13px', backgroundColor: '#fff' }}
                    />
                    <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>至</span>
                    <input 
                      type="time" 
                      value={editShiftBreakEnd}
                      onChange={(e) => setEditShiftBreakEnd(e.target.value)}
                      style={{ flex: 1, padding: '8px 10px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '13px', backgroundColor: '#fff' }}
                    />
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '6px' }}>
                    <span style={{ fontSize: '13px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>休息時長：</span>
                    <select
                      value={editShiftBreakDuration}
                      onChange={(e) => setEditShiftBreakDuration(Number(e.target.value))}
                      style={{ flex: 1, padding: '8px 10px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '13px', backgroundColor: '#fff' }}
                    >
                      <option value={0}>不休息 (0 分鐘)</option>
                      {Array.from({ length: 12 }).map((_, i) => {
                        const minutes = (i + 1) * 5;
                        return (
                          <option key={minutes} value={minutes}>{minutes} 分鐘</option>
                        );
                      })}
                    </select>
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
                <button type="button" onClick={() => setEditingShiftIndex(null)} style={{ flex: 1, padding: '12px', borderRadius: '8px', border: '1px solid #d1d5db', backgroundColor: '#f3f4f6', cursor: 'pointer', fontWeight: '600', fontSize: '14px' }}>取消</button>
                <button type="submit" style={{ flex: 1, padding: '12px', borderRadius: '8px', border: 'none', backgroundColor: 'var(--primary)', color: '#fff', cursor: 'pointer', fontWeight: '600', fontSize: '14px' }}>更新班別</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
