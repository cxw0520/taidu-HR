import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';
import { db, auth } from '../firebase';
import {
  collection, addDoc, serverTimestamp, query, where, onSnapshot,
  doc, getDoc
} from 'firebase/firestore';
import './EmployeeClockIn.css';

const LEAVE_TYPES = [
  { value: 'sick', label: '病假 (半薪)' },
  { value: 'personal', label: '事假 (無薪)' },
  { value: 'annual', label: '特別休假' },
  { value: 'official', label: '公假' },
  { value: 'marriage', label: '婚假' },
  { value: 'bereavement', label: '喪假' },
  { value: 'menstrual', label: '生理假' },
  { value: 'prenatal', label: '產前假' },
];

const EmployeeClockIn: React.FC = () => {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [user, setUser] = useState<User | null>(null);
  const [locationState, setLocationState] = useState<{
    status: 'idle' | 'locating' | 'success' | 'error';
    message: string;
    coords: { lat: number; lng: number } | null;
  }>({
    status: 'idle',
    message: '等待打卡...',
    coords: null
  });
  const [clockInRecord, setClockInRecord] = useState<string | null>(null);
  const [employeeName, setEmployeeName] = useState<string>('');
  const [toleranceHours, setToleranceHours] = useState<number>(4);

  // Sub-tabs
  const [activeSubTab, setActiveSubTab] = useState<'clock' | 'schedule' | 'payroll' | 'apply'>('clock');

  // Clock tab data
  const [todayRecords, setTodayRecords] = useState<any[]>([]);
  const [allAttendance, setAllAttendance] = useState<any[]>([]);
  const [mySchedules, setMySchedules] = useState<any[]>([]);

  // Payroll tab data + slip modal
  const [myPayroll, setMyPayroll] = useState<any[]>([]);
  const [selectedSlip, setSelectedSlip] = useState<any | null>(null);

  // Apply tab states
  const [applySubTab, setApplySubTab] = useState<'leave' | 'overtime'>('leave');
  const [myLeaves, setMyLeaves] = useState<any[]>([]);
  const [myOvertimes, setMyOvertimes] = useState<any[]>([]);

  // Leave form
  const [leaveType, setLeaveType] = useState('sick');
  const [leaveStart, setLeaveStart] = useState('');
  const [leaveEnd, setLeaveEnd] = useState('');
  const [leaveHours, setLeaveHours] = useState<number>(8);
  const [leaveReason, setLeaveReason] = useState('');
  const [leaveSubmitting, setLeaveSubmitting] = useState(false);
  const [leaveMsg, setLeaveMsg] = useState({ type: '', text: '' });

  // Overtime form
  const [otDate, setOtDate] = useState('');
  const [otHours, setOtHours] = useState<number>(2);
  const [otReason, setOtReason] = useState('');
  const [otSubmitting, setOtSubmitting] = useState(false);
  const [otMsg, setOtMsg] = useState({ type: '', text: '' });

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        try {
          const empDoc = await getDoc(doc(db, 'employees', currentUser.uid));
          if (empDoc.exists()) {
            setEmployeeName(empDoc.data().name || '');
          }
        } catch (err) {
          console.error('Failed to fetch employee profile:', err);
        }
      } else {
        setEmployeeName('');
      }
    });
    return () => { clearInterval(timer); unsubscribe(); };
  }, []);

  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, 'settings', 'rules'), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data && typeof data.toleranceHours === 'number') {
          setToleranceHours(data.toleranceHours);
        }
      }
    });
    return () => unsubscribe();
  }, []);

  // User data listeners
  useEffect(() => {
    if (!user) {
      setTodayRecords([]); setMySchedules([]); setMyPayroll([]);
      setMyLeaves([]); setMyOvertimes([]);
      return;
    }
    const todayStr = new Date().toLocaleDateString('sv');

    // 1. Today's attendance
    const qAttendance = query(collection(db, 'attendance'), where('employeeId', '==', user.uid));
    const unsubAttendance = onSnapshot(qAttendance, (snapshot) => {
      const records = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setAllAttendance(records);
      const todayOnly = records
        .filter((r: any) => r.date === todayStr)
        .sort((a: any, b: any) => (b.timestamp || 0) - (a.timestamp || 0));
      setTodayRecords(todayOnly);
    });

    // 2. My schedules
    const qSchedules = query(collection(db, 'schedules'), where('employeeId', '==', user.uid));
    const unsubSchedules = onSnapshot(qSchedules, (snapshot) => {
      const records = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      const publishedOnly = records.filter((r: any) => r.isPublished === true);
      publishedOnly.sort((a: any, b: any) => b.date.localeCompare(a.date));
      setMySchedules(publishedOnly);
    });

    // 3. My payroll
    const qPayroll = query(collection(db, 'payroll'), where('employeeId', '==', user.uid));
    const unsubPayroll = onSnapshot(qPayroll, (snapshot) => {
      const records = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      const publishedOnly = records.filter((r: any) => r.isPublished === true);
      publishedOnly.sort((a: any, b: any) => b.month.localeCompare(a.month));
      setMyPayroll(publishedOnly);
    });

    // 4. My leaves
    const qLeaves = query(collection(db, 'leaves'), where('employeeId', '==', user.uid));
    const unsubLeaves = onSnapshot(qLeaves, (snapshot) => {
      const records = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      records.sort((a: any, b: any) => (b.timestamp || 0) - (a.timestamp || 0));
      setMyLeaves(records);
    });

    // 5. My overtime requests
    const qOvertimes = query(collection(db, 'overtime_requests'), where('employeeId', '==', user.uid));
    const unsubOvertimes = onSnapshot(qOvertimes, (snapshot) => {
      const records = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      records.sort((a: any, b: any) => (b.timestamp || 0) - (a.timestamp || 0));
      setMyOvertimes(records);
    });

    return () => {
      unsubAttendance(); unsubSchedules(); unsubPayroll();
      unsubLeaves(); unsubOvertimes();
    };
  }, [user]);

  const handleClockIn = (type: 'in' | 'out') => {
    if (!auth.currentUser) {
      setLocationState({ status: 'error', message: '請先登入後再進行打卡！', coords: null });
      return;
    }
    setLocationState({ status: 'locating', message: '取得目前位置中...', coords: null });
    if (!navigator.geolocation) {
      setLocationState({ status: 'error', message: '您的瀏覽器不支援地理位置功能', coords: null });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        setLocationState({ status: 'success', message: '定位成功', coords: { lat: latitude, lng: longitude } });
        const timeStr = new Date().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' });
        const actionStr = type === 'in' ? '上班' : '下班';
        try {
          const { getDocs, query, collection, where } = await import('firebase/firestore');
          const schedSnap = await getDocs(
            query(collection(db, 'schedules'), where('employeeId', '==', auth.currentUser?.uid || ''))
          );
          const activeSchedules = schedSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as any[];
          const { assignClockToWorkDate } = await import('../utils/taiwanHrEngine');
          const now = new Date();
          const matchResult = assignClockToWorkDate(now, type === 'in', activeSchedules, toleranceHours);
          let clockStatus = '正常';
          const matchedSched = activeSchedules.find(s => s.id === matchResult.scheduleId);
          if (matchedSched) {
            const workDate = matchedSched.date || matchedSched.workDate || '';
            const timeMatch = (matchedSched.shift || '').match(/\((\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})\)/);
            if (timeMatch && workDate) {
              const schedStartStr = timeMatch[1];
              const schedEndStr = timeMatch[2];
              const [schedStartH, schedStartM] = schedStartStr.split(':').map(Number);
              const [schedEndH, schedEndM] = schedEndStr.split(':').map(Number);
              
              const [yr, mo, dy] = workDate.split('-').map(Number);
              const expectedIn = new Date(yr, mo - 1, dy, schedStartH, schedStartM);
              let expectedOut = new Date(yr, mo - 1, dy, schedEndH, schedEndM);
              if (expectedOut < expectedIn) {
                expectedOut.setDate(expectedOut.getDate() + 1);
              }
              
              const actualTime = new Date();
              if (type === 'in') {
                if (actualTime.getTime() > expectedIn.getTime() + 60000) {
                  clockStatus = '遲到';
                }
              } else {
                if (actualTime.getTime() < expectedOut.getTime() - 60000) {
                  clockStatus = '早退';
                }
              }
            }
          }

          await addDoc(collection(db, 'attendance'), {
            empName: employeeName || auth.currentUser?.email || '未名員工',
            employeeId: auth.currentUser?.uid || 'UNKNOWN',
            date: matchResult.workDate,
            time: timeStr,
            type: actionStr,
            coords: { lat: latitude, lng: longitude },
            timestamp: serverTimestamp(),
            status: clockStatus,
            scheduleId: matchResult.scheduleId || ''
          });
          setClockInRecord(`工作日 ${matchResult.workDate} 於 ${timeStr} 完成${actionStr}打卡並同步至資料庫`);
        } catch (error: any) {
          console.error('Firestore error:', error);
          setLocationState({ status: 'error', message: `打卡儲存失敗: ${error.message}`, coords: null });
        }
      },
      (error) => {
        setLocationState({ status: 'error', message: `定位失敗: ${error.message}，請確認是否開啟定位權限。`, coords: null });
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  const handleSignOut = async (e: React.MouseEvent) => {
    e.preventDefault();
    try {
      await signOut(auth);
      setClockInRecord(null);
      setEmployeeName('');
      setActiveSubTab('clock');
      setLocationState({ status: 'idle', message: '已安全登出', coords: null });
    } catch (err) {
      console.error('Sign out error:', err);
    }
  };

  const handleSubmitLeave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!leaveStart || !leaveEnd) {
      setLeaveMsg({ type: 'error', text: '請填寫請假起迄日期' });
      return;
    }
    setLeaveSubmitting(true);
    setLeaveMsg({ type: '', text: '' });
    try {
      await addDoc(collection(db, 'leaves'), {
        employeeId: user.uid,
        empName: employeeName || user.email || '未名員工',
        leaveType,
        startDate: leaveStart,
        endDate: leaveEnd,
        hours: leaveHours,
        reason: leaveReason,
        status: 'pending',
        timestamp: Date.now()
      });
      setLeaveMsg({ type: 'success', text: '請假申請已送出，等待主管審核' });
      setLeaveStart(''); setLeaveEnd(''); setLeaveReason(''); setLeaveHours(8);
    } catch (err: any) {
      setLeaveMsg({ type: 'error', text: err.message || '送出失敗，請稍後再試' });
    } finally {
      setLeaveSubmitting(false);
    }
  };

  const handleSubmitOvertime = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!otDate) {
      setOtMsg({ type: 'error', text: '請填寫加班日期' });
      return;
    }
    setOtSubmitting(true);
    setOtMsg({ type: '', text: '' });
    try {
      await addDoc(collection(db, 'overtime_requests'), {
        employeeId: user.uid,
        empName: employeeName || user.email || '未名員工',
        date: otDate,
        hours: otHours,
        reason: otReason,
        status: 'pending',
        timestamp: Date.now()
      });
      setOtMsg({ type: 'success', text: '加班申請已送出，等待主管審核' });
      setOtDate(''); setOtHours(2); setOtReason('');
    } catch (err: any) {
      setOtMsg({ type: 'error', text: err.message || '送出失敗，請稍後再試' });
    } finally {
      setOtSubmitting(false);
    }
  };

  const getStatusBadge = (status: string) => {
    if (status === 'approved') return { label: '✅ 已核准', color: '#10b981', bg: 'rgba(16,185,129,0.1)' };
    if (status === 'rejected') return { label: '❌ 已拒絕', color: '#ef4444', bg: 'rgba(239,68,68,0.1)' };
    return { label: '⏳ 待審核', color: '#f59e0b', bg: 'rgba(245,158,11,0.1)' };
  };

  const employeeExceptions = React.useMemo(() => {
    if (!user) return [];
    const list: Array<{ date: string; message: string; type: string }> = [];
    const todayStr = new Date().toLocaleDateString('sv');
    
    const attByDate: { [date: string]: any[] } = {};
    allAttendance.forEach((rec: any) => {
      if (!rec.date) return;
      if (!attByDate[rec.date]) attByDate[rec.date] = [];
      attByDate[rec.date].push(rec);
    });
    
    const pastSchedules = mySchedules.filter(s => s.date < todayStr);
    
    pastSchedules.forEach((sched: any) => {
      const date = sched.date;
      const dayAtt = attByDate[date] || [];
      
      const hasLeave = myLeaves.some(l => l.startDate <= date && l.endDate >= date && l.status === 'approved');
      if (hasLeave) return;
      
      const inRec = dayAtt.find(r => r.type === '上班');
      const outRec = dayAtt.find(r => r.type === '下班');
      
      if (!inRec && !outRec) {
        list.push({
          date,
          type: '曠職',
          message: `當天有班表 (${sched.shift})，但無任何打卡紀錄。`
        });
      } else if (!inRec || !outRec) {
        list.push({
          date,
          type: '缺卡',
          message: `打卡不完整：${inRec ? '已打上班但缺下班卡' : '已打下班但缺上班卡'}。`
        });
      } else {
        const statuses = dayAtt.map(r => r.status).filter(s => s && s !== '正常');
        if (statuses.length > 0) {
          list.push({
            date,
            type: statuses.join('、'),
            message: `打卡時間：上班 ${inRec.time || '-'} / 下班 ${outRec.time || '-'} (班表: ${sched.shift})。`
          });
        }
      }
    });
    
    return list.sort((a, b) => b.date.localeCompare(a.date));
  }, [allAttendance, mySchedules, myLeaves, user]);

  const leaveTypeLabel = (type: string) => LEAVE_TYPES.find(l => l.value === type)?.label || type;

  const formattedTime = currentTime.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const formattedDate = currentTime.toLocaleDateString('zh-TW', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });

  return (
    <div className="clock-in-container fade-in">
      <div className="glass-card clock-card">
        <h1 className="company-title">員工行動打卡系統</h1>

        {user && (
          <div className="employee-tabs">
            <button className={`tab-btn ${activeSubTab === 'clock' ? 'active' : ''}`} onClick={() => setActiveSubTab('clock')}>🕒 行動打卡</button>
            <button className={`tab-btn ${activeSubTab === 'schedule' ? 'active' : ''}`} onClick={() => setActiveSubTab('schedule')}>📅 我的班表</button>
            <button className={`tab-btn ${activeSubTab === 'payroll' ? 'active' : ''}`} onClick={() => setActiveSubTab('payroll')}>💰 我的薪資</button>
            <button className={`tab-btn ${activeSubTab === 'apply' ? 'active' : ''}`} onClick={() => setActiveSubTab('apply')}>📋 線上申請</button>
          </div>
        )}

        {/* ── 打卡 Tab ── */}
        {activeSubTab === 'clock' && (
          <div className="tab-panel">
            {employeeExceptions.length > 0 && (
              <div style={{
                background: 'rgba(239, 68, 68, 0.08)',
                border: '1px solid rgba(239, 68, 68, 0.2)',
                borderRadius: '12px',
                padding: '12px 16px',
                marginBottom: '16px',
                textAlign: 'left'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#dc2626', fontWeight: '700', fontSize: '13px', marginBottom: '6px' }}>
                  <span>⚠️ 出勤異常通知 ({employeeExceptions.length} 筆)</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '100px', overflowY: 'auto' }}>
                  {employeeExceptions.map((ex, i) => (
                    <div key={i} style={{ fontSize: '11px', color: '#4b5563' }}>
                      <strong>{ex.date}</strong>: <span style={{ color: '#dc2626', fontWeight: '600' }}>[{ex.type}]</span> {ex.message}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="time-display">
              <div className="current-time">{formattedTime}</div>
              <div className="current-date">{formattedDate}</div>
            </div>
            <div className="action-buttons">
              <button className="btn btn-clock-in" onClick={() => handleClockIn('in')}>
                <span className="icon">☀️</span> 上班打卡
              </button>
              <button className="btn btn-clock-out" onClick={() => handleClockIn('out')}>
                <span className="icon">🌙</span> 下班打卡
              </button>
            </div>
            <div className={`status-message status-${locationState.status}`}>{locationState.message}</div>
            {clockInRecord && <div className="record-success fade-in">✅ {clockInRecord}</div>}
            {user && todayRecords.length > 0 && (
              <div className="today-records-section fade-in">
                <h4 className="section-title">今日打卡紀錄</h4>
                <div className="mini-table-container">
                  <table className="mini-table">
                    <thead><tr><th>打卡時間</th><th>類型</th><th>狀態</th><th>定位</th></tr></thead>
                    <tbody>
                      {todayRecords.map((rec) => (
                        <tr key={rec.id}>
                          <td>{rec.time}</td>
                          <td><span className={`badge badge-${rec.type === '上班' ? 'primary' : 'neutral'}`}>{rec.type}</span></td>
                          <td><span className={`badge badge-${rec.status === '正常' ? 'success' : 'warning'}`}>{rec.status}</span></td>
                          <td>
                            {rec.coords
                              ? <a href={`https://www.google.com/maps?q=${rec.coords.lat},${rec.coords.lng}`} target="_blank" rel="noopener noreferrer" className="map-link">📍 查看地圖</a>
                              : <span className="text-muted">無定位</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── 班表 Tab ── */}
        {activeSubTab === 'schedule' && (
          <div className="tab-panel fade-in">
            <h3 className="tab-panel-title">我的排班表</h3>
            {mySchedules.length === 0
              ? <p className="empty-message">目前沒有您的排班紀錄</p>
              : (
                <div className="mini-table-container">
                  <table className="mini-table">
                    <thead><tr><th>日期</th><th>班別時間</th><th>狀態</th></tr></thead>
                    <tbody>
                      {mySchedules.map((sched) => (
                        <tr key={sched.id}>
                          <td>{sched.date}</td>
                          <td>{sched.shift}</td>
                          <td><span className={`badge badge-${sched.status === '已確認' ? 'success' : 'warning'}`}>{sched.status}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
          </div>
        )}

        {/* ── 薪資 Tab ── */}
        {activeSubTab === 'payroll' && (
          <div className="tab-panel fade-in">
            <h3 className="tab-panel-title">我的薪資單歷史</h3>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '12px' }}>💡 點擊薪資列可查看完整薪資明細</p>
            {myPayroll.length === 0
              ? <p className="empty-message">目前沒有已結算的薪資單</p>
              : (
                <div className="mini-table-container">
                  <table className="mini-table">
                    <thead>
                      <tr><th>結算月份</th><th>底薪</th><th>津貼</th><th>加班費</th><th>扣款</th><th>實發薪資</th><th>狀態</th></tr>
                    </thead>
                    <tbody>
                      {myPayroll.map((pay) => (
                        <tr
                          key={pay.id}
                          onClick={() => setSelectedSlip(pay)}
                          style={{ cursor: 'pointer' }}
                          className="payroll-row-clickable"
                        >
                          <td style={{ fontWeight: '600' }}>{pay.month}</td>
                          <td>NT$ {pay.baseSalary?.toLocaleString()}</td>
                          <td style={{ color: '#10b981' }}>+NT$ {((pay.mealAllowance || 0) + (pay.attendanceBonus || 0) + (pay.otherAllowance || 0)).toLocaleString()}</td>
                          <td style={{ color: '#10b981' }}>+NT$ {pay.overtime?.toLocaleString()}</td>
                          <td style={{ color: '#ef4444' }}>-NT$ {pay.deductions?.toLocaleString()}</td>
                          <td style={{ fontWeight: '700', color: 'var(--primary)' }}>NT$ {pay.netSalary?.toLocaleString()}</td>
                          <td><span className={`badge badge-${pay.status === '已發放' ? 'success' : 'neutral'}`}>{pay.status}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
          </div>
        )}

        {/* ── 線上申請 Tab ── */}
        {activeSubTab === 'apply' && (
          <div className="tab-panel fade-in">
            <h3 className="tab-panel-title">線上差勤申請</h3>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
              <button
                onClick={() => setApplySubTab('leave')}
                style={{
                  padding: '8px 20px', borderRadius: '8px', fontSize: '13px', fontWeight: '600',
                  border: 'none', cursor: 'pointer',
                  backgroundColor: applySubTab === 'leave' ? 'var(--primary)' : '#f3f4f6',
                  color: applySubTab === 'leave' ? '#fff' : 'var(--text-main)'
                }}
              >📄 請假申請</button>
              <button
                onClick={() => setApplySubTab('overtime')}
                style={{
                  padding: '8px 20px', borderRadius: '8px', fontSize: '13px', fontWeight: '600',
                  border: 'none', cursor: 'pointer',
                  backgroundColor: applySubTab === 'overtime' ? 'var(--primary)' : '#f3f4f6',
                  color: applySubTab === 'overtime' ? '#fff' : 'var(--text-main)'
                }}
              >⏰ 加班申請</button>
            </div>

            {/* ── 請假表單 ── */}
            {applySubTab === 'leave' && (
              <div>
                <form onSubmit={handleSubmitLeave} style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '24px' }}>
                  <div style={{ background: 'linear-gradient(135deg,rgba(79,70,229,0.06),rgba(124,58,237,0.04))', borderRadius: '12px', padding: '16px', border: '1px solid rgba(79,70,229,0.1)' }}>
                    <div style={{ fontSize: '13px', fontWeight: '700', color: 'var(--primary)', marginBottom: '12px' }}>📄 新增請假申請</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                      <div>
                        <label style={{ fontSize: '12px', fontWeight: '600', display: 'block', marginBottom: '4px' }}>假別</label>
                        <select value={leaveType} onChange={e => setLeaveType(e.target.value)}
                          style={{ width: '100%', padding: '8px 10px', borderRadius: '7px', border: '1px solid #d1d5db', fontSize: '13px', backgroundColor: '#fff' }}>
                          {LEAVE_TYPES.map(lt => <option key={lt.value} value={lt.value}>{lt.label}</option>)}
                        </select>
                      </div>
                      <div>
                        <label style={{ fontSize: '12px', fontWeight: '600', display: 'block', marginBottom: '4px' }}>請假時數</label>
                        <input type="number" min={1} max={240} value={leaveHours} onChange={e => setLeaveHours(Number(e.target.value))}
                          style={{ width: '100%', padding: '8px 10px', borderRadius: '7px', border: '1px solid #d1d5db', fontSize: '13px' }} />
                      </div>
                      <div>
                        <label style={{ fontSize: '12px', fontWeight: '600', display: 'block', marginBottom: '4px' }}>開始日期</label>
                        <input type="date" required value={leaveStart} onChange={e => setLeaveStart(e.target.value)}
                          style={{ width: '100%', padding: '8px 10px', borderRadius: '7px', border: '1px solid #d1d5db', fontSize: '13px' }} />
                      </div>
                      <div>
                        <label style={{ fontSize: '12px', fontWeight: '600', display: 'block', marginBottom: '4px' }}>結束日期</label>
                        <input type="date" required value={leaveEnd} onChange={e => setLeaveEnd(e.target.value)}
                          style={{ width: '100%', padding: '8px 10px', borderRadius: '7px', border: '1px solid #d1d5db', fontSize: '13px' }} />
                      </div>
                    </div>
                    <div style={{ marginTop: '10px' }}>
                      <label style={{ fontSize: '12px', fontWeight: '600', display: 'block', marginBottom: '4px' }}>請假事由</label>
                      <textarea value={leaveReason} onChange={e => setLeaveReason(e.target.value)}
                        rows={2} placeholder="請填寫請假原因（選填）"
                        style={{ width: '100%', padding: '8px 10px', borderRadius: '7px', border: '1px solid #d1d5db', fontSize: '13px', resize: 'vertical' }} />
                    </div>
                    {leaveMsg.text && (
                      <div style={{ marginTop: '8px', padding: '8px 12px', borderRadius: '7px', fontSize: '13px', backgroundColor: leaveMsg.type === 'success' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)', color: leaveMsg.type === 'success' ? '#10b981' : '#ef4444' }}>
                        {leaveMsg.type === 'success' ? '✅' : '⚠️'} {leaveMsg.text}
                      </div>
                    )}
                    <button type="submit" disabled={leaveSubmitting}
                      style={{ marginTop: '12px', width: '100%', padding: '10px', borderRadius: '8px', border: 'none', backgroundColor: 'var(--primary)', color: '#fff', fontWeight: '700', fontSize: '14px', cursor: 'pointer' }}>
                      {leaveSubmitting ? '送出中...' : '📤 送出請假申請'}
                    </button>
                  </div>
                </form>

                {/* Leave history */}
                <div style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-main)', marginBottom: '10px' }}>📋 我的請假紀錄</div>
                {myLeaves.length === 0
                  ? <p className="empty-message">尚無請假申請紀錄</p>
                  : (
                    <div className="mini-table-container">
                      <table className="mini-table">
                        <thead><tr><th>假別</th><th>起迄日期</th><th>時數</th><th>狀態</th></tr></thead>
                        <tbody>
                          {myLeaves.map(lv => {
                            const s = getStatusBadge(lv.status);
                            return (
                              <tr key={lv.id}>
                                <td>{leaveTypeLabel(lv.leaveType)}</td>
                                <td>{lv.startDate} ~ {lv.endDate}</td>
                                <td>{lv.hours} h</td>
                                <td><span style={{ padding: '2px 8px', borderRadius: '12px', fontSize: '12px', fontWeight: '600', color: s.color, backgroundColor: s.bg }}>{s.label}</span></td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
              </div>
            )}

            {/* ── 加班表單 ── */}
            {applySubTab === 'overtime' && (
              <div>
                <form onSubmit={handleSubmitOvertime} style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '24px' }}>
                  <div style={{ background: 'linear-gradient(135deg,rgba(16,185,129,0.06),rgba(5,150,105,0.04))', borderRadius: '12px', padding: '16px', border: '1px solid rgba(16,185,129,0.15)' }}>
                    <div style={{ fontSize: '13px', fontWeight: '700', color: '#059669', marginBottom: '12px' }}>⏰ 新增加班申請</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                      <div>
                        <label style={{ fontSize: '12px', fontWeight: '600', display: 'block', marginBottom: '4px' }}>加班日期</label>
                        <input type="date" required value={otDate} onChange={e => setOtDate(e.target.value)}
                          style={{ width: '100%', padding: '8px 10px', borderRadius: '7px', border: '1px solid #d1d5db', fontSize: '13px' }} />
                      </div>
                      <div>
                        <label style={{ fontSize: '12px', fontWeight: '600', display: 'block', marginBottom: '4px' }}>加班時數</label>
                        <input type="number" min={0.5} max={12} step={0.5} value={otHours} onChange={e => setOtHours(Number(e.target.value))}
                          style={{ width: '100%', padding: '8px 10px', borderRadius: '7px', border: '1px solid #d1d5db', fontSize: '13px' }} />
                      </div>
                    </div>
                    <div style={{ marginTop: '10px' }}>
                      <label style={{ fontSize: '12px', fontWeight: '600', display: 'block', marginBottom: '4px' }}>加班事由</label>
                      <textarea value={otReason} onChange={e => setOtReason(e.target.value)}
                        rows={2} placeholder="請填寫加班原因（選填）"
                        style={{ width: '100%', padding: '8px 10px', borderRadius: '7px', border: '1px solid #d1d5db', fontSize: '13px', resize: 'vertical' }} />
                    </div>
                    {otMsg.text && (
                      <div style={{ marginTop: '8px', padding: '8px 12px', borderRadius: '7px', fontSize: '13px', backgroundColor: otMsg.type === 'success' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)', color: otMsg.type === 'success' ? '#10b981' : '#ef4444' }}>
                        {otMsg.type === 'success' ? '✅' : '⚠️'} {otMsg.text}
                      </div>
                    )}
                    <button type="submit" disabled={otSubmitting}
                      style={{ marginTop: '12px', width: '100%', padding: '10px', borderRadius: '8px', border: 'none', backgroundColor: '#059669', color: '#fff', fontWeight: '700', fontSize: '14px', cursor: 'pointer' }}>
                      {otSubmitting ? '送出中...' : '📤 送出加班申請'}
                    </button>
                  </div>
                </form>

                {/* Overtime history */}
                <div style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-main)', marginBottom: '10px' }}>📋 我的加班申請紀錄</div>
                {myOvertimes.length === 0
                  ? <p className="empty-message">尚無加班申請紀錄</p>
                  : (
                    <div className="mini-table-container">
                      <table className="mini-table">
                        <thead><tr><th>加班日期</th><th>時數</th><th>事由</th><th>狀態</th></tr></thead>
                        <tbody>
                          {myOvertimes.map(ot => {
                            const s = getStatusBadge(ot.status);
                            return (
                              <tr key={ot.id}>
                                <td>{ot.date}</td>
                                <td>{ot.hours} h</td>
                                <td style={{ maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ot.reason || '-'}</td>
                                <td><span style={{ padding: '2px 8px', borderRadius: '12px', fontSize: '12px', fontWeight: '600', color: s.color, backgroundColor: s.bg }}>{s.label}</span></td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
              </div>
            )}
          </div>
        )}

        <div className="login-footer">
          {user ? (
            <p>
              已登入員工: <strong>{employeeName || user.email}</strong> {employeeName && `(${user.email})`} |{' '}
              <a href="#" onClick={handleSignOut} style={{ color: '#ef4444', fontWeight: 'bold' }}>登出</a>{' '}
              | 管理員請至 <Link to="/admin">後台登入</Link>
            </p>
          ) : (
            <p>
              您尚未登入，員工請至 <Link to="/login" style={{ fontWeight: 'bold' }}>員工登入</Link> | 管理員請至 <Link to="/admin">後台登入</Link>
            </p>
          )}
        </div>
      </div>

      {/* ─── 電子薪資單 Modal ─── */}
      {selectedSlip && (
        <div
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(8px)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}
          onClick={() => setSelectedSlip(null)}
        >
          <div
            style={{ backgroundColor: '#fff', borderRadius: '20px', padding: '32px', maxWidth: '480px', width: '100%', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)' }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: '800', color: 'var(--primary)' }}>💰 電子薪資單</h3>
              <button onClick={() => setSelectedSlip(null)} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#9ca3af' }}>×</button>
            </div>
            <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '16px', fontWeight: '600' }}>結算月份：{selectedSlip.month}</div>

            {/* Salary breakdown */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {[
                { label: '💼 底薪', value: selectedSlip.baseSalary, color: '#111' },
                { label: '🍱 伙食津貼', value: selectedSlip.mealAllowance || 0, color: '#059669' },
                { label: '🏆 全勤獎金', value: selectedSlip.attendanceBonus || 0, color: '#059669' },
                { label: '📦 其他津貼', value: selectedSlip.otherAllowance || 0, color: '#059669' },
                { label: '⏰ 加班費', value: selectedSlip.overtime || 0, color: '#2563eb' },
              ].map(item => (
                <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', borderRadius: '8px', backgroundColor: '#f9fafb' }}>
                  <span style={{ fontSize: '13px', color: '#374151' }}>{item.label}</span>
                  <span style={{ fontSize: '13px', fontWeight: '700', color: item.color }}>NT$ {item.value?.toLocaleString()}</span>
                </div>
              ))}

              <div style={{ borderTop: '1px dashed #e5e7eb', margin: '4px 0' }} />

              {[
                { label: '🏥 健保自付額', value: -(selectedSlip.employeeNhi || 0), color: '#dc2626' },
                { label: '👷 勞保自付額', value: -(selectedSlip.employeeLabor || 0), color: '#dc2626' },
                { label: '📅 請假扣薪', value: -(selectedSlip.leaveDeduction || 0), color: '#dc2626' },
              ].map(item => (
                <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', borderRadius: '8px', backgroundColor: '#fff5f5' }}>
                  <span style={{ fontSize: '13px', color: '#374151' }}>{item.label}</span>
                  <span style={{ fontSize: '13px', fontWeight: '700', color: item.color }}>NT$ {item.value?.toLocaleString()}</span>
                </div>
              ))}

              <div style={{ borderTop: '2px solid var(--primary)', margin: '8px 0' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 16px', borderRadius: '10px', backgroundColor: 'rgba(79,70,229,0.06)', border: '1px solid rgba(79,70,229,0.15)' }}>
                <span style={{ fontSize: '16px', fontWeight: '800', color: 'var(--primary)' }}>🏦 實發薪資</span>
                <span style={{ fontSize: '18px', fontWeight: '900', color: 'var(--primary)' }}>NT$ {selectedSlip.netSalary?.toLocaleString()}</span>
              </div>
              <div style={{ textAlign: 'center', marginTop: '4px' }}>
                <span className={`badge badge-${selectedSlip.status === '已發放' ? 'success' : 'neutral'}`}>{selectedSlip.status}</span>
              </div>
            </div>

            <div style={{ marginTop: '16px', padding: '10px', backgroundColor: '#f3f4f6', borderRadius: '8px', fontSize: '11px', color: '#9ca3af', textAlign: 'center' }}>
              勞保投保薪資：NT$ {selectedSlip.laborSub?.toLocaleString()} ｜ 健保投保薪資：NT$ {selectedSlip.nhiSub?.toLocaleString()}
            </div>
          </div>
        </div>
      )}

      {/* Background shapes */}
      <div className="shape shape-1"></div>
      <div className="shape shape-2"></div>
    </div>
  );
};

export default EmployeeClockIn;
