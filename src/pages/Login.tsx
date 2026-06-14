import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../firebase';
import './Login.css';

const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      
      if (user.email === 'taidu.patisserie.2025@gmail.com') {
        navigate('/admin');
      } else {
        navigate('/');
      }
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/invalid-credential' || err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') {
        setError('電子信箱或密碼錯誤');
      } else {
        setError('登入失敗，請稍後再試。');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container fade-in">
      <div className="glass-card login-card">
        <h1 className="login-title">HR 系統登入</h1>
        <p className="login-subtitle">請輸入您的帳號密碼以繼續</p>

        {error && <div className="login-error-message">⚠️ {error}</div>}

        <form onSubmit={handleLogin} className="login-form">
          <div className="form-group">
            <label htmlFor="email">電子信箱</label>
            <input
              type="email"
              id="email"
              placeholder="name@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={loading}
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">密碼</label>
            <input
              type="password"
              id="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={loading}
            />
          </div>

          <button type="submit" className="btn btn-login" disabled={loading}>
            {loading ? '登入中...' : '立即登入'}
          </button>
        </form>

        <div className="login-footer-nav">
          <a href="/" className="back-link">⬅️ 返回打卡頁面</a>
        </div>
      </div>

      <div className="shape shape-1"></div>
      <div className="shape shape-2"></div>
    </div>
  );
};

export default Login;
