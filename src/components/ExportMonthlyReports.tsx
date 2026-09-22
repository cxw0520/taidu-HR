import React from 'react';
import { evaluatePunchesStatus, parseTimeStrToMinutes } from '../utils/taiwanHrEngine';

// ====== 共用樣式 ======
const reportStyle: React.CSSProperties = {
  backgroundColor: '#fff',
  color: '#000',
  padding: '20px',
  width: '800px', // 固定寬度，確保轉出 PDF 不會走鐘
  fontFamily: 'sans-serif',
};

const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  marginTop: '10px',
  fontSize: '12px'
};

const thTdStyle: React.CSSProperties = {
  border: '1px solid #ddd',
  padding: '6px',
  textAlign: 'center'
};

// ====== 1. x月份班表 ======
export const MonthlyScheduleReport: React.FC<{ month: string, schedules: any[], employees: any[] }> = ({ month, schedules, employees }) => {
  const monthSchedules = schedules.filter(s => s.date.startsWith(month));
  const daysInMonth = new Date(parseInt(month.split('-')[0]), parseInt(month.split('-')[1]), 0).getDate();
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  // 過濾出這個月有排班的員工 (排除未排班或已離職)
  const scheduledEmployees = employees.filter(emp => 
    monthSchedules.some(s => s.employeeId === emp.id)
  );

  return (
    <div id="report-schedule" style={{ ...reportStyle, width: 'max-content', minWidth: '1200px' }}>
      <h2>{month} 班表</h2>
      <table style={{ ...tableStyle, whiteSpace: 'nowrap' }}>
        <thead>
          <tr>
            <th style={thTdStyle}>員工</th>
            {days.map(d => <th key={d} style={thTdStyle}>{d}</th>)}
          </tr>
        </thead>
        <tbody>
          {scheduledEmployees.map(emp => (
            <tr key={emp.id}>
              <td style={thTdStyle}>{emp.name}</td>
              {days.map(d => {
                const dateStr = `${month}-${String(d).padStart(2, '0')}`;
                const sched = monthSchedules.find(s => s.employeeId === emp.id && s.date === dateStr);
                return (
                  <td key={d} style={thTdStyle}>
                    {sched ? (sched.shift === '休假' ? '休' : (sched.shift === '例假' ? '例' : sched.shift)) : ''}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

// ====== 2. x月份人事總支出 ======
export const MonthlyPayrollSummaryReport: React.FC<{ month: string, payroll: any[], employees: any[] }> = ({ month, payroll, employees }) => {
  const monthPayroll = payroll.filter(p => p.month === month);
  
  return (
    <div id="report-payroll-summary" style={reportStyle}>
      <h2>{month} 人事總支出</h2>
      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={thTdStyle}>員工姓名</th>
            <th style={thTdStyle}>底薪</th>
            <th style={thTdStyle}>職務加給</th>
            <th style={thTdStyle}>考核加給</th>
            <th style={thTdStyle}>全勤獎金</th>
            <th style={thTdStyle}>其他津貼</th>
            <th style={thTdStyle}>加班費</th>
            <th style={thTdStyle}>請假扣薪</th>
            <th style={thTdStyle}>勞保自付</th>
            <th style={thTdStyle}>健保自付</th>
            <th style={thTdStyle}>實發薪資</th>
          </tr>
        </thead>
        <tbody>
          {monthPayroll.map(p => {
            const emp = employees.find(e => e.id === p.employeeId);
            return (
              <tr key={p.id}>
                <td style={thTdStyle}>{emp?.name || p.employeeId}</td>
                <td style={thTdStyle}>{p.baseSalary || 0}</td>
                <td style={thTdStyle}>{p.roleAllowance || 0}</td>
                <td style={thTdStyle}>{p.evaluationAllowance || 0}</td>
                <td style={thTdStyle}>{p.attendanceBonus || 0}</td>
                <td style={thTdStyle}>{p.otherAllowance || 0}</td>
                <td style={thTdStyle}>{p.overtime || 0}</td>
                <td style={thTdStyle}>{p.leaveDeduction || 0}</td>
                <td style={thTdStyle}>{p.employeeLabor || 0}</td>
                <td style={thTdStyle}>{p.employeeNhi || 0}</td>
                <td style={thTdStyle}>{p.netSalary || 0}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

// ====== 3. x月份全員薪資單 ======
export const MonthlyPayslipsReport: React.FC<{ month: string, payroll: any[], employees: any[] }> = ({ month, payroll, employees }) => {
  const monthPayroll = payroll.filter(p => p.month === month);
  
  if (monthPayroll.length === 0) {
    return (
      <div id="report-payslips" style={{ ...reportStyle, width: '700px' }}>
        <h2>{month} 全員薪資單 (無資料)</h2>
      </div>
    );
  }

  return (
    <div id="report-payslips" style={{ backgroundColor: '#fff', width: '700px' }}>
      {monthPayroll.map((p) => {
        const emp = employees.find(e => e.id === p.employeeId);
        const gross = (p.baseSalary || 0) + (p.roleAllowance || 0) + (p.evaluationAllowance || 0) + (p.attendanceBonus || 0) + (p.otherAllowance || 0) + (p.overtime || 0) + (p.adminBonus || 0) + (p.annualLeavePayoff || 0) + (p.retroactivePay || 0);
        const totalDed = (p.leaveDeduction || 0) + (p.lateDeduction || 0) + (p.employeeLabor || 0) + (p.employeeNhi || 0) + (p.withholdingTax || 0) + (p.insuranceAdjustment || 0) + (p.otherDeductions || 0) + (p.pensionVoluntary || 0);

        return (
          <div key={p.id} className="pdf-page" style={{ ...reportStyle, width: '700px', minHeight: '900px', boxSizing: 'border-box' }}>
            <h2 style={{ textAlign: 'center', borderBottom: '2px solid #333', paddingBottom: '10px' }}>
              {emp?.name || p.employeeId} - {month} 薪資單
            </h2>
            <table style={{ ...tableStyle, marginTop: '20px', fontSize: '14px' }}>
              <tbody>
                <tr>
                  <th style={{ ...thTdStyle, width: '25%', backgroundColor: '#f9fafb' }}>項目</th>
                  <th style={{ ...thTdStyle, width: '25%', backgroundColor: '#f9fafb' }}>應發金額</th>
                  <th style={{ ...thTdStyle, width: '25%', backgroundColor: '#f9fafb' }}>代扣項目</th>
                  <th style={{ ...thTdStyle, width: '25%', backgroundColor: '#f9fafb' }}>扣款金額</th>
                </tr>
                <tr>
                  <td style={thTdStyle}>本薪</td>
                  <td style={thTdStyle}>{p.baseSalary || 0}</td>
                  <td style={thTdStyle}>勞保費 (自付)</td>
                  <td style={thTdStyle}>{p.employeeLabor || 0}</td>
                </tr>
                <tr>
                  <td style={thTdStyle}>職務加給</td>
                  <td style={thTdStyle}>{p.roleAllowance || 0}</td>
                  <td style={thTdStyle}>健保費 (自付)</td>
                  <td style={thTdStyle}>{p.employeeNhi || 0}</td>
                </tr>
                <tr>
                  <td style={thTdStyle}>考核加給</td>
                  <td style={thTdStyle}>{p.evaluationAllowance || 0}</td>
                  <td style={thTdStyle}>請假扣款</td>
                  <td style={thTdStyle}>{p.leaveDeduction || 0}</td>
                </tr>
                <tr>
                  <td style={thTdStyle}>全勤獎金</td>
                  <td style={thTdStyle}>{p.attendanceBonus || 0}</td>
                  <td style={thTdStyle}>遲到扣款</td>
                  <td style={thTdStyle}>{p.lateDeduction || 0}</td>
                </tr>
                <tr>
                  <td style={thTdStyle}>其他津貼</td>
                  <td style={thTdStyle}>{p.otherAllowance || 0}</td>
                  <td style={thTdStyle}>代扣所得稅</td>
                  <td style={thTdStyle}>{p.withholdingTax || 0}</td>
                </tr>
                <tr>
                  <td style={thTdStyle}>行政獎金</td>
                  <td style={thTdStyle}>{p.adminBonus || 0}</td>
                  <td style={thTdStyle}>勞健保補扣</td>
                  <td style={thTdStyle}>{p.insuranceAdjustment || 0}</td>
                </tr>
                <tr>
                  <td style={thTdStyle}>特休結算</td>
                  <td style={thTdStyle}>{p.annualLeavePayoff || 0}</td>
                  <td style={thTdStyle}>勞退自提</td>
                  <td style={thTdStyle}>{p.pensionVoluntary || 0}</td>
                </tr>
                <tr>
                  <td style={thTdStyle}>補發薪資</td>
                  <td style={thTdStyle}>{p.retroactivePay || 0}</td>
                  <td style={thTdStyle}>其他扣款</td>
                  <td style={thTdStyle}>{p.otherDeductions || 0}</td>
                </tr>
                <tr>
                  <td style={thTdStyle}>加班費</td>
                  <td style={thTdStyle}>{p.overtime || 0}</td>
                  <td style={thTdStyle}></td>
                  <td style={thTdStyle}></td>
                </tr>
                <tr style={{ fontWeight: 'bold', backgroundColor: '#f3f4f6' }}>
                  <td style={thTdStyle}>應發總計</td>
                  <td style={thTdStyle}>{gross}</td>
                  <td style={thTdStyle}>扣款總計</td>
                  <td style={thTdStyle}>{totalDed}</td>
                </tr>
                <tr style={{ fontWeight: 'bold', fontSize: '18px', backgroundColor: '#eff6ff' }}>
                  <td colSpan={2} style={{ ...thTdStyle, textAlign: 'right' }}>實發薪資 (匯款金額)</td>
                  <td colSpan={2} style={{ ...thTdStyle, color: '#1d4ed8' }}>{p.netSalary || 0}</td>
                </tr>
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
};

// ====== 4. x月份打卡紀錄 ======
export const MonthlyAttendanceReport: React.FC<{ month: string, attendance: any[], employees: any[] }> = ({ month, attendance, employees }) => {
  const monthAttendance = attendance.filter(a => a.date?.startsWith(month));

  return (
    <div id="report-attendance" style={reportStyle}>
      <h2>{month} 打卡紀錄</h2>
      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={thTdStyle}>日期</th>
            <th style={thTdStyle}>員工</th>
            <th style={thTdStyle}>時間</th>
            <th style={thTdStyle}>類型</th>
            <th style={thTdStyle}>設備 / 備註</th>
          </tr>
        </thead>
        <tbody>
          {monthAttendance.map(a => {
            const emp = employees.find(e => e.id === a.employeeId);
            return (
              <tr key={a.id}>
                <td style={thTdStyle}>{a.date}</td>
                <td style={thTdStyle}>{emp?.name || a.employeeId}</td>
                <td style={thTdStyle}>{a.time}</td>
                <td style={thTdStyle}>{a.type === 'in' ? '上班' : '下班'}</td>
                <td style={thTdStyle}>{a.deviceInfo || '-'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

// ====== 5. x月份差勤申請單 ======
export const MonthlyRequestsReport: React.FC<{ month: string, leaves: any[], overtimeReqs: any[], punchCorrections: any[], employees: any[] }> = ({ month, leaves, overtimeReqs, punchCorrections, employees }) => {
  const monthLeaves = leaves.filter(l => l.startDate.startsWith(month));
  const monthOvertime = overtimeReqs.filter(o => o.date.startsWith(month));
  const monthCorrections = punchCorrections.filter(p => p.date.startsWith(month));

  return (
    <div id="report-requests" style={reportStyle}>
      <h2>{month} 差勤申請單</h2>
      
      <h3>請假申請</h3>
      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={thTdStyle}>員工</th>
            <th style={thTdStyle}>假別</th>
            <th style={thTdStyle}>開始</th>
            <th style={thTdStyle}>結束</th>
            <th style={thTdStyle}>時數</th>
            <th style={thTdStyle}>狀態</th>
            <th style={thTdStyle}>備註</th>
          </tr>
        </thead>
        <tbody>
          {monthLeaves.map(l => (
            <tr key={l.id}>
              <td style={thTdStyle}>{employees.find(e => e.id === l.employeeId)?.name}</td>
              <td style={thTdStyle}>{l.leaveType}</td>
              <td style={thTdStyle}>{l.startDate} {l.startTime}</td>
              <td style={thTdStyle}>{l.endDate} {l.endTime}</td>
              <td style={thTdStyle}>{l.hours}</td>
              <td style={thTdStyle}>{l.status}</td>
              <td style={thTdStyle}>{l.reason}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3 style={{ marginTop: '20px' }}>加班申請</h3>
      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={thTdStyle}>員工</th>
            <th style={thTdStyle}>日期</th>
            <th style={thTdStyle}>時間</th>
            <th style={thTdStyle}>時數</th>
            <th style={thTdStyle}>補償</th>
            <th style={thTdStyle}>狀態</th>
            <th style={thTdStyle}>事由</th>
          </tr>
        </thead>
        <tbody>
          {monthOvertime.map(o => (
            <tr key={o.id}>
              <td style={thTdStyle}>{employees.find(e => e.id === o.employeeId)?.name}</td>
              <td style={thTdStyle}>{o.date}</td>
              <td style={thTdStyle}>{o.startTime} - {o.endTime}</td>
              <td style={thTdStyle}>{o.hours}</td>
              <td style={thTdStyle}>{o.compensationType === 'pay' ? '加班費' : '補休'}</td>
              <td style={thTdStyle}>{o.status}</td>
              <td style={thTdStyle}>{o.reason}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3 style={{ marginTop: '20px' }}>補卡申請</h3>
      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={thTdStyle}>員工</th>
            <th style={thTdStyle}>日期</th>
            <th style={thTdStyle}>時間</th>
            <th style={thTdStyle}>類型</th>
            <th style={thTdStyle}>狀態</th>
            <th style={thTdStyle}>事由</th>
          </tr>
        </thead>
        <tbody>
          {monthCorrections.map(c => (
            <tr key={c.id}>
              <td style={thTdStyle}>{employees.find(e => e.id === c.employeeId)?.name}</td>
              <td style={thTdStyle}>{c.date}</td>
              <td style={thTdStyle}>{c.time}</td>
              <td style={thTdStyle}>{c.type === 'in' ? '上班' : '下班'}</td>
              <td style={thTdStyle}>{c.status}</td>
              <td style={thTdStyle}>{c.reason}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

// ====== 6. x月份差勤異常報告 ======
export const MonthlyExceptionsReport: React.FC<{ month: string, attendance: any[], schedules: any[], employees: any[] }> = ({ month, attendance, schedules, employees }) => {
  const exceptions: any[] = [];
  
  // 找出該月份所有排班
  const monthSchedules = schedules.filter(s => s.date.startsWith(month));
  
  monthSchedules.forEach(sched => {
    if (sched.shift === '休假' || sched.shift === '例假' || !sched.shift) return;
    
    const empAtt = attendance.filter(a => a.employeeId === sched.employeeId && a.date === sched.date);
    const sortedAtt = [...empAtt].sort((a, b) => parseTimeStrToMinutes(a.time) - parseTimeStrToMinutes(b.time));
    
    const firstIn = sortedAtt.find(a => a.type === 'in');
    const lastOut = [...sortedAtt].reverse().find(a => a.type === 'out');
    
    // 如果連上班或下班卡都沒有，視為異常
    if (!firstIn || !lastOut) {
      exceptions.push({
        date: sched.date,
        employeeId: sched.employeeId,
        shift: sched.shift,
        issue: !firstIn && !lastOut ? '曠職 (無打卡)' : (!firstIn ? '缺上班卡' : '缺下班卡'),
        inTime: firstIn?.time || '-',
        outTime: lastOut?.time || '-'
      });
      return;
    }

    // 呼叫 evaluatePunchesStatus 判斷是否遲到早退
    const status = evaluatePunchesStatus(firstIn.time, lastOut.time, sched.shift);
    if (status.isLate || status.isEarly) {
      let issueStr = [];
      if (status.isLate) issueStr.push('遲到');
      if (status.isEarly) issueStr.push('早退');
      
      exceptions.push({
        date: sched.date,
        employeeId: sched.employeeId,
        shift: sched.shift,
        issue: issueStr.join('、'),
        inTime: firstIn.time,
        outTime: lastOut.time
      });
    }
  });

  return (
    <div id="report-exceptions" style={reportStyle}>
      <h2>{month} 差勤異常報告</h2>
      {exceptions.length === 0 ? (
        <p>當月無差勤異常。</p>
      ) : (
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thTdStyle}>日期</th>
              <th style={thTdStyle}>員工</th>
              <th style={thTdStyle}>班別</th>
              <th style={thTdStyle}>異常狀況</th>
              <th style={thTdStyle}>上班打卡</th>
              <th style={thTdStyle}>下班打卡</th>
            </tr>
          </thead>
          <tbody>
            {exceptions.map((ex, idx) => (
              <tr key={idx}>
                <td style={thTdStyle}>{ex.date}</td>
                <td style={thTdStyle}>{employees.find(e => e.id === ex.employeeId)?.name}</td>
                <td style={thTdStyle}>{ex.shift}</td>
                <td style={{ ...thTdStyle, color: 'red' }}>{ex.issue}</td>
                <td style={thTdStyle}>{ex.inTime}</td>
                <td style={thTdStyle}>{ex.outTime}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};
