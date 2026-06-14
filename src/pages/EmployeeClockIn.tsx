import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import './EmployeeClockIn.css';

const EmployeeClockIn: React.FC = () => {
  const [currentTime, setCurrentTime] = useState(new Date());
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

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const handleClockIn = (type: 'in' | 'out') => {
    setLocationState({ status: 'locating', message: '取得目前位置中...', coords: null });
    
    if (!navigator.geolocation) {
      setLocationState({ status: 'error', message: '您的瀏覽器不支援地理位置功能', coords: null });
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        // In a real app, send this to backend. For MVP, mock it.
        setLocationState({ 
          status: 'success', 
          message: '定位成功', 
          coords: { lat: latitude, lng: longitude } 
        });
        
        const timeStr = new Date().toLocaleTimeString('zh-TW');
        const actionStr = type === 'in' ? '上班' : '下班';
        setClockInRecord(`今日已於 ${timeStr} 完成${actionStr}打卡`);
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

  const formattedTime = currentTime.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const formattedDate = currentTime.toLocaleDateString('zh-TW', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });

  return (
    <div className="clock-in-container fade-in">
      <div className="glass-card clock-card">
        <h1 className="company-title">員工行動打卡系統</h1>
        
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

        <div className="login-footer">
          <p>僅限員工打卡使用，管理員請至 <Link to="/admin">後台登入</Link></p>
        </div>
      </div>
      
      {/* Dynamic background shapes */}
      <div className="shape shape-1"></div>
      <div className="shape shape-2"></div>
    </div>
  );
};

export default EmployeeClockIn;
