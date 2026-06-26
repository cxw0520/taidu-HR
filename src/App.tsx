import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from './firebase';
import EmployeeClockIn from './pages/EmployeeClockIn';
import AdminDashboard from './pages/AdminDashboard';
import Login from './pages/Login';
import { AdminDataProvider } from './context/AdminDataContext';
import './App.css';

interface ProtectedRouteProps {
  children: React.ReactElement;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Safety timeout in case Firebase auth initialization gets completely stuck
    const safetyTimeout = setTimeout(() => {
      console.warn("Auth initialization timed out, using fallback status");
      setUser(auth.currentUser);
      setIsAdmin(auth.currentUser?.email === 'taidu.patisserie.2025@gmail.com');
      setLoading(false);
    }, 6000);

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      clearTimeout(safetyTimeout);
      setUser(currentUser);
      if (currentUser) {
        try {
          const docRef = doc(db, 'employees', currentUser.uid);
          
          // Use Promise.race to set a 3-second timeout for the getDoc call to avoid hanging
          const docSnap = (await Promise.race([
            getDoc(docRef),
            new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Timeout fetching employee doc')), 3000))
          ])) as any;

          if (docSnap.exists()) {
            const data = docSnap.data();
            const roleIsAdmin = data.role === 'admin' || data.isAdmin === true;
            setIsAdmin(roleIsAdmin || currentUser.email === 'taidu.patisserie.2025@gmail.com');
          } else {
            setIsAdmin(currentUser.email === 'taidu.patisserie.2025@gmail.com');
          }
        } catch (err) {
          console.error("Error checking admin status:", err);
          setIsAdmin(currentUser.email === 'taidu.patisserie.2025@gmail.com');
        }
      } else {
        setIsAdmin(false);
      }
      setLoading(false);
    });

    return () => {
      clearTimeout(safetyTimeout);
      unsubscribe();
    };
  }, []);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', fontSize: '18px', fontFamily: 'system-ui' }}>
        權限驗證中...
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (!isAdmin) {
    return <Navigate to="/" replace />;
  }

  return children;
};

function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <Routes>
        <Route path="/" element={<EmployeeClockIn />} />
        <Route path="/login" element={<Login />} />
        <Route 
          path="/admin/*" 
          element={
            <ProtectedRoute>
              <AdminDataProvider>
                <AdminDashboard />
              </AdminDataProvider>
            </ProtectedRoute>
          } 
        />
      </Routes>
    </BrowserRouter>
  );
}

export default App;

