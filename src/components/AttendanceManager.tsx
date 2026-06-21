import React, { useState, useMemo } from 'react';
import { useAdminData } from '../context/AdminDataContext';
import { parseTimeStrToMinutes } from '../utils/taiwanHrEngine';

const AttendanceManager: React.FC = () => {
  const {
    employees,
    attendance,
    schedules,
    shifts,
    addAttendanceRecord,
    updateAttendanceRecord,
    deleteAttendanceRecord
  } = useAdminData();

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
          punch2: string;
          punch3: string;
          punch4: string;
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
        punch2: string;
        punch3: string;
        punch4: string;
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
          const shiftName = dateSched.shift.split(' (')[0];
          shiftDef = shifts.find(s => s.name === shiftName);
          startTimeStr = dateSched.startTime || '';
          endTimeStr = dateSched.endTime || '';
          if (!startTimeStr || !endTimeStr) {
            const timeMatch = (dateSched.shift || '').match(/\((\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})\)/);
            if (timeMatch) {
              if (!startTimeStr) startTimeStr = timeMatch[1];
              if (!endTimeStr) endTimeStr = timeMatch[2];
            }
          }
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

        dayHours = Math.round(dayHours * 100) / 100;
        totalHours += dayHours;

        const ins = sortedRecs.filter(r => r.type === '上班');
        const outs = sortedRecs.filter(r => r.type === '下班');
        
        let punch1 = '—';
        let punch2 = '—';
        let punch3 = '—';
        let punch4 = '—';

        if (sortedRecs.length <= 2) {
          punch1 = ins[0]?.time || '—';
          punch4 = outs[0]?.time || '—';
        } else {
          punch1 = ins[0]?.time || '—';
          punch2 = outs[0]?.time || '—';
          punch3 = ins[1]?.time || '—';
          punch4 = outs[1]?.time || '—';
        }

        dailyDetails.push({
          date,
          punch1,
          punch2,
          punch3,
          punch4,
          hours: dayHours
        });
      });

      summary[empId].totalHours = Math.round(totalHours * 100) / 100;
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

  return (
    <>
      {/* 1. 個人月工時合計報表 */}
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
        
        <div className="table-responsive">
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

      {/* 2. 即時打卡紀錄 */}
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
            <div style={{ width: '100%', overflowX: 'auto' }}>
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
                    selectedDetailEmployee.dailyDetails.map((detail: any, idx: number) => (
                      <tr key={idx} style={{ borderBottom: '1px solid #f3f4f6' }}>
                        <td style={{ padding: '12px', fontWeight: '600', color: 'var(--text-main)' }}>{detail.date}</td>
                        <td style={{ padding: '12px', color: detail.punch1 === '—' ? '#9ca3af' : 'inherit' }}>{detail.punch1}</td>
                        <td style={{ padding: '12px', color: detail.punch2 === '—' ? '#9ca3af' : 'inherit' }}>{detail.punch2}</td>
                        <td style={{ padding: '12px', color: detail.punch3 === '—' ? '#9ca3af' : 'inherit' }}>{detail.punch3}</td>
                        <td style={{ padding: '12px', color: detail.punch4 === '—' ? '#9ca3af' : 'inherit' }}>{detail.punch4}</td>
                        <td style={{ padding: '12px', textAlign: 'right', fontWeight: '700', color: 'var(--primary)' }}>{detail.hours.toFixed(1)} 小時</td>
                      </tr>
                    ))
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
