import React, { useState } from 'react';
import { useAdminData } from '../context/AdminDataContext';
import { getApps, initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword } from 'firebase/auth';

// 台灣勞動申報級距
const LABOR_GRADES_MONTHLY = [29500, 30300, 31800, 33300, 34800, 36300, 38200, 40100, 42000, 43900, 45800];
const LABOR_GRADES_HOURLY = [
  11100, 12540, 13500, 15840, 16500, 17280, 17820, 19080, 20008, 21009, 22000, 23100, 24000, 25200, 26400, 27600, 28800,
  29500, 30300, 31800, 33300, 34800, 36300, 38200, 40100, 42000, 43900, 45800
];
const PENSION_GRADES_MONTHLY = [
  29500, 30300, 31800, 33300, 34800, 36300, 38200, 40100, 42000, 43900, 45800, 48200, 50600, 53000, 55400, 57800, 60800, 63800, 66800, 69800, 72800, 76500, 80200, 83900, 87600, 92100, 96600, 101100, 105600, 110100, 115500, 120900, 126300, 131700, 137100, 142500, 147900, 150000
];
const PENSION_GRADES_HOURLY = [
  11100, 12540, 13500, 15840, 16500, 17280, 17820, 19080, 20008, 21009, 22000, 23100, 24000, 25200, 26400, 27600, 28800,
  29500, 30300, 31800, 33300, 34800, 36300, 38200, 40100, 42000, 43900, 45800, 48200, 50600, 53000, 55400, 57800, 60800, 63800, 66800, 69800, 72800, 76500, 80200, 83900, 87600, 92100, 96600, 101100, 105600, 110100, 115500, 120900, 126300, 131700, 137100, 142500, 147900, 150000
];
const NHI_GRADES = [
  29500, 30300, 31800, 33300, 34800, 36300, 38200, 40100, 42000, 43900, 45800, 48200, 50600, 53000, 55400, 57800, 60800, 63800, 66800, 69800, 72800, 76500, 80200, 83900, 87600, 92100, 96600, 101100, 105600, 110100, 115500, 120900, 126300, 131700, 137100, 142500, 147900, 150000
];

const findClosestGrade = (salary: number, grades: number[]): number => {
  if (grades.length === 0) return 0;
  const match = grades.find(g => g >= salary);
  return match !== undefined ? match : grades[grades.length - 1];
};

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

