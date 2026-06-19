import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth } from '../firebase';
import { useAdminData } from '../context/AdminDataContext';
import AdminHome from '../components/AdminHome';
import AttendanceManager from '../components/AttendanceManager';
import EmployeeManager from '../components/EmployeeManager';
import Scheduler from '../components/Scheduler';
import { PayrollCalculator } from '../components/PayrollCalculator';
import { LeavesManager } from '../components/LeavesManager';
import { SettingsManager } from '../components/SettingsManager';
import './AdminDashboard.css';
import { isOffShift, evaluatePunchesStatus } from '../utils/taiwanHrEngine';

const AdminDashboard: React.FC = () => {
  const {
    leaves,
    overtimeReqs,
    punchCorrections,
    attendanceAppeals,
    schedules,
    attendance,
    shifts,
    loading
  } = useAdminData();

  const [activeTab, setActiveTab] = useState<'home' | 'attendance' | 'employees' | 'schedules' | 'payroll' | 'leaves' | 'settings'>('home');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const handleSignOut = () => {
    signOut(auth);
  };

  // Compute attendance exceptions for the badge
  const attendanceExceptions = useMemo(() => {
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
    
    schedules.filter(s => s.date < todayStr && !isOffShift(s.shift)).forEach(sched => {
      const empId = sched.employeeId;
      const date = sched.date;
      const empLeaves = leavesMap[empId] || [];
      
      const hasLeave = empLeaves.some(l => l.startDate <= date && l.endDate >= date && l.status === 'approved');
      if (hasLeave) return;
      
      const dayAtt = (attMap[empId] && attMap[empId][date]) || [];
      const shiftName = (sched.shift || '').split(' (')[0];
      const matchedShiftDef = (shifts || []).find(s => s.name === shiftName);
      const expectsFour = matchedShiftDef ? ((matchedShiftDef.breakStartTime && matchedShiftDef.breakEndTime) || (matchedShiftDef.breakDuration > 0)) : false;

      const inRecs = dayAtt.filter(r => r.type === '上班').sort((a, b) => (a.time || '').localeCompare(b.time || ''));
      const outRecs = dayAtt.filter(r => r.type === '下班').sort((a, b) => (a.time || '').localeCompare(b.time || ''));
      const actualPunches = dayAtt.length;
      const hasApprovedOvertime = (overtimeReqs || []).some(ot => ot.employeeId === empId && ot.date === date && ot.status === 'approved');
      const expectedPunches = (expectsFour && !hasApprovedOvertime) ? 4 : 2;
      
      if (actualPunches === 0) {
        list.push({
          empName: sched.empName,
          date,
          type: '曠職',
          message: `無打卡紀錄 (${sched.shift})`
        });
      } else if (actualPunches < expectedPunches) {
        let msg = '';
        if (expectsFour) {
          msg = `打卡不完整：預計 4 次，實際僅打卡 ${actualPunches} 次 (${sched.shift})`;
        } else {
          msg = `${inRecs.length === 0 ? '缺上班卡' : '缺下班卡'} (${sched.shift})`;
        }
        list.push({
          empName: sched.empName,
          date,
          type: '缺卡',
          message: msg
        });
      } else {
        let startTimeStr = '';
        let endTimeStr = '';
        const timeMatch = (sched.shift || '').match(/\((\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})\)/);
        if (timeMatch) {
          startTimeStr = timeMatch[1];
          endTimeStr = timeMatch[2];
        }
        const { isLate, isEarly } = evaluatePunchesStatus(dayAtt, startTimeStr, endTimeStr);
        const dayStatuses = [];
        if (isLate) dayStatuses.push('遲到');
        if (isEarly) dayStatuses.push('早退');
        
        if (dayStatuses.length > 0) {
          list.push({
            empName: sched.empName,
            date,
            type: dayStatuses.join('、'),
            message: `上班 ${inRecs.map(r => r.time).join(', ') || '-'} / 下班 ${outRecs.map(r => r.time).join(', ') || '-'} (班表: ${sched.shift})`
          });
        }
      }
    });
    
    return list;
  }, [schedules, attendance, leaves, shifts, overtimeReqs]);

  const pendingLeaves = leaves.filter(l => l.status === 'pending').length;
  const pendingOvertimes = overtimeReqs.filter(o => o.status === 'pending').length;
  const pendingCorrections = punchCorrections.filter(p => p.status === 'pending').length;
  const pendingAppeals = attendanceAppeals.filter(a => a.status === 'pending').length;
  const pendingApprovalsCount = pendingLeaves + pendingOvertimes + pendingCorrections + pendingAppeals;

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', fontSize: '18px', fontFamily: 'system-ui' }}>
        資料載入中...
      </div>
    );
  }

  const userEmail = auth.currentUser?.email || 'taidu.patisserie.2025@gmail.com';

  return (
    <div className="admin-layout">
      {isSidebarOpen && (
        <div className="sidebar-overlay" onClick={() => setIsSidebarOpen(false)}></div>
      )}
      <aside className={`admin-sidebar ${isSidebarOpen ? 'open' : ''}`}>
        <div className="admin-brand">
          <span className="icon">🛡️</span> 
          <h2>HR 管理後台</h2>
        </div>
        
        <nav className="admin-nav">
          <button 
            className={`nav-item ${activeTab === 'home' ? 'active' : ''}`}
            onClick={() => { setActiveTab('home'); setIsSidebarOpen(false); }}
          >
            🏠 後台首頁
          </button>
          <button 
            className={`nav-item ${activeTab === 'attendance' ? 'active' : ''}`}
            onClick={() => { setActiveTab('attendance'); setIsSidebarOpen(false); }}
            style={{ position: 'relative' }}
          >
            📊 出勤紀錄
            {attendanceExceptions.length > 0 && (
              <span style={{ position: 'absolute', top: '6px', right: '10px', background: '#ef4444', color: '#fff', borderRadius: '99px', padding: '1px 6px', fontSize: '10px', fontWeight: '800' }}>
                {attendanceExceptions.length}
              </span>
            )}
          </button>
          <button 
            className={`nav-item ${activeTab === 'employees' ? 'active' : ''}`}
            onClick={() => { setActiveTab('employees'); setIsSidebarOpen(false); }}
          >
            👥 員工管理
          </button>
          <button 
            className={`nav-item ${activeTab === 'schedules' ? 'active' : ''}`}
            onClick={() => { setActiveTab('schedules'); setIsSidebarOpen(false); }}
          >
            📅 排班系統
          </button>
          <button 
            className={`nav-item ${activeTab === 'payroll' ? 'active' : ''}`}
            onClick={() => { setActiveTab('payroll'); setIsSidebarOpen(false); }}
          >
            💰 薪資計算
          </button>
          <button 
            className={`nav-item ${activeTab === 'leaves' ? 'active' : ''}`}
            onClick={() => { setActiveTab('leaves'); setIsSidebarOpen(false); }}
            style={{ position: 'relative' }}
          >
            ✅ 差勤審核
            {pendingApprovalsCount > 0 && (
              <span style={{ position: 'absolute', top: '6px', right: '10px', background: '#ef4444', color: '#fff', borderRadius: '99px', padding: '1px 6px', fontSize: '10px', fontWeight: '800' }}>
                {pendingApprovalsCount}
              </span>
            )}
          </button>
          <button 
            className={`nav-item ${activeTab === 'settings' ? 'active' : ''}`}
            onClick={() => { setActiveTab('settings'); setIsSidebarOpen(false); }}
            style={{ marginTop: 'auto' }}
          >
            ⚙️ 系統設定
          </button>
          <Link to="/" className="nav-item return-link" style={{ marginTop: '0' }} onClick={() => setIsSidebarOpen(false)}>
            ⬅️ 返回前台打卡
          </Link>
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-user">
            <div className="avatar">A</div>
            <div className="user-info">
              <span className="user-name">管理員</span>
              <span className="user-email">{userEmail}</span>
            </div>
          </div>
          <button className="sidebar-logout-btn" onClick={handleSignOut}>登出</button>
        </div>
      </aside>

      <main className="admin-main">
        <header className="admin-header">
          <button 
            className={`hamburger-btn ${isSidebarOpen ? 'open' : ''}`}
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            aria-label="Toggle Sidebar"
          >
            <span></span>
            <span></span>
            <span></span>
          </button>
          <h1>
            {activeTab === 'home' && '後台管理首頁'}
            {activeTab === 'attendance' && '今日出勤狀況'}
            {activeTab === 'employees' && '員工列表'}
            {activeTab === 'schedules' && '排班系統'}
            {activeTab === 'payroll' && '薪資計算'}
            {activeTab === 'leaves' && '差勤審核管理'}
            {activeTab === 'settings' && '系統設定'}
          </h1>
          <div className="admin-user" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span>管理員 (Admin)</span>
            <div 
              className="avatar" 
              style={{ cursor: 'pointer' }} 
              onClick={() => setActiveTab('settings')}
              title="進入設定"
            >
              A
            </div>
            <button
              onClick={() => setActiveTab('settings')}
              style={{
                background: activeTab === 'settings' ? 'rgba(79, 70, 229, 0.1)' : 'rgba(0, 0, 0, 0.05)',
                color: activeTab === 'settings' ? 'var(--primary)' : 'var(--text-main)',
                border: activeTab === 'settings' ? '1px solid rgba(79, 70, 229, 0.2)' : '1px solid var(--border)',
                padding: '6px 12px',
                borderRadius: '6px',
                cursor: 'pointer',
                fontWeight: '600',
                fontSize: '13px',
                transition: 'all 0.2s ease',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}
            >
              ⚙️ 設定
            </button>
            <button 
              onClick={handleSignOut}
              style={{
                background: 'rgba(239, 68, 68, 0.1)',
                color: '#ef4444',
                border: '1px solid rgba(239, 68, 68, 0.2)',
                padding: '6px 12px',
                borderRadius: '6px',
                cursor: 'pointer',
                fontWeight: '600',
                fontSize: '13px',
                transition: 'all 0.2s ease'
              }}
            >
              登出
            </button>
          </div>
        </header>

        <div className="admin-content fade-in">
          {activeTab === 'home' && (
            <AdminHome setActiveTab={setActiveTab} />
          )}
          {activeTab === 'attendance' && (
            <AttendanceManager />
          )}
          {activeTab === 'employees' && (
            <EmployeeManager />
          )}
          {activeTab === 'schedules' && (
            <Scheduler />
          )}
          {activeTab === 'payroll' && (
            <PayrollCalculator />
          )}
          {activeTab === 'leaves' && (
            <LeavesManager />
          )}
          {activeTab === 'settings' && (
            <SettingsManager />
          )}
        </div>
      </main>
    </div>
  );
};

export default AdminDashboard;
