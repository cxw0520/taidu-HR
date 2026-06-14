import { BrowserRouter, Routes, Route } from 'react-router-dom';
import EmployeeClockIn from './pages/EmployeeClockIn';
import AdminDashboard from './pages/AdminDashboard';
import './App.css';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<EmployeeClockIn />} />
        <Route path="/admin/*" element={<AdminDashboard />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
