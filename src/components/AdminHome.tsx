import React from 'react';
import { useAdminData } from '../context/AdminDataContext';

interface AdminHomeProps {
  setActiveTab: (tab: 'attendance' | 'employees' | 'schedules' | 'payroll' | 'leaves' | 'settings') => void;
}

const AdminHome: React.FC<AdminHomeProps> = ({ setActiveTab }) => {
  const {
    employees,
    leaves,
    overtimeReqs,
    punchCorrections,
    attendanceAppeals,
    attendance,
    schedules
  } = useAdminData();

  const today = new Date();

  // 1. 試用期警示 (到職未滿 90 天)
  const probationEmployees = employees.filter(emp => {
    if (!emp.onboardDate) return false;
    const onboardTime = new Date(emp.onboardDate).getTime();
    const diffTime = today.getTime() - onboardTime;
    const diffDays = diffTime / (1000 * 60 * 60 * 24);
    return diffDays >= 0 && diffDays <= 90;
  });

  // 2. 銀行帳號未填警示
  const missingBankEmployees = employees.filter(emp => !emp.bankAccount || emp.bankAccount.trim() === '');

  // 3. 生日提醒
  const birthdayEmployees = employees.filter(emp => {
    if (!emp.birthDate) return false;
    const parts = emp.birthDate.split('-');
    if (parts.length < 2) return false;
    const birthMonth = parseInt(parts[1], 10);
    return birthMonth === (today.getMonth() + 1);
  });

  // 4. 到職週年提醒
  const anniversaryEmployees = employees.filter(emp => {
    if (!emp.onboardDate) return false;
    const parts = emp.onboardDate.split('-');
    if (parts.length < 2) return false;
    const onboardMonth = parseInt(parts[1], 10);
    const onboardYear = parseInt(parts[0], 10);
    const years = today.getFullYear() - onboardYear;
    return onboardMonth === (today.getMonth() + 1) && years > 0;
  });

  // 5. 出勤異常彙整 (近期)
  const attendanceExceptions = React.useMemo(() => {
    const list: Array<{ empName: string; date: string; type: string; message: string }> = [];
    const todayStr = new Date().toLocaleDateString('sv');
    
    const attMap: { [empId: string]: { [date: string]: any[] } } = {};
    attendance.forEach(rec => {
      if (!rec.employeeId || !rec.date) return;
      if (!attMap[rec.employeeId]) attMap[rec.employeeId] = {};
      if (!attMap[rec.employeeId][rec.date]) attMap[rec.employeeId][rec.date] = [];
      attMap[rec.employeeId][rec.date].push(rec);
    });
    
    const leavesMap: { [empId: string]: any[] } = {};
    leaves.forEach(l => {
      if (!l.employeeId) return;
      if (!leavesMap[l.employeeId]) leavesMap[l.employeeId] = [];
      leavesMap[l.employeeId].push(l);
    });
    
    schedules.filter(s => s.date < todayStr && s.shift !== '例假' && s.shift !== '休假' && s.shift !== '國定假日').forEach(sched => {
      const empId = sched.employeeId;
      const date = sched.date;
      const empLeaves = leavesMap[empId] || [];
      
      const hasLeave = empLeaves.some(l => l.startDate <= date && l.endDate >= date && l.status === 'approved');
      if (hasLeave) return;
      
      const dayAtt = (attMap[empId] && attMap[empId][date]) || [];
      const inRec = dayAtt.find(r => r.type === '上班');
      const outRec = dayAtt.find(r => r.type === '下班');
      
      if (!inRec && !outRec) {
        list.push({
          empName: sched.empName,
          date,
          type: '曠職',
          message: `無打卡紀錄 (${sched.shift})`
        });
      } else if (!inRec || !outRec) {
        list.push({
          empName: sched.empName,
          date,
          type: '缺卡',
          message: `${inRec ? '缺下班卡' : '缺上班卡'} (${sched.shift})`
        });
      } else {
        const statuses = dayAtt.map(r => r.status).filter(s => s && s !== '正常');
        if (statuses.length > 0) {
          list.push({
            empName: sched.empName,
            date,
            type: statuses.join('、'),
            message: `上班 ${inRec.time || '-'} / 下班 ${outRec.time || '-'} (班表: ${sched.shift})`
          });
        }
      }
    });
    
    return list.sort((a, b) => b.date.localeCompare(a.date));
  }, [schedules, attendance, leaves]);

  const pendingLeaves = leaves.filter(l => l.status === 'pending').length;
  const pendingOvertimes = overtimeReqs.filter(o => o.status === 'pending').length;
  const pendingCorrections = punchCorrections.filter(p => p.status === 'pending').length;
  const pendingAppeals = attendanceAppeals.filter(a => a.status === 'pending').length;

  return (
    <div className="alerts-approvals-panel" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px', marginBottom: '24px' }}>
      {/* 快速跳轉審核卡 */}
      <div className="card" style={{ padding: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
          <span style={{ fontSize: '20px' }}>📋</span>
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '700', color: 'var(--text-main)' }}>差勤待審核概覽</h3>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {[
            { label: '請假申請', count: pendingLeaves, color: '#4f46e5', icon: '📄' },
            { label: '加班申請', count: pendingOvertimes, color: '#059669', icon: '⏰' },
            { label: '補卡申請', count: pendingCorrections, color: '#d97706', icon: '🔧' },
            { label: '打卡異常申訴', count: pendingAppeals, color: '#7c3aed', icon: '📣' },
          ].map(item => (
            <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', borderRadius: '10px', backgroundColor: `rgba(${item.color === '#4f46e5' ? '79,70,229' : item.color === '#059669' ? '5,150,105' : item.color === '#d97706' ? '217,119,6' : '124,58,237'},0.06)`, border: `1px solid rgba(${item.color === '#4f46e5' ? '79,70,229' : item.color === '#059669' ? '5,150,105' : item.color === '#d97706' ? '217,119,6' : '124,58,237'},0.15)` }}>
              <span style={{ fontSize: '13px', fontWeight: '600', color: '#374151' }}>{item.icon} {item.label}</span>
              {item.count > 0
                ? <span style={{ background: '#ef4444', color: '#fff', borderRadius: '99px', padding: '2px 10px', fontSize: '12px', fontWeight: '800' }}>{item.count} 待審</span>
                : <span style={{ color: '#10b981', fontSize: '12px', fontWeight: '600' }}>✅ 無待審</span>
              }
            </div>
          ))}
          <button
            onClick={() => setActiveTab('leaves')}
            style={{ marginTop: '8px', width: '100%', padding: '10px', borderRadius: '8px', border: 'none', backgroundColor: 'var(--primary)', color: '#fff', fontWeight: '700', fontSize: '13px', cursor: 'pointer' }}
          >
            前往差勤審核 →
          </button>
        </div>
      </div>

      {/* 行政警示區 */}
      <div className="card" style={{ padding: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
          <span style={{ fontSize: '20px' }}>🔔</span>
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '700', color: 'var(--text-main)' }}>行政與法規警示</h3>
        </div>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {/* 試用期警示 */}
          <div style={{ padding: '12px', borderRadius: '10px', backgroundColor: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.15)', fontSize: '13px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: '700', color: '#d97706', marginBottom: '6px' }}>
              <span>⏱️</span>
              <span>新進員工試用期追蹤 (到職未滿90天)</span>
            </div>
            {probationEmployees.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', fontSize: '12px' }}>目前無新進試用期員工。</div>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px' }}>
                {probationEmployees.map(emp => {
                  const diffDays = Math.floor((today.getTime() - new Date(emp.onboardDate).getTime()) / (1000 * 60 * 60 * 24));
                  return (
                    <span key={emp.id} style={{ display: 'inline-block', padding: '3px 8px', borderRadius: '6px', backgroundColor: 'rgba(245,158,11,0.12)', color: '#d97706', fontSize: '12px', fontWeight: '600' }}>
                      {emp.name} (已到職 {diffDays} 天)
                    </span>
                  );
                })}
              </div>
            )}
          </div>

          {/* 銀行帳號未填警示 */}
          <div style={{ padding: '12px', borderRadius: '10px', backgroundColor: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)', fontSize: '13px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: '700', color: '#dc2626', marginBottom: '6px' }}>
              <span>🏦</span>
              <span>銀行帳號未填警示 (會影響薪資匯款)</span>
            </div>
            {missingBankEmployees.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', fontSize: '12px' }}>所有員工皆已填寫銀行帳號。</div>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px' }}>
                {missingBankEmployees.map(emp => (
                  <span key={emp.id} style={{ display: 'inline-block', padding: '3px 8px', borderRadius: '6px', backgroundColor: 'rgba(239,68,68,0.12)', color: '#dc2626', fontSize: '12px', fontWeight: '600' }}>
                    {emp.name}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* 生日提醒 */}
          <div style={{ padding: '12px', borderRadius: '10px', backgroundColor: 'rgba(236,72,153,0.06)', border: '1px solid rgba(236,72,153,0.15)', fontSize: '13px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: '700', color: '#db2777', marginBottom: '6px' }}>
              <span>🎂</span>
              <span>本月壽星提醒</span>
            </div>
            {birthdayEmployees.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', fontSize: '12px' }}>本月無壽星員工。</div>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px' }}>
                {birthdayEmployees.map(emp => {
                  const parts = emp.birthDate.split('-');
                  const day = parts.length > 2 ? parseInt(parts[2], 10) + '日' : '';
                  return (
                    <span key={emp.id} style={{ display: 'inline-block', padding: '3px 8px', borderRadius: '6px', backgroundColor: 'rgba(236,72,153,0.12)', color: '#db2777', fontSize: '12px', fontWeight: '600' }}>
                      {emp.name} ({day})
                    </span>
                  );
                })}
              </div>
            )}
          </div>

          {/* 到職週年提醒 */}
          <div style={{ padding: '12px', borderRadius: '10px', backgroundColor: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.15)', fontSize: '13px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: '700', color: '#059669', marginBottom: '6px' }}>
              <span>🎉</span>
              <span>本月到職週年提醒</span>
            </div>
            {anniversaryEmployees.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', fontSize: '12px' }}>本月無到職週年員工。</div>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px' }}>
                {anniversaryEmployees.map(emp => {
                  const parts = emp.onboardDate.split('-');
                  const day = parts.length > 2 ? parseInt(parts[2], 10) + '日' : '';
                  const years = today.getFullYear() - parseInt(parts[0], 10);
                  return (
                    <span key={emp.id} style={{ display: 'inline-block', padding: '3px 8px', borderRadius: '6px', backgroundColor: 'rgba(16,185,129,0.12)', color: '#059669', fontSize: '12px', fontWeight: '600' }}>
                      {emp.name} ({years}週年 - {day})
                    </span>
                  );
                })}
              </div>
            )}
          </div>

          {/* 出勤異常彙整 */}
          <div style={{ padding: '12px', borderRadius: '10px', backgroundColor: 'rgba(168,85,247,0.06)', border: '1px solid rgba(168,85,247,0.15)', fontSize: '13px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: '700', color: '#7c3aed', marginBottom: '6px' }}>
              <span>⚠️</span>
              <span>全員出勤異常彙整 (近期)</span>
              {attendanceExceptions.length > 0 && (
                <span style={{ marginLeft: 'auto', background: 'rgba(168,85,247,0.15)', color: '#7c3aed', borderRadius: '99px', padding: '1px 8px', fontSize: '11px' }}>
                  {attendanceExceptions.length} 筆
                </span>
              )}
            </div>
            {attendanceExceptions.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', fontSize: '12px' }}>近期無出勤異常紀錄。</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', maxHeight: '120px', overflowY: 'auto', marginTop: '4px' }}>
                {attendanceExceptions.slice(0, 20).map((ex, i) => (
                  <div key={i} style={{ fontSize: '12px', color: '#4b5563', display: 'flex', gap: '6px' }}>
                    <span style={{ color: '#9ca3af', minWidth: '82px' }}>{ex.date}</span>
                    <span style={{ color: '#6b21a8', fontWeight: '600', minWidth: '32px' }}>{ex.empName}</span>
                    <span style={{ color: '#7c3aed', fontWeight: '700', minWidth: '36px' }}>[{ex.type}]</span>
                    <span>{ex.message}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminHome;
