import React, { useState, useMemo } from 'react';
import { useAdminData } from '../context/AdminDataContext';
import { isOffShift } from '../utils/taiwanHrEngine';

interface WeeklyStationBoardProps {
  onClose: () => void;
  initialStartDate: string; // YYYY-MM-DD
}

const WeeklyStationBoard: React.FC<WeeklyStationBoardProps> = ({ onClose, initialStartDate }) => {
  const { employees, schedules, updateSchedule } = useAdminData();
  
  const [currentMondayStr, setCurrentMondayStr] = useState<string>(initialStartDate);
  
  // Instruction Modal State
  const [editingInstructionId, setEditingInstructionId] = useState<string | null>(null);
  const [tempInstruction, setTempInstruction] = useState<string>('');

  const currentMonday = new Date(currentMondayStr);

  const handlePrevWeek = () => {
    const d = new Date(currentMonday);
    d.setDate(d.getDate() - 7);
    setCurrentMondayStr(d.toLocaleDateString('sv'));
  };

  const handleNextWeek = () => {
    const d = new Date(currentMonday);
    d.setDate(d.getDate() + 7);
    setCurrentMondayStr(d.toLocaleDateString('sv'));
  };

  // Generate the 7 days of the week
  const weekDays = useMemo(() => {
    const days = [];
    const dayNames = ['一', '二', '三', '四', '五', '六', '日'];
    for (let i = 0; i < 7; i++) {
      const d = new Date(currentMonday);
      d.setDate(d.getDate() + i);
      days.push({
        dateStr: d.toLocaleDateString('sv'),
        name: dayNames[i],
        isWeekend: i >= 5
      });
    }
    return days;
  }, [currentMonday]);

  // Handle Station Update (debounced or on blur to prevent excessive writes)
  const handleStationBlur = async (schedId: string, newStation: string, oldStation: string | undefined) => {
    if (newStation !== (oldStation || '')) {
      try {
        await updateSchedule(schedId, { station: newStation });
      } catch (err) {
        console.error("Failed to update station", err);
      }
    }
  };

  const openInstructionModal = (sched: any) => {
    setEditingInstructionId(sched.id);
    setTempInstruction(sched.stationInstruction || '');
  };

  const saveInstruction = async () => {
    if (editingInstructionId) {
      try {
        await updateSchedule(editingInstructionId, { stationInstruction: tempInstruction });
        setEditingInstructionId(null);
      } catch (err) {
        console.error("Failed to update instruction", err);
      }
    }
  };

  return (
    <div className="weekly-board-overlay">
      <div className="glass-card" style={{ width: '95%', maxWidth: '1200px', height: '90vh', display: 'flex', flexDirection: 'column', padding: '24px', borderRadius: '16px', backgroundColor: '#ffffff', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)', overflow: 'hidden' }}>
        
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ margin: 0, color: 'var(--primary)', fontSize: '20px', fontWeight: '700' }}>📋 每週崗位快速配置</h3>
          <button onClick={onClose} style={{ border: 'none', backgroundColor: '#f3f4f6', padding: '8px 16px', borderRadius: '8px', fontWeight: '700', cursor: 'pointer' }}>
            關閉
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '16px' }}>
          <button onClick={handlePrevWeek} className="btn-text" style={{ padding: '6px 12px', border: '1px solid var(--border)', borderRadius: '6px' }}>◀ 上週</button>
          <span style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text-main)' }}>
            {weekDays[0].dateStr} ~ {weekDays[6].dateStr}
          </span>
          <button onClick={handleNextWeek} className="btn-text" style={{ padding: '6px 12px', border: '1px solid var(--border)', borderRadius: '6px' }}>下週 ▶</button>
          <span style={{ marginLeft: 'auto', fontSize: '13px', color: 'var(--text-muted)' }}>
            💡 提示：點擊格子直接輸入崗位名稱，點擊 📝 可填寫詳細任務指示。
          </span>
        </div>

        <div style={{ flex: 1, overflow: 'auto', border: '1px solid var(--border)', borderRadius: '8px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead style={{ position: 'sticky', top: 0, backgroundColor: '#f9fafb', zIndex: 10, boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
              <tr>
                <th style={{ padding: '12px', borderBottom: '1px solid var(--border)', borderRight: '1px solid var(--border)', width: '120px', textAlign: 'left', fontWeight: '700' }}>員工姓名</th>
                {weekDays.map(day => (
                  <th key={day.dateStr} style={{ padding: '12px', borderBottom: '1px solid var(--border)', borderRight: '1px solid var(--border)', minWidth: '130px', textAlign: 'center', color: day.isWeekend ? '#4f46e5' : 'var(--text-main)' }}>
                    <div>{day.dateStr}</div>
                    <div style={{ fontWeight: '800', marginTop: '4px' }}>星期{day.name}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {employees.map(emp => {
                // Check if employee has any shift in this week to maybe filter them out?
                // For simplicity, we can show all employees, or only those who have schedules this week.
                const empSchedsThisWeek = schedules.filter(s => s.employeeId === emp.id && s.date >= weekDays[0].dateStr && s.date <= weekDays[6].dateStr && !isOffShift(s.shift));
                
                // If they have no working shifts this week, we can hide them to save space
                if (empSchedsThisWeek.length === 0) return null;

                return (
                  <tr key={emp.id}>
                    <td style={{ padding: '12px', borderBottom: '1px solid var(--border)', borderRight: '1px solid var(--border)', fontWeight: '600', backgroundColor: '#f8fafc' }}>
                      {emp.name}
                    </td>
                    {weekDays.map(day => {
                      const sched = empSchedsThisWeek.find(s => s.date === day.dateStr);
                      if (!sched) {
                        return (
                          <td key={day.dateStr} style={{ padding: '8px', borderBottom: '1px solid var(--border)', borderRight: '1px solid var(--border)', backgroundColor: '#f3f4f6', color: '#9ca3af', textAlign: 'center', fontSize: '12px' }}>
                            無班 / 休假
                          </td>
                        );
                      }

                      return (
                        <td key={day.dateStr} style={{ padding: '8px', borderBottom: '1px solid var(--border)', borderRight: '1px solid var(--border)', backgroundColor: '#ffffff', verticalAlign: 'top' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            <div style={{ fontSize: '11px', color: 'var(--primary)', fontWeight: '700' }}>
                              {sched.shift.split('(')[0].trim()}
                            </div>
                            <div style={{ display: 'flex', gap: '4px' }}>
                              <input 
                                type="text" 
                                placeholder="輸入崗位..." 
                                defaultValue={sched.station || ''}
                                onBlur={(e) => handleStationBlur(sched.id, e.target.value, sched.station)}
                                style={{ flex: 1, padding: '4px 6px', fontSize: '13px', border: '1px solid #d1d5db', borderRadius: '4px', width: '100%' }}
                              />
                              <button 
                                onClick={() => openInstructionModal(sched)}
                                style={{ padding: '4px 6px', border: '1px solid #d1d5db', borderRadius: '4px', backgroundColor: sched.stationInstruction ? '#e0e7ff' : '#f9fafb', cursor: 'pointer' }}
                                title={sched.stationInstruction ? '編輯指示' : '新增指示'}
                              >
                                {sched.stationInstruction ? '📝' : '➕'}
                              </button>
                            </div>
                            {sched.stationInstruction && (
                              <div style={{ fontSize: '11px', color: '#6b7280', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {sched.stationInstruction}
                              </div>
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Instruction Modal */}
      {editingInstructionId && (
        <div className="weekly-board-submodal-overlay">
          <div className="glass-card" style={{ width: '90%', maxWidth: '400px', padding: '24px', borderRadius: '12px', backgroundColor: '#ffffff' }}>
            <h4 style={{ margin: '0 0 16px 0', color: 'var(--primary)', fontSize: '16px' }}>📝 編輯工作指示</h4>
            <textarea 
              value={tempInstruction}
              onChange={(e) => setTempInstruction(e.target.value)}
              placeholder="請輸入詳細的工作內容、注意事項..."
              style={{ width: '100%', height: '120px', padding: '12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', resize: 'none', marginBottom: '16px' }}
            />
            <div style={{ display: 'flex', gap: '12px' }}>
              <button onClick={() => setEditingInstructionId(null)} style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid #d1d5db', backgroundColor: '#f3f4f6', cursor: 'pointer', fontWeight: '600' }}>取消</button>
              <button onClick={saveInstruction} style={{ flex: 1, padding: '10px', borderRadius: '8px', border: 'none', backgroundColor: 'var(--primary)', color: '#fff', cursor: 'pointer', fontWeight: '600' }}>儲存</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WeeklyStationBoard;
