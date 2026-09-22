import React, { useState, useRef } from 'react';
import { useAdminData } from '../context/AdminDataContext';
import { generatePDFBlob, downloadZip } from '../utils/exportEngine';
import {
  MonthlyScheduleReport,
  MonthlyPayrollSummaryReport,
  MonthlyPayslipsReport,
  MonthlyAttendanceReport,
  MonthlyRequestsReport,
  MonthlyExceptionsReport
} from './ExportMonthlyReports';

export const ExportMonthlyData: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [progressMsg, setProgressMsg] = useState('');
  
  const today = new Date();
  const defaultMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  const [selectedMonth, setSelectedMonth] = useState(defaultMonth);

  const adminData = useAdminData();
  const hiddenContainerRef = useRef<HTMLDivElement>(null);

  const handleExport = async () => {
    setIsExporting(true);
    setProgressMsg('正在準備資料...');

    try {
      // 確保隱藏的報表已經渲染完成 (給 React 一點時間更新 DOM)
      await new Promise(resolve => setTimeout(resolve, 500));

      const files: { filename: string; blob: Blob }[] = [];
      const container = hiddenContainerRef.current;
      if (!container) throw new Error("找不到報表容器");

      const processReport = async (id: string, filename: string, multiPage: boolean = false) => {
        setProgressMsg(`正在產生: ${filename}...`);
        const el = container.querySelector(`#${id}`) as HTMLElement;
        if (el) {
          const blob = await generatePDFBlob(el, multiPage);
          files.push({ filename: `${filename}.pdf`, blob });
        }
      };

      await processReport('report-schedule', `${selectedMonth}月份班表`);
      await processReport('report-payroll-summary', `${selectedMonth}月份人事總支出`);
      await processReport('report-payslips', `${selectedMonth}月份全員薪資單`, true); // 多頁
      await processReport('report-attendance', `${selectedMonth}月份打卡紀錄`);
      await processReport('report-requests', `${selectedMonth}月份差勤申請單`);
      await processReport('report-exceptions', `${selectedMonth}月份差勤異常報告`);

      setProgressMsg('正在打包壓縮檔...');
      await downloadZip(files, `${selectedMonth}月人事總資料.zip`);
      
      setIsOpen(false);
    } catch (error) {
      console.error('匯出失敗', error);
      alert('匯出過程中發生錯誤，請查看主控台。');
    } finally {
      setIsExporting(false);
      setProgressMsg('');
    }
  };

  return (
    <>
      <button 
        className="btn-primary" 
        onClick={() => setIsOpen(true)}
        style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', backgroundColor: '#8b5cf6', borderColor: '#8b5cf6' }}
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
          <path d="M.5 9.9a.5.5 0 0 1 .5.5v2.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2.5a.5.5 0 0 1 1 0v2.5a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2v-2.5a.5.5 0 0 1 .5-.5z"/>
          <path d="M7.646 11.854a.5.5 0 0 0 .708 0l3-3a.5.5 0 0 0-.708-.708L8.5 10.293V1.5a.5.5 0 0 0-1 0v8.793L5.354 8.146a.5.5 0 1 0-.708.708l3 3z"/>
        </svg>
        匯出當月人事總資料
      </button>

      {/* Modal */}
      {isOpen && (
        <div className="modal-overlay" style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, 
          backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000,
          display: 'flex', justifyContent: 'center', alignItems: 'center'
        }}>
          <div className="modal-content" style={{
            backgroundColor: '#fff', padding: '2rem', borderRadius: '8px', 
            width: '400px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
          }}>
            <h2 style={{ marginTop: 0 }}>選擇匯出月份</h2>
            
            <div style={{ margin: '1.5rem 0' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem' }}>月份</label>
              <input 
                type="month" 
                value={selectedMonth} 
                onChange={(e) => setSelectedMonth(e.target.value)}
                disabled={isExporting}
                style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #ccc' }}
              />
            </div>

            {isExporting ? (
              <div style={{ textAlign: 'center', margin: '1rem 0' }}>
                <div style={{ fontWeight: 'bold', color: '#8b5cf6' }}>{progressMsg}</div>
                <p style={{ fontSize: '12px', color: '#666' }}>處理時間可能需要數十秒，請耐心等候...</p>
              </div>
            ) : (
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                <button 
                  className="btn-secondary" 
                  onClick={() => setIsOpen(false)}
                >
                  取消
                </button>
                <button 
                  className="btn-primary" 
                  onClick={handleExport}
                  style={{ backgroundColor: '#8b5cf6', borderColor: '#8b5cf6' }}
                >
                  開始匯出
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 隱藏的報表容器，用於 html2canvas 擷取 */}
      {(isOpen || isExporting) && (
        <div 
          ref={hiddenContainerRef} 
          style={{ 
            position: 'absolute', 
            top: '-9999px', 
            left: '-9999px', 
            zIndex: -1, 
            opacity: 0, 
            pointerEvents: 'none' 
          }}
        >
          <MonthlyScheduleReport month={selectedMonth} schedules={adminData.schedules} employees={adminData.employees} />
          <MonthlyPayrollSummaryReport month={selectedMonth} payroll={adminData.payroll} employees={adminData.employees} />
          <MonthlyPayslipsReport month={selectedMonth} payroll={adminData.payroll} employees={adminData.employees} />
          <MonthlyAttendanceReport month={selectedMonth} attendance={adminData.attendance} employees={adminData.employees} />
          <MonthlyRequestsReport 
            month={selectedMonth} 
            leaves={adminData.leaves} 
            overtimeReqs={adminData.overtimeReqs} 
            punchCorrections={adminData.punchCorrections} 
            employees={adminData.employees} 
          />
          <MonthlyExceptionsReport month={selectedMonth} attendance={adminData.attendance} schedules={adminData.schedules} employees={adminData.employees} />
        </div>
      )}
    </>
  );
};
