import React, { useState } from 'react';
import './AdminDashboard.css';

// Mock data
const mockEmployees = [
  { id: 'EMP001', name: '王小明', role: '工程師', status: 'active' },
  { id: 'EMP002', name: '李大華', role: '設計師', status: 'active' },
  { id: 'EMP003', name: '張小芬', role: '行銷', status: 'inactive' },
];

const mockAttendance = [
  { id: 1, empName: '王小明', date: '2023-10-27', clockIn: '08:55', clockOut: '18:05', status: '正常' },
  { id: 2, empName: '李大華', date: '2023-10-27', clockIn: '09:10', clockOut: '18:30', status: '遲到' },
];

const mockSchedules = [
  { id: 1, empName: '王小明', date: '2023-11-01', shift: '早班 (09:00 - 18:00)', status: '已確認' },
  { id: 2, empName: '李大華', date: '2023-11-01', shift: '晚班 (13:00 - 22:00)', status: '待確認' },
];

const mockPayroll = [
  { id: 1, empName: '王小明', month: '2023-10', baseSalary: 45000, overtime: 1500, deductions: 1200, netSalary: 45300, status: '已發放' },
  { id: 2, empName: '李大華', month: '2023-10', baseSalary: 38000, overtime: 0, deductions: 1200, netSalary: 36800, status: '待審核' },
];

const AdminDashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'attendance' | 'employees' | 'schedules' | 'payroll'>('attendance');

  return (
    <div className="admin-layout">
      <aside className="admin-sidebar">
        <div className="admin-brand">
          <span className="icon">🛡️</span> 
          <h2>HR 管理後台</h2>
        </div>
        
        <nav className="admin-nav">
          <button 
            className={`nav-item ${activeTab === 'attendance' ? 'active' : ''}`}
            onClick={() => setActiveTab('attendance')}
          >
            📊 出勤紀錄
          </button>
          <button 
            className={`nav-item ${activeTab === 'employees' ? 'active' : ''}`}
            onClick={() => setActiveTab('employees')}
          >
            👥 員工管理
          </button>
          <button 
            className={`nav-item ${activeTab === 'schedules' ? 'active' : ''}`}
            onClick={() => setActiveTab('schedules')}
          >
            📅 排班系統
          </button>
          <button 
            className={`nav-item ${activeTab === 'payroll' ? 'active' : ''}`}
            onClick={() => setActiveTab('payroll')}
          >
            💰 薪資計算
          </button>
          <a href="/" className="nav-item return-link">
            ⬅️ 返回前台打卡
          </a>
        </nav>
      </aside>

      <main className="admin-main">
        <header className="admin-header">
          <h1>
            {activeTab === 'attendance' && '今日出勤狀況'}
            {activeTab === 'employees' && '員工列表'}
            {activeTab === 'schedules' && '排班系統'}
            {activeTab === 'payroll' && '薪資計算'}
          </h1>
          <div className="admin-user">
            <span>管理員 (Admin)</span>
            <div className="avatar">A</div>
          </div>
        </header>

        <div className="admin-content fade-in">
          {activeTab === 'attendance' && (
            <div className="card">
              <div className="card-header">
                <h3>即時打卡紀錄</h3>
                <button className="btn-primary btn-sm">匯出報表</button>
              </div>
              <div className="table-responsive">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>員工姓名</th>
                      <th>日期</th>
                      <th>上班時間</th>
                      <th>下班時間</th>
                      <th>狀態</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mockAttendance.map(record => (
                      <tr key={record.id}>
                        <td>{record.empName}</td>
                        <td>{record.date}</td>
                        <td>{record.clockIn}</td>
                        <td>{record.clockOut}</td>
                        <td>
                          <span className={`badge badge-${record.status === '正常' ? 'success' : 'warning'}`}>
                            {record.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'employees' && (
            <div className="card">
              <div className="card-header">
                <h3>人員名單</h3>
                <button className="btn-primary btn-sm">+ 新增員工帳號</button>
              </div>
              <div className="table-responsive">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>員工編號</th>
                      <th>姓名</th>
                      <th>職位</th>
                      <th>帳號狀態</th>
                      <th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mockEmployees.map(emp => (
                      <tr key={emp.id}>
                        <td>{emp.id}</td>
                        <td>{emp.name}</td>
                        <td>{emp.role}</td>
                        <td>
                          <span className={`badge badge-${emp.status === 'active' ? 'success' : 'neutral'}`}>
                            {emp.status === 'active' ? '啟用中' : '已停用'}
                          </span>
                        </td>
                        <td>
                          <button className="btn-text">編輯</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'schedules' && (
            <div className="card">
              <div className="card-header">
                <h3>本週班表</h3>
                <button className="btn-primary btn-sm">+ 新增排班</button>
              </div>
              <div className="table-responsive">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>員工姓名</th>
                      <th>日期</th>
                      <th>班別時間</th>
                      <th>狀態</th>
                      <th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mockSchedules.map(schedule => (
                      <tr key={schedule.id}>
                        <td>{schedule.empName}</td>
                        <td>{schedule.date}</td>
                        <td>{schedule.shift}</td>
                        <td>
                          <span className={`badge badge-${schedule.status === '已確認' ? 'success' : 'warning'}`}>
                            {schedule.status}
                          </span>
                        </td>
                        <td>
                          <button className="btn-text">調整</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'payroll' && (
            <div className="card">
              <div className="card-header">
                <h3>本月薪資結算</h3>
                <button className="btn-primary btn-sm">一鍵計算本月薪資</button>
              </div>
              <div className="table-responsive">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>員工姓名</th>
                      <th>結算月份</th>
                      <th>底薪</th>
                      <th>加班費</th>
                      <th>扣款 (勞健保/請假)</th>
                      <th>實發薪資</th>
                      <th>狀態</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mockPayroll.map(record => (
                      <tr key={record.id}>
                        <td>{record.empName}</td>
                        <td>{record.month}</td>
                        <td>NT$ {record.baseSalary.toLocaleString()}</td>
                        <td>NT$ {record.overtime.toLocaleString()}</td>
                        <td>-NT$ {record.deductions.toLocaleString()}</td>
                        <td style={{ fontWeight: '600', color: 'var(--primary)' }}>
                          NT$ {record.netSalary.toLocaleString()}
                        </td>
                        <td>
                          <span className={`badge badge-${record.status === '已發放' ? 'success' : 'neutral'}`}>
                            {record.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default AdminDashboard;
