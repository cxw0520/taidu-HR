import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getApps, initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { db, auth } from '../firebase';
import { collection, query, orderBy, onSnapshot, doc, setDoc } from 'firebase/firestore';
import './AdminDashboard.css';

const secondaryAppConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

const getSecondaryAuth = () => {
  const apps = getApps();
  const secondaryApp = apps.find(app => app.name === 'secondary') || initializeApp(secondaryAppConfig, 'secondary');
  return getAuth(secondaryApp);
};


const AdminDashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'attendance' | 'employees' | 'schedules' | 'payroll'>('attendance');
  const [attendance, setAttendance] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // 新增員工帳號 Form states
  const [showAddModal, setShowAddModal] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState('工程師');
  const [roles, setRoles] = useState(['工程師', '設計師', '行銷', '專案經理', '行政總務']);
  const [showAddRoleInput, setShowAddRoleInput] = useState(false);
  const [customRoleName, setCustomRoleName] = useState('');
  const [addError, setAddError] = useState('');
  const [addSuccess, setAddSuccess] = useState('');
  const [creating, setCreating] = useState(false);

  const handleAddCustomRole = (e: React.MouseEvent) => {
    e.preventDefault();
    const cleanRoleName = customRoleName.trim();
    if (cleanRoleName) {
      if (!roles.includes(cleanRoleName)) {
        setRoles([...roles, cleanRoleName]);
        setNewRole(cleanRoleName);
        setCustomRoleName('');
        setShowAddRoleInput(false);
      } else {
        setAddError('該職務名稱已存在');
      }
    }
  };

  useEffect(() => {
    const q = query(collection(db, 'attendance'), orderBy('timestamp', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const records = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      // 如果資料庫是空的，則顯示 Mock 資料
      if (records.length === 0) {
        setAttendance([
          { id: '1', empName: '王小明', date: '2023-10-27', time: '08:55', type: '上班', status: '正常' },
          { id: '2', empName: '李大華', date: '2023-10-27', time: '18:30', type: '下班', status: '正常' },
        ]);
      } else {
        setAttendance(records);
      }
    }, (error) => {
      console.error("Firestore read error:", error);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const q = query(collection(db, 'employees'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const records = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      if (records.length === 0) {
        setEmployees([
          { id: 'EMP001', name: '王小明', role: '工程師', status: 'active' },
          { id: 'EMP002', name: '李大華', role: '設計師', status: 'active' },
          { id: 'EMP003', name: '張小芬', role: '行銷', status: 'inactive' },
        ]);
      } else {
        setEmployees(records);
      }
    });
    return () => unsubscribe();
  }, []);

  const handleCreateEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddError('');
    setAddSuccess('');
    setCreating(true);

    try {
      const secondaryAuth = getSecondaryAuth();
      // 1. 在 Firebase Auth 建立帳號
      const userCredential = await createUserWithEmailAndPassword(secondaryAuth, newEmail, newPassword);
      const uid = userCredential.user.uid;

      // 2. 在 Firestore 新增該員工的基本資料
      await setDoc(doc(db, 'employees', uid), {
        id: uid,
        name: newName,
        email: newEmail,
        role: newRole,
        status: 'active'
      });

      // 3. 次要 App 實體登出，防止干涉主要 auth 狀態
      const { signOut: secondarySignOut } = await import('firebase/auth');
      await secondarySignOut(secondaryAuth);

      setAddSuccess(`帳號 ${newEmail} 建立成功！`);
      setNewEmail('');
      setNewPassword('');
      setNewName('');
      setTimeout(() => {
        setShowAddModal(false);
        setAddSuccess('');
      }, 1500);
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/email-already-in-use') {
        setAddError('該電子信箱已被註冊使用');
      } else if (err.code === 'auth/weak-password') {
        setAddError('密碼強度太弱 (至少需要 6 個字元)');
      } else {
        setAddError(err.message || '建立失敗，請稍後再試');
      }
    } finally {
      setCreating(false);
    }
  };

  const handleSignOut = () => {
    signOut(auth);
  };

  // 排班與薪資 State
  const [schedules, setSchedules] = useState<any[]>([]);
  const [payroll, setPayroll] = useState<any[]>([]);

  // 排班彈窗與 Form states
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [schedEmployeeId, setSchedEmployeeId] = useState('');
  const [schedDate, setSchedDate] = useState('');
  const [schedShift, setSchedShift] = useState('早班 (09:00 - 18:00)');
  const [schedError, setSchedError] = useState('');
  const [schedSuccess, setSchedSuccess] = useState('');
  const [creatingSchedule, setCreatingSchedule] = useState(false);

  // 薪資計算 states
  const [generatingPayroll, setGeneratingPayroll] = useState(false);
  const [payError, setPayError] = useState('');
  const [paySuccess, setPaySuccess] = useState('');

  useEffect(() => {
    const q = query(collection(db, 'schedules'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const records = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      if (records.length === 0) {
        setSchedules([
          { id: '1', empName: '王小明', date: '2023-11-01', shift: '早班 (09:00 - 18:00)', status: '已確認' },
          { id: '2', empName: '李大華', date: '2023-11-01', shift: '晚班 (13:00 - 22:00)', status: '待確認' },
        ]);
      } else {
        // 按照時間戳排序
        records.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        setSchedules(records);
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const q = query(collection(db, 'payroll'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const records = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      if (records.length === 0) {
        setPayroll([
          { id: '1', empName: '王小明', month: '2023-10', baseSalary: 45000, overtime: 1500, deductions: 1200, netSalary: 45300, status: '已發放' },
          { id: '2', empName: '李大華', month: '2023-10', baseSalary: 38000, overtime: 0, deductions: 1200, netSalary: 36800, status: '待審核' },
        ]);
      } else {
        records.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        setPayroll(records);
      }
    });
    return () => unsubscribe();
  }, []);

  const handleCreateSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    setSchedError('');
    setSchedSuccess('');
    setCreatingSchedule(true);

    const emp = employees.find(e => e.id === schedEmployeeId) || employees[0];
    const empName = emp ? emp.name : '未知員工';

    try {
      await setDoc(doc(collection(db, 'schedules')), {
        empName: empName,
        employeeId: schedEmployeeId || 'EMP001',
        date: schedDate || new Date().toLocaleDateString('sv'),
        shift: schedShift,
        status: '待確認',
        timestamp: new Date().getTime()
      });
      setSchedSuccess('排班建立成功！');
      setSchedEmployeeId('');
      setSchedDate('');
      setTimeout(() => {
        setShowScheduleModal(false);
        setSchedSuccess('');
      }, 1500);
    } catch (err: any) {
      console.error(err);
      setSchedError(err.message || '建立失敗');
    } finally {
      setCreatingSchedule(false);
    }
  };

  const handleToggleScheduleStatus = async (id: string, currentStatus: string) => {
    try {
      const newStatus = currentStatus === '已確認' ? '待確認' : '已確認';
      const { updateDoc, doc: firestoreDoc } = await import('firebase/firestore');
      await updateDoc(firestoreDoc(db, 'schedules', id), {
        status: newStatus
      });
    } catch (err) {
      console.error("Failed to update schedule status:", err);
    }
  };

  const handleGeneratePayroll = async () => {
    setPayError('');
    setPaySuccess('');
    setGeneratingPayroll(true);

    try {
      const currentMonth = new Date().toISOString().substring(0, 7); // YYYY-MM
      const { setDoc: fsSetDoc, doc: firestoreDoc } = await import('firebase/firestore');
      
      let employeesList = employees;
      if (employeesList.length === 0 || employeesList[0].id === 'EMP001') {
        const { getDocs } = await import('firebase/firestore');
        const querySnapshot = await getDocs(collection(db, 'employees'));
        employeesList = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() as any }));
      }

      if (employeesList.length === 0) {
        setPayError('目前沒有已註冊的員工，請先新增員工帳號。');
        setGeneratingPayroll(false);
        return;
      }

      for (const emp of employeesList) {
        let baseSalary = 32000;
        if (emp.role && emp.role.includes('工程師')) baseSalary = 45000;
        else if (emp.role && emp.role.includes('設計師')) baseSalary = 38000;
        else if (emp.role && emp.role.includes('專案經理')) baseSalary = 50000;

        const overtime = Math.floor(Math.random() * 5) * 500;
        const deductions = 1200;
        const netSalary = baseSalary + overtime - deductions;
        
        const payrollId = `${emp.id}-${currentMonth}`;
        await fsSetDoc(firestoreDoc(db, 'payroll', payrollId), {
          empName: emp.name,
          employeeId: emp.id,
          month: currentMonth,
          baseSalary: baseSalary,
          overtime: overtime,
          deductions: deductions,
          netSalary: netSalary,
          status: '待審核',
          timestamp: new Date().getTime()
        });
      }

      setPaySuccess('本月薪資一鍵計算生成完成！');
      setTimeout(() => setPaySuccess(''), 3000);
    } catch (err: any) {
      console.error(err);
      setPayError(err.message || '計算失敗');
    } finally {
      setGeneratingPayroll(false);
    }
  };

  const handleTogglePayrollStatus = async (id: string, currentStatus: string) => {
    try {
      const newStatus = currentStatus === '已發放' ? '待審核' : '已發放';
      const { updateDoc, doc: firestoreDoc } = await import('firebase/firestore');
      await updateDoc(firestoreDoc(db, 'payroll', id), {
        status: newStatus
      });
    } catch (err) {
      console.error("Failed to update payroll status:", err);
    }
  };

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
            className={`nav-item ${activeTab === 'attendance' ? 'active' : ''}`}
            onClick={() => { setActiveTab('attendance'); setIsSidebarOpen(false); }}
          >
            📊 出勤紀錄
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
          <Link to="/" className="nav-item return-link" onClick={() => setIsSidebarOpen(false)}>
            ⬅️ 返回前台打卡
          </Link>
        </nav>
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
            {activeTab === 'attendance' && '今日出勤狀況'}
            {activeTab === 'employees' && '員工列表'}
            {activeTab === 'schedules' && '排班系統'}
            {activeTab === 'payroll' && '薪資計算'}
          </h1>
          <div className="admin-user" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span>管理員 (Admin)</span>
            <div className="avatar">A</div>
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
                      <th>時間</th>
                      <th>類型</th>
                      <th>狀態</th>
                    </tr>
                  </thead>
                  <tbody>
                    {attendance.map(record => (
                      <tr key={record.id}>
                        <td>{record.empName}</td>
                        <td>{record.date}</td>
                        <td>{record.time}</td>
                        <td>
                          <span className={`badge badge-${record.type === '上班' ? 'primary' : 'neutral'}`}>
                            {record.type}
                          </span>
                        </td>
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
                <button className="btn-primary btn-sm" onClick={() => setShowAddModal(true)}>+ 新增員工帳號</button>
              </div>
              <div className="table-responsive">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>員工編號</th>
                      <th>姓名</th>
                      <th>電子信箱</th>
                      <th>職位</th>
                      <th>帳號狀態</th>
                    </tr>
                  </thead>
                  <tbody>
                    {employees.map(emp => (
                      <tr key={emp.id}>
                        <td style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{emp.id}</td>
                        <td>{emp.name}</td>
                        <td>{emp.email || 'N/A'}</td>
                        <td>{emp.role}</td>
                        <td>
                          <span className={`badge badge-${emp.status === 'active' ? 'success' : 'neutral'}`}>
                            {emp.status === 'active' ? '啟用中' : '已停用'}
                          </span>
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
                <button className="btn-primary btn-sm" onClick={() => setShowScheduleModal(true)}>+ 新增排班</button>
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
                    {schedules.map(schedule => (
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
                          <button className="btn-text" onClick={() => handleToggleScheduleStatus(schedule.id, schedule.status)}>調整狀態</button>
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
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                  {payError && <span style={{ color: '#ef4444', fontSize: '13px' }}>⚠️ {payError}</span>}
                  {paySuccess && <span style={{ color: '#10b981', fontSize: '13px' }}>✅ {paySuccess}</span>}
                  <button className="btn-primary btn-sm" onClick={handleGeneratePayroll} disabled={generatingPayroll}>
                    {generatingPayroll ? '計算中...' : '一鍵計算本月薪資'}
                  </button>
                </div>
              </div>
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
                      <th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payroll.map(record => (
                      <tr key={record.id}>
                        <td>{record.empName}</td>
                        <td>{record.month}</td>
                        <td>NT$ {record.baseSalary?.toLocaleString()}</td>
                        <td>NT$ {record.overtime?.toLocaleString()}</td>
                        <td>-NT$ {record.deductions?.toLocaleString()}</td>
                        <td style={{ fontWeight: '600', color: 'var(--primary)' }}>
                          NT$ {record.netSalary?.toLocaleString()}
                        </td>
                        <td>
                          <span className={`badge badge-${record.status === '已發放' ? 'success' : 'neutral'}`}>
                            {record.status}
                          </span>
                        </td>
                        <td>
                          <button className="btn-text" onClick={() => handleTogglePayrollStatus(record.id, record.status)}>
                            切換狀態
                          </button>
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

      {/* 新增員工彈窗 */}
      {showAddModal && (
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
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
          }}>
            <h3 style={{ marginBottom: '20px', color: 'var(--primary)', fontSize: '20px', fontWeight: '700' }}>新增員工帳號</h3>
            
            {addError && <div style={{ color: '#ef4444', backgroundColor: 'rgba(239, 68, 68, 0.1)', padding: '10px', borderRadius: '6px', marginBottom: '16px', fontSize: '14px' }}>⚠️ {addError}</div>}
            {addSuccess && <div style={{ color: '#10b981', backgroundColor: 'rgba(16, 185, 129, 0.1)', padding: '10px', borderRadius: '6px', marginBottom: '16px', fontSize: '14px' }}>✅ {addSuccess}</div>}

            <form onSubmit={handleCreateEmployee} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '13px', fontWeight: '600' }}>姓名</label>
                <input 
                  type="text" 
                  required 
                  value={newName} 
                  onChange={(e) => setNewName(e.target.value)} 
                  placeholder="例如：陳大明"
                  style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px' }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '13px', fontWeight: '600' }}>電子信箱 (作為登入帳號)</label>
                <input 
                  type="email" 
                  required 
                  value={newEmail} 
                  onChange={(e) => setNewEmail(e.target.value)} 
                  placeholder="employee@company.com"
                  style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px' }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '13px', fontWeight: '600' }}>初始密碼 (至少 6 碼)</label>
                <input 
                  type="password" 
                  required 
                  value={newPassword} 
                  onChange={(e) => setNewPassword(e.target.value)} 
                  placeholder="••••••••"
                  style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px' }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label style={{ fontSize: '13px', fontWeight: '600' }}>職位</label>
                  <button 
                    type="button" 
                    onClick={() => setShowAddRoleInput(!showAddRoleInput)}
                    style={{ fontSize: '12px', color: 'var(--primary)', fontWeight: '600', padding: 0, border: 'none', background: 'none', cursor: 'pointer' }}
                  >
                    + 新增自訂職務
                  </button>
                </div>

                {showAddRoleInput && (
                  <div style={{ display: 'flex', gap: '8px', marginBottom: '4px' }}>
                    <input 
                      type="text" 
                      placeholder="新職務名稱，如：廚師" 
                      value={customRoleName}
                      onChange={(e) => setCustomRoleName(e.target.value)}
                      style={{ flex: 1, padding: '8px 12px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '13px' }}
                    />
                    <button 
                      type="button" 
                      onClick={handleAddCustomRole}
                      style={{ padding: '8px 12px', borderRadius: '6px', backgroundColor: 'var(--primary)', color: '#fff', fontSize: '13px', fontWeight: '600', border: 'none', cursor: 'pointer' }}
                    >
                      新增
                    </button>
                  </div>
                )}

                <select 
                  value={newRole} 
                  onChange={(e) => setNewRole(e.target.value)}
                  style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px', backgroundColor: '#fff' }}
                >
                  {roles.map(role => (
                    <option key={role} value={role}>{role}</option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
                <button 
                  type="button" 
                  onClick={() => setShowAddModal(false)}
                  style={{ flex: 1, padding: '12px', borderRadius: '8px', border: '1px solid #d1d5db', backgroundColor: '#f3f4f6', cursor: 'pointer', fontWeight: '600', fontSize: '14px' }}
                >
                  取消
                </button>
                <button 
                  type="submit" 
                  disabled={creating}
                  style={{ flex: 1, padding: '12px', borderRadius: '8px', border: 'none', backgroundColor: 'var(--primary)', color: '#fff', cursor: 'pointer', fontWeight: '600', fontSize: '14px' }}
                >
                  {creating ? '建立中...' : '建立帳號'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 新增排班彈窗 */}
      {showScheduleModal && (
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
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
          }}>
            <h3 style={{ marginBottom: '20px', color: 'var(--primary)', fontSize: '20px', fontWeight: '700' }}>新增排班</h3>
            
            {schedError && <div style={{ color: '#ef4444', backgroundColor: 'rgba(239, 68, 68, 0.1)', padding: '10px', borderRadius: '6px', marginBottom: '16px', fontSize: '14px' }}>⚠️ {schedError}</div>}
            {schedSuccess && <div style={{ color: '#10b981', backgroundColor: 'rgba(16, 185, 129, 0.1)', padding: '10px', borderRadius: '6px', marginBottom: '16px', fontSize: '14px' }}>✅ {schedSuccess}</div>}

            <form onSubmit={handleCreateSchedule} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '13px', fontWeight: '600' }}>選擇員工</label>
                <select 
                  required
                  value={schedEmployeeId} 
                  onChange={(e) => setSchedEmployeeId(e.target.value)}
                  style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px', backgroundColor: '#fff' }}
                >
                  <option value="">-- 請選擇員工 --</option>
                  {employees.map(emp => (
                    <option key={emp.id} value={emp.id}>{emp.name} ({emp.role})</option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '13px', fontWeight: '600' }}>排班日期</label>
                <input 
                  type="date" 
                  required 
                  value={schedDate} 
                  onChange={(e) => setSchedDate(e.target.value)} 
                  style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px' }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '13px', fontWeight: '600' }}>班別時間</label>
                <select 
                  value={schedShift} 
                  onChange={(e) => setSchedShift(e.target.value)}
                  style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px', backgroundColor: '#fff' }}
                >
                  <option value="早班 (09:00 - 18:00)">早班 (09:00 - 18:00)</option>
                  <option value="中班 (13:00 - 22:00)">中班 (13:00 - 22:00)</option>
                  <option value="晚班 (18:00 - 02:00)">晚班 (18:00 - 02:00)</option>
                </select>
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
                <button 
                  type="button" 
                  onClick={() => setShowScheduleModal(false)}
                  style={{ flex: 1, padding: '12px', borderRadius: '8px', border: '1px solid #d1d5db', backgroundColor: '#f3f4f6', cursor: 'pointer', fontWeight: '600', fontSize: '14px' }}
                >
                  取消
                </button>
                <button 
                  type="submit" 
                  disabled={creatingSchedule}
                  style={{ flex: 1, padding: '12px', borderRadius: '8px', border: 'none', backgroundColor: 'var(--primary)', color: '#fff', cursor: 'pointer', fontWeight: '600', fontSize: '14px' }}
                >
                  {creatingSchedule ? '建立中...' : '確認排班'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;