const EmployeeManager: React.FC = () => {
  const {
    employees,
    roles,
    addEmployee,
    updateEmployee,
    deleteEmployee,
    saveRoles
  } = useAdminData();

  // Add Employee Form States
  const [showAddModal, setShowAddModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState(roles[0] || '工程師');
  const [newIdentityNumber, setNewIdentityNumber] = useState('');
  const [newOnboardDate, setNewOnboardDate] = useState(new Date().toISOString().substring(0, 10));
  const [newBankAccount, setNewBankAccount] = useState('');
  const [newBirthDate, setNewBirthDate] = useState('');
  const [newAddress, setNewAddress] = useState('');
  
  // Emergency Contact
  const [newEmergencyContactName, setNewEmergencyContactName] = useState('');
  const [newEmergencyContactRelation, setNewEmergencyContactRelation] = useState('');
  const [newEmergencyContactPhone, setNewEmergencyContactPhone] = useState('');

  // Salary & Insurance
  const [newSalaryType, setNewSalaryType] = useState<'monthly' | 'hourly'>('monthly');
  const [newMonthlySalary, setNewMonthlySalary] = useState<number>(32000);
  const [newLaborSub, setNewLaborSub] = useState<number>(33300);
  const [newNhiSub, setNewNhiSub] = useState<number>(33300);
  const [newPensionSub, setNewPensionSub] = useState<number>(33300);
  const [newSupervisorId, setNewSupervisorId] = useState('');
  const [newNhiDependents, setNewNhiDependents] = useState<number>(0);

  // Allowances
  const [newAttendanceBonus, setNewAttendanceBonus] = useState<number>(0);
  const [newOtherAllowance, setNewOtherAllowance] = useState<number>(0);
  const [newRoleAllowance, setNewRoleAllowance] = useState<number>(0);
  const [newEvaluationAllowance, setNewEvaluationAllowance] = useState<number>(0);

  // Base64 Files
  const [newFileIdCard, setNewFileIdCard] = useState<string>('');
  const [newFileBankbook, setNewFileBankbook] = useState<string>('');
  const [newFileContract, setNewFileContract] = useState<string>('');

  const [addError, setAddError] = useState('');
  const [addSuccess, setAddSuccess] = useState('');
  const [creating, setCreating] = useState(false);

  // Roles settings
  const [showAddRoleInput, setShowAddRoleInput] = useState(false);
  const [customRoleName, setCustomRoleName] = useState('');

  // Edit Employee Form States
  const [showEditEmployeeModal, setShowEditEmployeeModal] = useState(false);
  const [editEmployeeId, setEditEmployeeId] = useState('');
  const [editEmpName, setEditEmpName] = useState('');
  const [editEmpRole, setEditEmpRole] = useState('');
  const [editEmpStatus, setEditEmpStatus] = useState('active');
  const [editIdentityNumber, setEditIdentityNumber] = useState('');
  const [editOnboardDate, setEditOnboardDate] = useState('');
  const [editResignDate, setEditResignDate] = useState('');
  const [editBankAccount, setEditBankAccount] = useState('');
  const [editBirthDate, setEditBirthDate] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [editEmergencyContactName, setEditEmergencyContactName] = useState('');
  const [editEmergencyContactRelation, setEditEmergencyContactRelation] = useState('');
  const [editEmergencyContactPhone, setEditEmergencyContactPhone] = useState('');
  
  const [editSalaryType, setEditSalaryType] = useState<'monthly' | 'hourly'>('monthly');
  const [editMonthlySalary, setEditMonthlySalary] = useState<number>(32000);
  const [editLaborSub, setEditLaborSub] = useState<number>(31800);
  const [editNhiSub, setEditNhiSub] = useState<number>(31800);
  const [editPensionSub, setEditPensionSub] = useState<number>(31800);
  const [editSupervisorId, setEditSupervisorId] = useState('');
  const [editNhiDependents, setEditNhiDependents] = useState<number>(0);
  const [editAttendanceBonus, setEditAttendanceBonus] = useState<number>(0);
  const [editOtherAllowance, setEditOtherAllowance] = useState<number>(0);
  const [editRoleAllowance, setEditRoleAllowance] = useState<number>(0);
  const [editEvaluationAllowance, setEditEvaluationAllowance] = useState<number>(0);
  
  const [editFileIdCard, setEditFileIdCard] = useState<string>('');
  const [editFileBankbook, setEditFileBankbook] = useState<string>('');
  const [editFileContract, setEditFileContract] = useState<string>('');

  const handleAddCustomRole = async (e: React.MouseEvent) => {
    e.preventDefault();
    const cleanRoleName = customRoleName.trim();
    if (cleanRoleName) {
      if (!roles.includes(cleanRoleName)) {
        const updatedRoles = [...roles, cleanRoleName];
        await saveRoles(updatedRoles);
        setNewRole(cleanRoleName);
        setCustomRoleName('');
        setShowAddRoleInput(false);
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
    await saveRoles(updatedRoles);
    setNewRole(updatedRoles[0]);
  };

  const handleCreateEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddError('');
    setAddSuccess('');
    setCreating(true);

    try {
      const secondaryAuth = getSecondaryAuth();
      const userCredential = await createUserWithEmailAndPassword(secondaryAuth, newEmail, newPassword);
      const uid = userCredential.user.uid;

      await addEmployee(uid, {
        id: uid,
        name: newName,
        email: newEmail,
        role: newRole,
        status: 'active',
        identityNumber: newIdentityNumber,
        onboardDate: newOnboardDate,
        resignDate: null,
        bankAccount: newBankAccount,
        monthlySalary: Number(newMonthlySalary),
        laborSub: Number(newLaborSub),
        nhiSub: Number(newNhiSub),
        pensionSub: Number(newPensionSub),
        supervisorId: newSupervisorId,
        salaryType: newSalaryType,
        nhiDependents: Number(newNhiDependents),
        attendanceBonus: Number(newAttendanceBonus),
        otherAllowance: Number(newOtherAllowance),
        roleAllowance: Number(newRoleAllowance),
        evaluationAllowance: Number(newEvaluationAllowance),
        fileIdCard: newFileIdCard,
        fileBankbook: newFileBankbook,
        fileContract: newFileContract,
        emergencyContactName: newEmergencyContactName,
        emergencyContactPhone: newEmergencyContactPhone,
        emergencyContactRelation: newEmergencyContactRelation,
        address: newAddress,
        birthDate: newBirthDate,
        isAdmin: false // 預設不是 Admin，若有需要可於 Firebase 控制台設定
      });

      const { signOut: secondarySignOut } = await import('firebase/auth');
      await secondarySignOut(secondaryAuth);

      setAddSuccess(`帳號 ${newEmail} 建立成功！`);
      setNewEmail('');
      setNewPassword('');
      setNewName('');
      setNewIdentityNumber('');
      setNewBankAccount('');
      setNewMonthlySalary(32000);
      setNewLaborSub(33300);
      setNewNhiSub(33300);
      setNewPensionSub(33300);
      setNewSupervisorId('');
      setNewSalaryType('monthly');
      setNewNhiDependents(0);
      setNewAttendanceBonus(0);
      setNewOtherAllowance(0);
      setNewRoleAllowance(0);
      setNewEvaluationAllowance(0);
      setNewFileIdCard('');
      setNewFileBankbook('');
      setNewFileContract('');
      setNewEmergencyContactName('');
      setNewEmergencyContactPhone('');
      setNewEmergencyContactRelation('');
      setNewAddress('');
      setNewBirthDate('');
      
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

  const handleOpenEditEmployee = (emp: any) => {
    if (emp.id === 'EMP001' || emp.id === 'EMP002' || emp.id === 'EMP003') {
      alert('模擬資料無法編輯。請使用新增帳號建立真實資料進行操作。');
      return;
    }
    setEditEmployeeId(emp.id);
    setEditEmpName(emp.name || '');
    setEditEmpRole(emp.role || roles[0]);
    setEditEmpStatus(emp.status || 'active');
    setEditIdentityNumber(emp.identityNumber || '');
    setEditOnboardDate(emp.onboardDate || '');
    setEditResignDate(emp.resignDate || '');
    setEditBankAccount(emp.bankAccount || '');
    const salType = emp.salaryType || 'monthly';
    const laborGrades = salType === 'monthly' ? LABOR_GRADES_MONTHLY : LABOR_GRADES_HOURLY;
    const pensionGrades = salType === 'monthly' ? PENSION_GRADES_MONTHLY : PENSION_GRADES_HOURLY;

    setEditSalaryType(salType);
    setEditMonthlySalary(emp.monthlySalary || 32000);
    setEditLaborSub(emp.laborSub === 0 ? 0 : findClosestGrade(emp.laborSub || 31800, laborGrades));
    setEditNhiSub(emp.nhiSub === 0 ? 0 : findClosestGrade(emp.nhiSub || 31800, NHI_GRADES));
    setEditPensionSub(emp.pensionSub === 0 ? 0 : findClosestGrade(emp.pensionSub || 31800, pensionGrades));
    setEditSupervisorId(emp.supervisorId || '');
    setEditNhiDependents(emp.nhiDependents || 0);
    setEditAttendanceBonus(emp.attendanceBonus || 0);
    setEditOtherAllowance(emp.otherAllowance || 0);
    setEditRoleAllowance(emp.roleAllowance || 0);
    setEditEvaluationAllowance(emp.evaluationAllowance || 0);
    setEditFileIdCard(emp.fileIdCard || '');
    setEditFileBankbook(emp.fileBankbook || '');
    setEditFileContract(emp.fileContract || '');
    setEditEmergencyContactName(emp.emergencyContactName || '');
    setEditEmergencyContactPhone(emp.emergencyContactPhone || '');
    setEditEmergencyContactRelation(emp.emergencyContactRelation || '');
    setEditAddress(emp.address || '');
    setEditBirthDate(emp.birthDate || '');
    setShowEditEmployeeModal(true);
  };

  const handleUpdateEmployeeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await updateEmployee(editEmployeeId, {
        name: editEmpName,
        role: editEmpRole,
        status: editEmpStatus,
        identityNumber: editIdentityNumber,
        onboardDate: editOnboardDate,
        resignDate: editResignDate || null,
        bankAccount: editBankAccount,
        monthlySalary: Number(editMonthlySalary),
        laborSub: Number(editLaborSub),
        nhiSub: Number(editNhiSub),
        pensionSub: Number(editPensionSub),
        supervisorId: editSupervisorId,
        salaryType: editSalaryType,
        nhiDependents: Number(editNhiDependents),
        attendanceBonus: Number(editAttendanceBonus),
        otherAllowance: Number(editOtherAllowance),
        roleAllowance: Number(editRoleAllowance),
        evaluationAllowance: Number(editEvaluationAllowance),
        fileIdCard: editFileIdCard,
        fileBankbook: editFileBankbook,
        fileContract: editFileContract,
        emergencyContactName: editEmergencyContactName,
        emergencyContactPhone: editEmergencyContactPhone,
        emergencyContactRelation: editEmergencyContactRelation,
        address: editAddress,
        birthDate: editBirthDate
      });
      setShowEditEmployeeModal(false);
    } catch (err) {
      console.error(err);
      alert('更新失敗，請檢查權限');
    }
  };

  const handleDeleteEmployeeClick = async (id: string) => {
    if (id === 'EMP001' || id === 'EMP002' || id === 'EMP003') {
      alert('模擬資料無法刪除。');
      return;
    }
    if (!window.confirm('確定要刪除此員工帳號與資料嗎？此動作將只刪除 Firestore 資料，Auth 帳號需由管理員至 Firebase 控制台管理。')) return;
    try {
      await deleteEmployee(id);
    } catch (err) {
      console.error(err);
      alert('刪除失敗，請檢查權限');
    }
  };

  return (
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
              <th>計薪類型</th>
              <th>帳號狀態</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {employees.map(emp => (
              <tr key={emp.id}>
                <td data-label="員工編號" style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{emp.id}</td>
                <td data-label="姓名" style={{ fontWeight: '600' }}>{emp.name}</td>
                <td data-label="電子信箱">{emp.email || 'N/A'}</td>
                <td data-label="職位">{emp.role}</td>
                <td data-label="計薪類型">
                  <span className="badge" style={{ backgroundColor: emp.salaryType === 'hourly' ? '#f3f4f6' : 'rgba(79, 70, 229, 0.1)', color: emp.salaryType === 'hourly' ? '#4b5563' : 'var(--primary)', fontWeight: '600', padding: '4px 8px', borderRadius: '4px', fontSize: '12px' }}>
                    {emp.salaryType === 'hourly' ? '時薪工讀' : '月薪排班'}
                  </span>
                </td>
                <td data-label="帳號狀態">
                  <span className={`badge badge-${emp.status === 'active' ? 'success' : 'neutral'}`}>
                    {emp.status === 'active' ? '啟用中' : '已停用'}
                  </span>
                </td>
                <td data-label="操作" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <button className="btn-text" style={{ color: 'var(--primary)', fontWeight: '600' }} onClick={() => handleOpenEditEmployee(emp)}>編輯</button>
                  <button className="btn-text" style={{ color: '#ef4444', fontWeight: '600' }} onClick={() => handleDeleteEmployeeClick(emp.id)}>刪除</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 新增員工彈窗 */}
      {showAddModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0, 0, 0, 0.4)', backdropFilter: 'blur(8px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
          <div className="glass-card" style={{ width: '90%', maxWidth: '450px', padding: '32px', borderRadius: '16px', backgroundColor: '#ffffff', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)', maxHeight: '90vh', overflowY: 'auto' }}>
            <h3 style={{ marginBottom: '20px', color: 'var(--primary)', fontSize: '20px', fontWeight: '700' }}>新增員工帳號</h3>
            {addError && <div style={{ color: '#ef4444', backgroundColor: 'rgba(239, 68, 68, 0.1)', padding: '10px', borderRadius: '6px', marginBottom: '16px', fontSize: '14px' }}>⚠️ {addError}</div>}
            {addSuccess && <div style={{ color: '#10b981', backgroundColor: 'rgba(16, 185, 129, 0.1)', padding: '10px', borderRadius: '6px', marginBottom: '16px', fontSize: '14px' }}>✅ {addSuccess}</div>}
            <form onSubmit={handleCreateEmployee} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '13px', fontWeight: '600' }}>姓名</label>
                <input type="text" required value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="例如：陳大明" style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px' }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '13px', fontWeight: '600' }}>電子信箱</label>
                <input type="email" required value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="employee@company.com" style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px' }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '13px', fontWeight: '600' }}>初始密碼</label>
                <input type="password" required value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="••••••••" style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px' }} />
              </div>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label style={{ fontSize: '13px', fontWeight: '600' }}>職位</label>
                  <div style={{ display: 'flex', gap: '12px' }}>
                    <button type="button" onClick={() => setShowAddRoleInput(!showAddRoleInput)} style={{ fontSize: '12px', color: 'var(--primary)', fontWeight: '600', padding: 0, border: 'none', background: 'none', cursor: 'pointer' }}>+ 新增自訂職務</button>
                    {roles.length > 1 && (
                      <button type="button" onClick={() => handleDeleteRole(newRole)} style={{ fontSize: '12px', color: '#ef4444', fontWeight: '600', padding: 0, border: 'none', background: 'none', cursor: 'pointer' }}>🗑️ 刪除目前職務</button>
                    )}
                  </div>
                </div>
                {showAddRoleInput && (
                  <div style={{ display: 'flex', gap: '8px', marginBottom: '4px' }}>
                    <input type="text" placeholder="新職務名稱" value={customRoleName} onChange={(e) => setCustomRoleName(e.target.value)} style={{ flex: 1, padding: '8px 12px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '13px' }} />
                    <button type="button" onClick={handleAddCustomRole} style={{ padding: '8px 12px', borderRadius: '6px', backgroundColor: 'var(--primary)', color: '#fff', fontSize: '13px', fontWeight: '600', border: 'none', cursor: 'pointer' }}>新增</button>
                  </div>
                )}
                <select value={newRole} onChange={(e) => setNewRole(e.target.value)} style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px', backgroundColor: '#fff' }}>
                  {roles.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '13px', fontWeight: '600' }}>身分證字號</label>
                <input type="text" required value={newIdentityNumber} onChange={(e) => setNewIdentityNumber(e.target.value.toUpperCase())} placeholder="例如：A123456789" style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px' }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '13px', fontWeight: '600' }}>到職日期</label>
                <input type="date" required value={newOnboardDate} onChange={(e) => setNewOnboardDate(e.target.value)} style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px' }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '13px', fontWeight: '600' }}>銀行帳戶</label>
                <input type="text" required value={newBankAccount} onChange={(e) => setNewBankAccount(e.target.value)} placeholder="822-12345..." style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px' }} />
              </div>

              {/* 個人資訊 */}
              <div style={{ borderTop: '1px dashed #e5e7eb', marginTop: '8px', paddingTop: '12px' }}>
                <span style={{ fontSize: '14px', fontWeight: '700', color: 'var(--primary)' }}>👤 個人與聯絡資訊</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '13px', fontWeight: '600' }}>出生日期</label>
                <input type="date" value={newBirthDate} onChange={(e) => setNewBirthDate(e.target.value)} style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px' }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '13px', fontWeight: '600' }}>通訊地址</label>
                <input type="text" value={newAddress} onChange={(e) => setNewAddress(e.target.value)} placeholder="請輸入通訊地址" style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px' }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '12px', fontWeight: '600' }}>聯絡人姓名</label>
                  <input type="text" value={newEmergencyContactName} onChange={(e) => setNewEmergencyContactName(e.target.value)} placeholder="姓名" style={{ padding: '10px 12px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '13px' }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '12px', fontWeight: '600' }}>關係</label>
                  <input type="text" value={newEmergencyContactRelation} onChange={(e) => setNewEmergencyContactRelation(e.target.value)} placeholder="關係" style={{ padding: '10px 12px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '13px' }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '12px', fontWeight: '600' }}>聯絡電話</label>
                  <input type="text" value={newEmergencyContactPhone} onChange={(e) => setNewEmergencyContactPhone(e.target.value)} placeholder="電話" style={{ padding: '10px 12px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '13px' }} />
                </div>
              </div>

              {/* 薪資保額級距 */}
              <div style={{ borderTop: '1px dashed #e5e7eb', marginTop: '8px', paddingTop: '12px' }}>
                <span style={{ fontSize: '14px', fontWeight: '700', color: 'var(--primary)' }}>💼 薪資與投保申報設定</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '13px', fontWeight: '600' }}>計薪類型</label>
                <select value={newSalaryType} onChange={(e) => {
                  const type = e.target.value as 'monthly' | 'hourly';
                  setNewSalaryType(type);
                  const laborGrades = type === 'monthly' ? LABOR_GRADES_MONTHLY : LABOR_GRADES_HOURLY;
                  const pensionGrades = type === 'monthly' ? PENSION_GRADES_MONTHLY : PENSION_GRADES_HOURLY;
                  setNewLaborSub(findClosestGrade(newMonthlySalary, laborGrades));
                  setNewNhiSub(findClosestGrade(newMonthlySalary, NHI_GRADES));
                  setNewPensionSub(findClosestGrade(newMonthlySalary, pensionGrades));
                }} style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px', backgroundColor: '#fff' }}>
                  <option value="monthly">月薪排班</option>
                  <option value="hourly">時薪工讀</option>
                </select>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '13px', fontWeight: '600' }}>{newSalaryType === 'hourly' ? '時薪底薪 (NT$)' : '月薪底薪 (NT$)'}</label>
                <input type="number" required value={newMonthlySalary} onChange={(e) => {
                  const sal = Number(e.target.value);
                  setNewMonthlySalary(sal);
                  const laborGrades = newSalaryType === 'monthly' ? LABOR_GRADES_MONTHLY : LABOR_GRADES_HOURLY;
                  const pensionGrades = newSalaryType === 'monthly' ? PENSION_GRADES_MONTHLY : PENSION_GRADES_HOURLY;
                  setNewLaborSub(findClosestGrade(sal, laborGrades));
                  setNewNhiSub(findClosestGrade(sal, NHI_GRADES));
                  setNewPensionSub(findClosestGrade(sal, pensionGrades));
                }} style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px' }} />
              </div>
              <div style={{ display: 'flex', gap: '12px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1 }}>
                  <label style={{ fontSize: '13px', fontWeight: '600' }}>勞保申報</label>
                  <select value={newLaborSub} onChange={(e) => setNewLaborSub(Number(e.target.value))} style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px', backgroundColor: '#fff' }}>
                    <option value={0}>不投保</option>
                    {(newSalaryType === 'monthly' ? LABOR_GRADES_MONTHLY : LABOR_GRADES_HOURLY).map(g => <option key={g} value={g}>{g.toLocaleString()}</option>)}
                  </select>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1 }}>
                  <label style={{ fontSize: '13px', fontWeight: '600' }}>健保申報</label>
                  <select value={newNhiSub} onChange={(e) => setNewNhiSub(Number(e.target.value))} style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px', backgroundColor: '#fff' }}>
                    <option value={0}>不投保</option>
                    {NHI_GRADES.map(g => <option key={g} value={g}>{g.toLocaleString()}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '13px', fontWeight: '600' }}>勞退提繳工資</label>
                <select value={newPensionSub} onChange={(e) => setNewPensionSub(Number(e.target.value))} style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px', backgroundColor: '#fff' }}>
                  <option value={0}>不投保</option>
                  {(newSalaryType === 'monthly' ? PENSION_GRADES_MONTHLY : PENSION_GRADES_HOURLY).map(g => <option key={g} value={g}>{g.toLocaleString()}</option>)}
                </select>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '13px', fontWeight: '600' }}>直屬主管</label>
                <select value={newSupervisorId} onChange={(e) => setNewSupervisorId(e.target.value)} style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px', backgroundColor: '#fff' }}>
                  <option value="">-- 無主管 --</option>
                  {employees.filter(emp => emp.id !== 'EMP001' && emp.id !== 'EMP002' && emp.id !== 'EMP003').map(emp => <option key={emp.id} value={emp.id}>{emp.name} ({emp.role})</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '13px', fontWeight: '600' }}>健保實際扶養眷屬人數 (0-3 口)</label>
                <select value={newNhiDependents} onChange={(e) => setNewNhiDependents(Number(e.target.value))} style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px', backgroundColor: '#fff' }}>
                  <option value={0}>0 口</option>
                  <option value={1}>1 口</option>
                  <option value={2}>2 口</option>
                  <option value={3}>3 口</option>
                </select>
              </div>

              {/* 固定津貼 */}
              <div style={{ borderTop: '1px dashed #e5e7eb', marginTop: '8px', paddingTop: '12px' }}>
                <span style={{ fontSize: '14px', fontWeight: '700', color: 'var(--primary)' }}>💰 固定非經常性津貼項目</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '12px', fontWeight: '600' }}>全勤獎金 (每月)</label>
                  <input type="number" value={newAttendanceBonus} onChange={(e) => setNewAttendanceBonus(Number(e.target.value))} style={{ padding: '10px 12px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '13px' }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '12px', fontWeight: '600' }}>其他津貼 (每月)</label>
                  <input type="number" value={newOtherAllowance} onChange={(e) => setNewOtherAllowance(Number(e.target.value))} style={{ padding: '10px 12px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '13px' }} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '12px', fontWeight: '600' }}>職務加給 (每月)</label>
                  <input type="number" value={newRoleAllowance} onChange={(e) => setNewRoleAllowance(Number(e.target.value))} style={{ padding: '10px 12px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '13px' }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '12px', fontWeight: '600' }}>考核加給 (每月)</label>
                  <input type="number" value={newEvaluationAllowance} onChange={(e) => setNewEvaluationAllowance(Number(e.target.value))} style={{ padding: '10px 12px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '13px' }} />
                </div>
              </div>

              {/* 檔案上傳 */}
              <div style={{ borderTop: '1px dashed #e5e7eb', marginTop: '8px', paddingTop: '12px' }}>
                <span style={{ fontSize: '14px', fontWeight: '700', color: 'var(--primary)' }}>📁 檔案管理 (人事資料附件)</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '12px', fontWeight: '600' }}>身分證正反面影本</label>
                  <input type="file" accept="image/*,application/pdf" onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      const reader = new FileReader();
                      reader.onloadend = () => setNewFileIdCard(reader.result as string);
                      reader.readAsDataURL(file);
                    }
                  }} style={{ fontSize: '12px' }} />
                  {newFileIdCard && <span style={{ fontSize: '11px', color: '#10b981' }}>✓ 已選取檔案</span>}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '12px', fontWeight: '600' }}>存摺封面影本</label>
                  <input type="file" accept="image/*,application/pdf" onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      const reader = new FileReader();
                      reader.onloadend = () => setNewFileBankbook(reader.result as string);
                      reader.readAsDataURL(file);
                    }
                  }} style={{ fontSize: '12px' }} />
                  {newFileBankbook && <span style={{ fontSize: '11px', color: '#10b981' }}>✓ 已選取檔案</span>}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '12px', fontWeight: '600' }}>勞動契約 (PDF/圖片)</label>
                  <input type="file" accept="image/*,application/pdf" onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      const reader = new FileReader();
                      reader.onloadend = () => setNewFileContract(reader.result as string);
                      reader.readAsDataURL(file);
                    }
                  }} style={{ fontSize: '12px' }} />
                  {newFileContract && <span style={{ fontSize: '11px', color: '#10b981' }}>✓ 已選取檔案</span>}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
                <button type="button" onClick={() => setShowAddModal(false)} style={{ flex: 1, padding: '12px', borderRadius: '8px', border: '1px solid #d1d5db', backgroundColor: '#f3f4f6', cursor: 'pointer', fontWeight: '600', fontSize: '14px' }}>取消</button>
                <button type="submit" disabled={creating} style={{ flex: 1, padding: '12px', borderRadius: '8px', border: 'none', backgroundColor: 'var(--primary)', color: '#fff', cursor: 'pointer', fontWeight: '600', fontSize: '14px' }}>
                  {creating ? '建立中...' : '建立帳號'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 編輯員工彈窗 */}
      {showEditEmployeeModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0, 0, 0, 0.4)', backdropFilter: 'blur(8px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
          <div className="glass-card" style={{ width: '90%', maxWidth: '450px', padding: '32px', borderRadius: '16px', backgroundColor: '#ffffff', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)', maxHeight: '90vh', overflowY: 'auto' }}>
            <h3 style={{ marginBottom: '20px', color: 'var(--primary)', fontSize: '20px', fontWeight: '700' }}>編輯員工資訊</h3>
            <form onSubmit={handleUpdateEmployeeSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '13px', fontWeight: '600' }}>姓名</label>
                <input type="text" required value={editEmpName} onChange={(e) => setEditEmpName(e.target.value)} style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px' }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '13px', fontWeight: '600' }}>職位</label>
                <select value={editEmpRole} onChange={(e) => setEditEmpRole(e.target.value)} style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px', backgroundColor: '#fff' }}>
                  {roles.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '13px', fontWeight: '600' }}>帳號狀態</label>
                <select value={editEmpStatus} onChange={(e) => setEditEmpStatus(e.target.value)} style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px', backgroundColor: '#fff' }}>
                  <option value="active">啟用中</option>
                  <option value="inactive">已停用</option>
                </select>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '13px', fontWeight: '600' }}>身分證字號</label>
                <input type="text" required value={editIdentityNumber} onChange={(e) => setEditIdentityNumber(e.target.value.toUpperCase())} placeholder="例如：A123456789" style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px' }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '13px', fontWeight: '600' }}>到職日期</label>
                <input type="date" required value={editOnboardDate} onChange={(e) => setEditOnboardDate(e.target.value)} style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px' }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '13px', fontWeight: '600' }}>離職日期 (未離職留空)</label>
                <input type="date" value={editResignDate} onChange={(e) => setEditResignDate(e.target.value)} style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px' }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '13px', fontWeight: '600' }}>銀行帳戶</label>
                <input type="text" required value={editBankAccount} onChange={(e) => setEditBankAccount(e.target.value)} placeholder="822-12345..." style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px' }} />
              </div>

              {/* 個人資訊 */}
              <div style={{ borderTop: '1px dashed #e5e7eb', marginTop: '8px', paddingTop: '12px' }}>
                <span style={{ fontSize: '14px', fontWeight: '700', color: 'var(--primary)' }}>👤 個人與聯絡資訊</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '13px', fontWeight: '600' }}>出生日期</label>
                <input type="date" value={editBirthDate} onChange={(e) => setEditBirthDate(e.target.value)} style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px' }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '13px', fontWeight: '600' }}>通訊地址</label>
                <input type="text" value={editAddress} onChange={(e) => setEditAddress(e.target.value)} placeholder="請輸入通訊地址" style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px' }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '12px', fontWeight: '600' }}>聯絡人姓名</label>
                  <input type="text" value={editEmergencyContactName} onChange={(e) => setEditEmergencyContactName(e.target.value)} placeholder="姓名" style={{ padding: '10px 12px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '13px' }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '12px', fontWeight: '600' }}>關係</label>
                  <input type="text" value={editEmergencyContactRelation} onChange={(e) => setEditEmergencyContactRelation(e.target.value)} placeholder="關係" style={{ padding: '10px 12px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '13px' }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '12px', fontWeight: '600' }}>聯絡電話</label>
                  <input type="text" value={editEmergencyContactPhone} onChange={(e) => setEditEmergencyContactPhone(e.target.value)} placeholder="電話" style={{ padding: '10px 12px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '13px' }} />
                </div>
              </div>

              {/* 薪資保額級距 */}
              <div style={{ borderTop: '1px dashed #e5e7eb', marginTop: '8px', paddingTop: '12px' }}>
                <span style={{ fontSize: '14px', fontWeight: '700', color: 'var(--primary)' }}>💼 薪資與投保申報設定</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '13px', fontWeight: '600' }}>計薪類型</label>
                <select value={editSalaryType} onChange={(e) => {
                  const type = e.target.value as 'monthly' | 'hourly';
                  setEditSalaryType(type);
                  const laborGrades = type === 'monthly' ? LABOR_GRADES_MONTHLY : LABOR_GRADES_HOURLY;
                  const pensionGrades = type === 'monthly' ? PENSION_GRADES_MONTHLY : PENSION_GRADES_HOURLY;
                  setEditLaborSub(findClosestGrade(editMonthlySalary, laborGrades));
                  setEditNhiSub(findClosestGrade(editMonthlySalary, NHI_GRADES));
                  setEditPensionSub(findClosestGrade(editMonthlySalary, pensionGrades));
                }} style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px', backgroundColor: '#fff' }}>
                  <option value="monthly">月薪排班</option>
                  <option value="hourly">時薪工讀</option>
                </select>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '13px', fontWeight: '600' }}>{editSalaryType === 'hourly' ? '時薪底薪 (NT$)' : '月薪底薪 (NT$)'}</label>
                <input type="number" required value={editMonthlySalary} onChange={(e) => {
                  const sal = Number(e.target.value);
                  setEditMonthlySalary(sal);
                  const laborGrades = editSalaryType === 'monthly' ? LABOR_GRADES_MONTHLY : LABOR_GRADES_HOURLY;
                  const pensionGrades = editSalaryType === 'monthly' ? PENSION_GRADES_MONTHLY : PENSION_GRADES_HOURLY;
                  setEditLaborSub(findClosestGrade(sal, laborGrades));
                  setEditNhiSub(findClosestGrade(sal, NHI_GRADES));
                  setEditPensionSub(findClosestGrade(sal, pensionGrades));
                }} style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px' }} />
              </div>
              <div style={{ display: 'flex', gap: '12px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1 }}>
                  <label style={{ fontSize: '13px', fontWeight: '600' }}>勞保申報</label>
                  <select value={editLaborSub} onChange={(e) => setEditLaborSub(Number(e.target.value))} style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px', backgroundColor: '#fff' }}>
                    <option value={0}>不投保</option>
                    {(editSalaryType === 'monthly' ? LABOR_GRADES_MONTHLY : LABOR_GRADES_HOURLY).map(g => <option key={g} value={g}>{g.toLocaleString()}</option>)}
                  </select>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1 }}>
                  <label style={{ fontSize: '13px', fontWeight: '600' }}>健保申報</label>
                  <select value={editNhiSub} onChange={(e) => setEditNhiSub(Number(e.target.value))} style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px', backgroundColor: '#fff' }}>
                    <option value={0}>不投保</option>
                    {NHI_GRADES.map(g => <option key={g} value={g}>{g.toLocaleString()}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '13px', fontWeight: '600' }}>勞退提繳工資</label>
                <select value={editPensionSub} onChange={(e) => setEditPensionSub(Number(e.target.value))} style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px', backgroundColor: '#fff' }}>
                  <option value={0}>不投保</option>
                  {(editSalaryType === 'monthly' ? PENSION_GRADES_MONTHLY : PENSION_GRADES_HOURLY).map(g => <option key={g} value={g}>{g.toLocaleString()}</option>)}
                </select>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '13px', fontWeight: '600' }}>直屬主管</label>
                <select value={editSupervisorId} onChange={(e) => setEditSupervisorId(e.target.value)} style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px', backgroundColor: '#fff' }}>
                  <option value="">-- 無主管 --</option>
                  {employees.filter(emp => emp.id !== 'EMP001' && emp.id !== 'EMP002' && emp.id !== 'EMP003' && emp.id !== editEmployeeId).map(emp => <option key={emp.id} value={emp.id}>{emp.name} ({emp.role})</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '13px', fontWeight: '600' }}>健保實際扶養眷屬人數 (0-3 口)</label>
                <select value={editNhiDependents} onChange={(e) => setEditNhiDependents(Number(e.target.value))} style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px', backgroundColor: '#fff' }}>
                  <option value={0}>0 口</option>
                  <option value={1}>1 口</option>
                  <option value={2}>2 口</option>
                  <option value={3}>3 口</option>
                </select>
              </div>

              {/* 固定津貼 */}
              <div style={{ borderTop: '1px dashed #e5e7eb', marginTop: '8px', paddingTop: '12px' }}>
                <span style={{ fontSize: '14px', fontWeight: '700', color: 'var(--primary)' }}>💰 固定非經常性津貼項目</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '12px', fontWeight: '600' }}>全勤獎金 (每月)</label>
                  <input type="number" value={editAttendanceBonus} onChange={(e) => setEditAttendanceBonus(Number(e.target.value))} style={{ padding: '10px 12px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '13px' }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '12px', fontWeight: '600' }}>其他津貼 (每月)</label>
                  <input type="number" value={editOtherAllowance} onChange={(e) => setEditOtherAllowance(Number(e.target.value))} style={{ padding: '10px 12px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '13px' }} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '12px', fontWeight: '600' }}>職務加給 (每月)</label>
                  <input type="number" value={editRoleAllowance} onChange={(e) => setEditRoleAllowance(Number(e.target.value))} style={{ padding: '10px 12px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '13px' }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '12px', fontWeight: '600' }}>考核加給 (每月)</label>
                  <input type="number" value={editEvaluationAllowance} onChange={(e) => setEditEvaluationAllowance(Number(e.target.value))} style={{ padding: '10px 12px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '13px' }} />
                </div>
              </div>

              {/* 檔案附件 */}
              <div style={{ borderTop: '1px dashed #e5e7eb', marginTop: '8px', paddingTop: '12px' }}>
                <span style={{ fontSize: '14px', fontWeight: '700', color: 'var(--primary)' }}>📁 檔案管理 (人事資料附件)</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '12px', fontWeight: '600' }}>身分證正反面影本</label>
                  <input type="file" accept="image/*,application/pdf" onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      const reader = new FileReader();
                      reader.onloadend = () => setEditFileIdCard(reader.result as string);
                      reader.readAsDataURL(file);
                    }
                  }} style={{ fontSize: '12px' }} />
                  {editFileIdCard ? (
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '2px' }}>
                      <span style={{ fontSize: '11px', color: '#10b981' }}>✓ 已有存檔</span>
                      <a href={editFileIdCard} download={`${editEmpName}_身分證影本`} style={{ fontSize: '11px', color: 'var(--primary)', fontWeight: '600', textDecoration: 'underline' }}>下載查看</a>
                    </div>
                  ) : (
                    <span style={{ fontSize: '11px', color: '#9ca3af' }}>尚未上傳</span>
                  )}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '12px', fontWeight: '600' }}>存摺封面影本</label>
                  <input type="file" accept="image/*,application/pdf" onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      const reader = new FileReader();
                      reader.onloadend = () => setEditFileBankbook(reader.result as string);
                      reader.readAsDataURL(file);
                    }
                  }} style={{ fontSize: '12px' }} />
                  {editFileBankbook ? (
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '2px' }}>
                      <span style={{ fontSize: '11px', color: '#10b981' }}>✓ 已有存檔</span>
                      <a href={editFileBankbook} download={`${editEmpName}_存摺封面`} style={{ fontSize: '11px', color: 'var(--primary)', fontWeight: '600', textDecoration: 'underline' }}>下載查看</a>
                    </div>
                  ) : (
                    <span style={{ fontSize: '11px', color: '#9ca3af' }}>尚未上傳</span>
                  )}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '12px', fontWeight: '600' }}>勞動契約 (PDF/圖片)</label>
                  <input type="file" accept="image/*,application/pdf" onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      const reader = new FileReader();
                      reader.onloadend = () => setEditFileContract(reader.result as string);
                      reader.readAsDataURL(file);
                    }
                  }} style={{ fontSize: '12px' }} />
                  {editFileContract ? (
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '2px' }}>
                      <span style={{ fontSize: '11px', color: '#10b981' }}>✓ 已有存檔</span>
                      <a href={editFileContract} download={`${editEmpName}_勞動契約`} style={{ fontSize: '11px', color: 'var(--primary)', fontWeight: '600', textDecoration: 'underline' }}>下載查看</a>
                    </div>
                  ) : (
                    <span style={{ fontSize: '11px', color: '#9ca3af' }}>尚未上傳</span>
                  )}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
                <button type="button" onClick={() => setShowEditEmployeeModal(false)} style={{ flex: 1, padding: '12px', borderRadius: '8px', border: '1px solid #d1d5db', backgroundColor: '#f3f4f6', cursor: 'pointer', fontWeight: '600', fontSize: '14px' }}>取消</button>
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

export default EmployeeManager;
