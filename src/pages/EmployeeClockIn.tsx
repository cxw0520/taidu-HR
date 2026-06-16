import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';
import { db, auth } from '../firebase';
import { collection, addDoc, serverTimestamp, query, where, onSnapshot, doc, getDoc } from 'firebase/firestore';
import './EmployeeClockIn.css';

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

  // 員工前台新增 Tab States
  const [activeSubTab, setActiveSubTab] = useState<'clock' | 'schedule' | 'payroll'>('clock');
  const [todayRecords, setTodayRecords] = useState<any[]>([]);
  const [mySchedules, setMySchedules] = useState<any[]>([]);
  const [myPayroll, setMyPayroll] = useState<any[]>([]);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        try {
          const empDoc = await getDoc(doc(db, 'employees', currentUser.uid));
          if (empDoc.exists()) {
            setEmployeeName(empDoc.data().name || '');
          } else {
            setEmployeeName('');
          }
        } catch (err) {
          console.error("Failed to fetch employee profile:", err);
          setEmployeeName('');
        }
      } else {
        setEmployeeName('');
      }
    });
    return () => {
      clearInterval(timer);
      unsubscribe();
    };
  }, []);

  // 當使用者登入時，監聽其相關資料 (今日打卡、班表、薪資單)
  useEffect(() => {
    if (!user) {
      setTodayRecords([]);
      setMySchedules([]);
      setMyPayroll([]);
      return;
    }

    const todayStr = new Date().toLocaleDateString('sv'); // YYYY-MM-DD

    // 1. 今日打卡紀錄的即時監聽
    const qAttendance = query(collection(db, 'attendance'), where('employeeId', '==', user.uid));
    const unsubAttendance = onSnapshot(qAttendance, (snapshot) => {
      const records = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      // 於記憶體中篩選今日日期並照時間戳降序排列
      const todayOnly = records
        .filter((r: any) => r.date === todayStr)
        .sort((a: any, b: any) => (b.timestamp || 0) - (a.timestamp || 0));
      setTodayRecords(todayOnly);
    }, (err) => console.error("Listen attendance error:", err));

    // 2. 我的班表監聽
    const qSchedules = query(collection(db, 'schedules'), where('employeeId', '==', user.uid));
    const unsubSchedules = onSnapshot(qSchedules, (snapshot) => {
      const records = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      // 照日期降序排列
      records.sort((a: any, b: any) => b.date.localeCompare(a.date));
      setMySchedules(records);
    }, (err) => console.error("Listen schedules error:", err));

    // 3. 我的薪資單監聽
    const qPayroll = query(collection(db, 'payroll'), where('employeeId', '==', user.uid));
    const unsubPayroll = onSnapshot(qPayroll, (snapshot) => {
      const records = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      // 照月份降序排列
      records.sort((a: any, b: any) => b.month.localeCompare(a.month));
      setMyPayroll(records);
    }, (err) => console.error("Listen payroll error:", err));

    return () => {
      unsubAttendance();
      unsubSchedules();
      unsubPayroll();
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
        setLocationState({ 
          status: 'success', 
          message: '定位成功', 
          coords: { lat: latitude, lng: longitude } 
        });
        
        const timeStr = new Date().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' });
        const actionStr = type === 'in' ? '上班' : '下班';
        
        try {
          const { getDocs, query, collection, where } = await import('firebase/firestore');
          const schedSnap = await getDocs(
            query(collection(db, 'schedules'), where('employeeId', '==', auth.currentUser?.uid || ''))
          );
          const activeSchedules = schedSnap.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          })) as any[];

          const { assignClockToWorkDate } = await import('../utils/taiwanHrEngine');
          const now = new Date();
          const matchResult = assignClockToWorkDate(now, type === 'in', activeSchedules);
          const workDate = matchResult.workDate;
          const scheduleId = matchResult.scheduleId;

          await addDoc(collection(db, 'attendance'), {
            empName: employeeName || auth.currentUser?.email || '未名員工',
            employeeId: auth.currentUser?.uid || 'UNKNOWN',
            date: workDate,
            time: timeStr,
            type: actionStr,
            coords: { lat: latitude, lng: longitude },
            timestamp: serverTimestamp(),
            status: '正常',
            scheduleId: scheduleId || ''
          });
          setClockInRecord(`工作日 ${workDate} 於 ${timeStr} 完成${actionStr}打卡並同步至資料庫`);
        } catch (error: any) {
          console.error("Firestore error:", error);
          setLocationState({ 
            status: 'error', 
            message: `打卡儲存失敗: ${error.message}`, 
            coords: null 
          });
        }
      },
      (error) => {
        setLocationState({ 
          status: 'error', 
          message: `定位失敗: ${error.message}，請確認是否開啟定位權限。`, 
          coords: null 
        });
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
      console.error("Sign out error:", err);
    }
  };

  const formattedTime = currentTime.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const formattedDate = currentTime.toLocaleDateString('zh-TW', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });

  return (
    <div className="clock-in-container fade-in">
      <div className="glass-card clock-card">
        <h1 className="company-title">員工行動打卡系統</h1>
        
        {/* 只有在登入後才顯示 Tab 切換列 */}
        {user && (
          <div className="employee-tabs">
            <button 
              className={`tab-btn ${activeSubTab === 'clock' ? 'active' : ''}`}
              onClick={() => setActiveSubTab('clock')}
            >
              🕒 行動打卡
            </button>
            <button 
              className={`tab-btn ${activeSubTab === 'schedule' ? 'active' : ''}`}
              onClick={() => setActiveSubTab('schedule')}
            >
              📅 我的班表
            </button>
            <button 
              className={`tab-btn ${activeSubTab === 'payroll' ? 'active' : ''}`}
              onClick={() => setActiveSubTab('payroll')}
            >
              💰 我的薪資
            </button>
          </div>
        )}

        {/* Tab 內容切換 */}
        {activeSubTab === 'clock' && (
          <div className="tab-panel">
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

            <div className={`status-message status-${locationState.status}`}>
              {locationState.message}
            </div>

            {clockInRecord && (
              <div className="record-success fade-in">
                ✅ {clockInRecord}
              </div>
            )}

            {/* 今日打卡歷史 */}
            {user && todayRecords.length > 0 && (
              <div className="today-records-section fade-in">
                <h4 className="section-title">今日打卡紀錄</h4>
                <div className="mini-table-container">
                  <table className="mini-table">
                    <thead>
                      <tr>
                        <th>打卡時間</th>
                        <th>類型</th>
                        <th>狀態</th>
                        <th>定位</th>
                      </tr>
                    </thead>
                    <tbody>
                      {todayRecords.map((rec) => (
                        <tr key={rec.id}>
                          <td>{rec.time}</td>
                          <td>
                            <span className={`badge badge-${rec.type === '上班' ? 'primary' : 'neutral'}`}>
                              {rec.type}
                            </span>
                          </td>
                          <td>
                            <span className={`badge badge-${rec.status === '正常' ? 'success' : 'warning'}`}>
                              {rec.status}
                            </span>
                          </td>
                          <td>
                            {rec.coords ? (
                              <a 
                                href={`https://www.google.com/maps?q=${rec.coords.lat},${rec.coords.lng}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="map-link"
                              >
                                📍 查看地圖
                              </a>
                            ) : (
                              <span className="text-muted">無定位</span>
                            )}
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

        {activeSubTab === 'schedule' && (
          <div className="tab-panel fade-in">
            <h3 className="tab-panel-title">我的排班表</h3>
            {mySchedules.length === 0 ? (
              <p className="empty-message">目前沒有您的排班紀錄</p>
            ) : (
              <div className="mini-table-container">
                <table className="mini-table">
                  <thead>
                    <tr>
                      <th>日期</th>
                      <th>班別時間</th>
                      <th>狀態</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mySchedules.map((sched) => (
                      <tr key={sched.id}>
                        <td>{sched.date}</td>
                        <td>{sched.shift}</td>
                        <td>
                          <span className={`badge badge-${sched.status === '已確認' ? 'success' : 'warning'}`}>
                            {sched.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {activeSubTab === 'payroll' && (
          <div className="tab-panel fade-in">
            <h3 className="tab-panel-title">我的薪資單歷史</h3>
            {myPayroll.length === 0 ? (
              <p className="empty-message">目前沒有已結算的薪資單</p>
            ) : (
              <div className="mini-table-container">
                <table className="mini-table">
                  <thead>
                    <tr>
                      <th>結算月份</th>
                      <th>底薪</th>
                      <th>加班費</th>
                      <th>扣款 (勞健保)</th>
                      <th>實發薪資</th>
                      <th>發放狀態</th>
                    </tr>
                  </thead>
                  <tbody>
                    {myPayroll.map((pay) => (
                      <tr key={pay.id}>
                        <td style={{ fontWeight: '600' }}>{pay.month}</td>
                        <td>NT$ {pay.baseSalary?.toLocaleString()}</td>
                        <td style={{ color: '#10b981' }}>+NT$ {pay.overtime?.toLocaleString()}</td>
                        <td style={{ color: '#ef4444' }}>-NT$ {pay.deductions?.toLocaleString()}</td>
                        <td style={{ fontWeight: '700', color: 'var(--primary)' }}>
                          NT$ {pay.netSalary?.toLocaleString()}
                        </td>
                        <td>
                          <span className={`badge badge-${pay.status === '已發放' ? 'success' : 'neutral'}`}>
                            {pay.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        <div className="login-footer">
          {user ? (
            <p>
              已登入員工: <strong>{employeeName || user.email}</strong> {employeeName && `(${user.email})`} |{' '}
              <a href="#" onClick={handleSignOut} style={{ color: '#ef4444', fontWeight: 'bold' }}>
                登出
              </a>{' '}
              | 管理員請至 <Link to="/admin">後台登入</Link>
            </p>
          ) : (
            <p>
              您尚未登入，員工請至 <Link to="/login" style={{ fontWeight: 'bold' }}>員工登入</Link> | 管理員請至 <Link to="/admin">後台登入</Link>
            </p>
          )}
        </div>
      </div>
      
      {/* Dynamic background shapes */}
      <div className="shape shape-1"></div>
      <div className="shape shape-2"></div>
    </div>
  );
};

export default EmployeeClockIn;
