import React, { useState } from 'react';
import { useAdminData } from '../context/AdminDataContext';

const LEAVE_TYPES = [
  { value: 'sick', label: '病假 (半薪)' },
  { value: 'personal', label: '事假 (無薪)' },
  { value: 'annual', label: '特別休假' },
  { value: 'official', label: '公假' },
  { value: 'marriage', label: '婚假' },
  { value: 'bereavement', label: '喪假' },
  { value: 'menstrual', label: '生理假' },
  { value: 'prenatal', label: '產前假' },
  { value: 'shift_adj', label: '班別調整' },
];

const hoursOptions = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const minutesOptions = ['00', '30'];
const LEAVE_QUOTA: Record<string, number> = { sick: 30, personal: 14, menstrual: 3, marriage: 8 };

export const LeavesManager: React.FC = () => {
  const {
    leaves,
    overtimeReqs,
    punchCorrections,
    attendanceAppeals,
    employees,
    attendance,
    approveLeave,
    rejectLeave,
    updateLeave,
    deleteLeave,
    approveOvertime,
    rejectOvertime,
    approvePunchCorrection,
    rejectPunchCorrection,
    approveAppeal,
    rejectAppeal
  } = useAdminData();

  const [leavesSubTab, setLeavesSubTab] = useState<'pending' | 'history' | 'balance'>('pending');

  // Edit leave states
  const [showEditLeaveModal, setShowEditLeaveModal] = useState(false);
  const [editLeaveId, setEditLeaveId] = useState('');
  const [editLeaveEmployeeId, setEditLeaveEmployeeId] = useState('');
  const [editLeaveType, setEditLeaveType] = useState('sick');
  const [editLeaveStart, setEditLeaveStart] = useState('');
  const [editLeaveEnd, setEditLeaveEnd] = useState('');
  const [editLeaveHours, setEditLeaveHours] = useState(8);
  const [editLeaveStatus, setEditLeaveStatus] = useState('pending');
  const [editLeaveReason, setEditLeaveReason] = useState('');
  const [editLeaveStartTime, setEditLeaveStartTime] = useState('');
  const [editLeaveEndTime, setEditLeaveEndTime] = useState('');

  const [editStartHour, setEditStartHour] = useState<string>('09');
  const [editStartMin, setEditStartMin] = useState<string>('00');
  const [editEndHour, setEditEndHour] = useState<string>('18');
  const [editEndMin, setEditEndMin] = useState<string>('00');

  React.useEffect(() => {
    setEditLeaveStartTime(`${editStartHour}:${editStartMin}`);
  }, [editStartHour, editStartMin]);

  React.useEffect(() => {
    setEditLeaveEndTime(`${editEndHour}:${editEndMin}`);
  }, [editEndHour, editEndMin]);

  // 自動計算編輯中的時數
  React.useEffect(() => {
    if (editLeaveStart && editLeaveEnd && editLeaveStartTime && editLeaveEndTime) {
      const parseTimeToMins = (t: string) => {
        const [h, m] = t.split(':').map(Number);
        return h * 60 + m;
      };
      const start = parseTimeToMins(editLeaveStartTime);
      let end = parseTimeToMins(editLeaveEndTime);
      if (end < start) end += 24 * 60; // 跨夜
      
      const dailyHours = Math.ceil(((end - start) / 60) * 2) / 2;

      const diffDays = Math.round((new Date(editLeaveEnd).getTime() - new Date(editLeaveStart).getTime()) / (1000 * 60 * 60 * 24)) + 1;
      const totalHours = dailyHours * (isNaN(diffDays) ? 1 : Math.max(1, diffDays));
      console.log('--- ADMIN EDIT LEAVE CALCULATOR LOG ---', {
        editLeaveStart,
        editLeaveEnd,
        editLeaveStartTime,
        editLeaveEndTime,
        start,
        end,
        dailyHours,
        diffDays,
        totalHours
      });
      setEditLeaveHours(totalHours);
    }
  }, [editLeaveType, editLeaveStart, editLeaveEnd, editLeaveStartTime, editLeaveEndTime]);

  // Annual leave calculations
  const calcAnnual = (onboardDate: string): number => {
    if (!onboardDate) return 0;
    const months = (Date.now() - new Date(onboardDate).getTime()) / (1000 * 60 * 60 * 24 * 30.44);
    if (months < 6) return 0; 
    if (months < 12) return 3;
    const y = months / 12;
    if (y < 2) return 7; 
    if (y < 3) return 10; 
    if (y < 5) return 14; 
    if (y < 10) return 15;
    return Math.min(30, 15 + Math.floor(y - 10));
  };

  const approvedLeaves = leaves.filter(l => l.status === 'approved');
  const usedByEmpType = (empId: string, type: string) => {
    const totalHours = approvedLeaves.filter(l => l.employeeId === empId && l.leaveType === type)
      .reduce((s, l) => s + (l.hours || 0), 0);
    return Math.ceil(totalHours / 8);
  };

  const handleOpenEditLeave = (leave: any) => {
    if (leave.id === '1' || leave.id === '2') {
      alert('模擬資料無法編輯。');
      return;
    }
    setEditLeaveId(leave.id);
    setEditLeaveEmployeeId(leave.employeeId || '');
    setEditLeaveType(leave.leaveType || 'sick');
    setEditLeaveStart(leave.startDate || '');
    setEditLeaveEnd(leave.endDate || '');
    setEditLeaveHours(Number(leave.hours) || 8);
    setEditLeaveStatus(leave.status || 'pending');
    setEditLeaveReason(leave.reason || '');

    const st = leave.startTime || '09:00';
    const et = leave.endTime || '18:00';
    const [sh, sm] = st.split(':');
    const [eh, em] = et.split(':');
    setEditStartHour(sh || '09');
    setEditStartMin(sm || '00');
    setEditEndHour(eh || '18');
    setEditEndMin(em || '00');

    setEditLeaveStartTime(st);
    setEditLeaveEndTime(et);
    setShowEditLeaveModal(true);
  };

  const handleUpdateLeave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editLeaveType !== 'shift_adj') {
      if (Number(editLeaveHours) < 0.5) {
        alert('請假時數最小為 0.5 小時');
        return;
      }
      if (Number(editLeaveHours) % 0.5 !== 0) {
        alert('請假時數必須以 0.5 小時為最小單位');
        return;
      }
    }
    try {
      const updateData: any = {
        leaveType: editLeaveType,
        startDate: editLeaveStart,
        endDate: editLeaveEnd,
        hours: Number(editLeaveHours),
        status: editLeaveStatus,
        reason: editLeaveReason,
        startTime: editLeaveStartTime,
        endTime: editLeaveEndTime,
        leavePeriod: 'hour',
        periodLabel: editLeaveType === 'shift_adj'
          ? `調整 (${editLeaveStartTime} - ${editLeaveEndTime})`
          : `時段 (${editLeaveStartTime} - ${editLeaveEndTime})`
      };

      await updateLeave(editLeaveId, updateData);
      setShowEditLeaveModal(false);
      alert('✅ 假單更新成功！');
    } catch (err) {
      console.error(err);
      alert('更新失敗');
    }
  };

  const handleDeleteLeave = async (id: string) => {
    if (id === '1' || id === '2') {
      alert('模擬資料無法刪除。');
      return;
    }
    if (!window.confirm('確定要刪除此假單嗎？')) return;
    try {
      await deleteLeave(id);
      alert('✅ 假單已刪除！');
    } catch (err) {
      console.error(err);
      alert('刪除失敗');
    }
  };

  const handleApproveLeaveLocal = async (id: string) => {
    try {
      await approveLeave(id);
    } catch (err) {
      console.error(err);
      alert('核准失敗');
    }
  };

  const handleRejectLeaveLocal = async (id: string) => {
    try {
      await rejectLeave(id);
    } catch (err) {
      console.error(err);
      alert('駁回失敗');
    }
  };

  const handleApproveOTLocal = async (id: string) => {
    try {
      await approveOvertime(id);
    } catch (err) {
      console.error(err);
      alert('核准失敗');
    }
  };

  const handleRejectOTLocal = async (id: string) => {
    try {
      await rejectOvertime(id);
    } catch (err) {
      console.error(err);
      alert('駁回失敗');
    }
  };

  const handleApprovePCLocal = async (id: string) => {
    try {
      await approvePunchCorrection(id);
      alert('✅ 補卡已核准，已自動完成補登！');
    } catch (err) {
      console.error(err);
      alert('核准失敗');
    }
  };

  const handleRejectPCLocal = async (id: string) => {
    try {
      await rejectPunchCorrection(id);
    } catch (err) {
      console.error(err);
      alert('駁回失敗');
    }
  };

  const handleApproveAppealLocal = async (id: string) => {
    try {
      await approveAppeal(id);
      alert('✅ 申訴已核准，相關打卡狀態已更新為正常！');
    } catch (err) {
      console.error(err);
      alert('核准失敗');
    }
  };

  const handleRejectAppealLocal = async (id: string) => {
    try {
      await rejectAppeal(id);
    } catch (err) {
      console.error(err);
      alert('駁回失敗');
    }
  };

  // ApproveCard subcomponent
  const ApproveCard = ({ item, type, onApprove, onReject }: { item: any; type: string; onApprove: () => void; onReject: () => void }) => {
    let annualOverQuotaWarning = '';
    if (type === 'leave' && item.leaveType === 'annual') {
      const emp = employees.find(e => e.id === item.employeeId);
      const annualTotal = emp ? calcAnnual(emp.onboardDate || '') : 0;
      const alreadyUsed = usedByEmpType(item.employeeId, 'annual');
      const thisRequestDays = (item.hours || 0) / 8;
      const remaining = annualTotal - alreadyUsed;
      if (thisRequestDays > remaining) {
        annualOverQuotaWarning = `⚠️ 特休超額警示：員工剩餘 ${remaining.toFixed(1)} 天，本次申請 ${thisRequestDays.toFixed(1)} 天，超出 ${(thisRequestDays - remaining).toFixed(1)} 天！核准後將無薪扣款。`;
      }
    }

    let otherOverQuotaWarning = '';
    if (type === 'leave' && item.leaveType !== 'annual' && LEAVE_QUOTA[item.leaveType]) {
      const used = usedByEmpType(item.employeeId, item.leaveType);
      const quota = LEAVE_QUOTA[item.leaveType];
      const thisRequestDays = (item.hours || 0) / 8;
      const remaining = quota - used;
      if (thisRequestDays > remaining) {
        otherOverQuotaWarning = `⚠️ 假別超額：${LEAVE_TYPES.find(t => t.value === item.leaveType)?.label || item.leaveType} 剩餘 ${remaining.toFixed(1)} 天，本次申請 ${thisRequestDays.toFixed(1)} 天，超出額度。`;
      }
    }

    return (
      <div style={{ padding: '14px', borderRadius: '12px', backgroundColor: '#f9fafb', border: annualOverQuotaWarning || otherOverQuotaWarning ? '1px solid rgba(217,119,6,0.4)' : '1px solid var(--border)', fontSize: '13px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
          <span style={{ fontWeight: '700', color: 'var(--text-main)' }}>{item.empName}</span>
          <span style={{ fontSize: '11px', color: '#9ca3af' }}>{new Date(item.timestamp).toLocaleDateString('zh-TW')}</span>
        </div>
        {type === 'leave' && <div style={{ fontSize: '12px', color: '#374151', marginBottom: '6px' }}>
          {LEAVE_TYPES.find(t => t.value === item.leaveType)?.label} ｜ {item.startDate}{item.startDate !== item.endDate ? ` ~ ${item.endDate}` : ''} ({item.periodLabel || '全天'}) ｜ {item.hours}h
          {item.reason && <div style={{ color: '#6b7280', marginTop: '2px', fontStyle: 'italic' }}>事由：{item.reason}</div>}
        </div>}
        {type === 'overtime' && (() => {
          const empPunches = attendance.filter((rec: any) => rec.employeeId === item.employeeId && rec.date === item.date);
          const punchTimes = empPunches.map((rec: any) => rec.time).filter(Boolean).sort();
          const punchRangeStr = punchTimes.length > 0 
            ? `${punchTimes[0]} ~ ${punchTimes[punchTimes.length - 1]}` 
            : '無打卡紀錄';
          
          return (
            <div style={{ fontSize: '12px', color: '#374151', marginBottom: '6px' }}>
              <div>加班日期：{item.date} ｜ {item.startTime && item.endTime ? `${item.startTime} ~ ${item.endTime} (` : ''}{item.hours}小時{item.startTime && item.endTime ? ')' : ''}</div>
              <div style={{ color: '#059669', fontWeight: '600', marginTop: '2px' }}>
                📅 當天打卡時段：{punchRangeStr}
              </div>
              {item.reason && <div style={{ color: '#6b7280', marginTop: '2px', fontStyle: 'italic' }}>原因：{item.reason}</div>}
            </div>
          );
        })()}
        {type === 'punch' && <div style={{ fontSize: '12px', color: '#374151', marginBottom: '6px' }}>
          補卡日期：{item.date} ｜ 時間：{item.time} ｜ 類型：{item.type === 'clock_in' ? '上班' : item.type === 'clock_out' ? '下班' : item.type}
          {item.reason && <div style={{ color: '#6b7280', marginTop: '2px', fontStyle: 'italic' }}>原因：{item.reason}</div>}
        </div>}
        {type === 'appeal' && <div style={{ fontSize: '12px', color: '#374151', marginBottom: '6px' }}>
          異常日期：{item.exceptionDate || item.date} ｜ 異常類型：{item.exceptionType || '未匹配班表/遲到/早退'}
          <div style={{ color: '#6b7280', marginTop: '2px', fontStyle: 'italic' }}>說明：{item.reason}</div>
        </div>}

        {(annualOverQuotaWarning || otherOverQuotaWarning) && (
          <div style={{ margin: '6px 0', padding: '8px 10px', borderRadius: '6px', backgroundColor: 'rgba(217,119,6,0.1)', border: '1px solid rgba(217,119,6,0.3)', fontSize: '11px', color: '#92400e', fontWeight: '600', lineHeight: 1.5 }}>
            {annualOverQuotaWarning || otherOverQuotaWarning}
          </div>
        )}

        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={onApprove} style={{ flex: 1, padding: '7px', borderRadius: '7px', border: 'none', backgroundColor: '#10b981', color: '#fff', fontSize: '12px', fontWeight: '700', cursor: 'pointer' }}>✅ 核准</button>
          <button onClick={onReject}  style={{ flex: 1, padding: '7px', borderRadius: '7px', border: 'none', backgroundColor: '#ef4444', color: '#fff', fontSize: '12px', fontWeight: '700', cursor: 'pointer' }}>❌ 駁回</button>
        </div>
        {type === 'leave' && (
          <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
            <button onClick={() => handleOpenEditLeave(item)} style={{ flex: 1, padding: '5px', borderRadius: '6px', border: '1px solid var(--primary)', backgroundColor: 'transparent', color: 'var(--primary)', fontSize: '11px', fontWeight: '600', cursor: 'pointer' }}>編輯假單</button>
            <button onClick={() => handleDeleteLeave(item.id)} style={{ flex: 1, padding: '5px', borderRadius: '6px', border: '1px solid #ef4444', backgroundColor: 'transparent', color: '#ef4444', fontSize: '11px', fontWeight: '600', cursor: 'pointer' }}>刪除假單</button>
          </div>
        )}
      </div>
    );
  };

  const allPending = [
    ...leaves.filter(l => l.status === 'pending').map(l => ({ ...l, _type: 'leave' })),
    ...overtimeReqs.filter(o => o.status === 'pending').map(o => ({ ...o, _type: 'overtime' })),
    ...punchCorrections.filter(p => p.status === 'pending').map(p => ({ ...p, _type: 'punch' })),
    ...attendanceAppeals.filter(a => a.status === 'pending').map(a => ({ ...a, _type: 'appeal' })),
  ].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

  const allHistory = [
    ...leaves.filter(l => ['approved','rejected','cancelled'].includes(l.status)).map(l => ({ ...l, _type: 'leave' })),
    ...overtimeReqs.filter(o => ['approved','rejected'].includes(o.status)).map(o => ({ ...o, _type: 'overtime' })),
    ...punchCorrections.filter(p => ['approved','rejected'].includes(p.status)).map(p => ({ ...p, _type: 'punch' })),
    ...attendanceAppeals.filter(a => ['approved','rejected'].includes(a.status)).map(a => ({ ...a, _type: 'appeal' })),
  ].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

  const typeLabel = (t: string) => t === 'leave' ? '📄 請假' : t === 'overtime' ? '⏰ 加班' : t === 'punch' ? '🔧 補卡' : '📣 申訴';
  const statusBadge = (s: string) =>
    s === 'approved' ? { label: '✅ 已核准', color: '#10b981', bg: 'rgba(16,185,129,0.1)' } :
    s === 'rejected' ? { label: '❌ 已駁回', color: '#ef4444', bg: 'rgba(239,68,68,0.1)' } :
    { label: '🚫 已撤銷', color: '#9ca3af', bg: 'rgba(156,163,175,0.1)' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Summary Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
        {[
          { label: '請假待審', count: leaves.filter(l => l.status === 'pending').length, color: '#4f46e5' },
          { label: '加班待審', count: overtimeReqs.filter(o => o.status === 'pending').length, color: '#059669' },
          { label: '補卡待審', count: punchCorrections.filter(p => p.status === 'pending').length, color: '#d97706' },
          { label: '申訴待審', count: attendanceAppeals.filter(a => a.status === 'pending').length, color: '#7c3aed' },
        ].map(item => (
          <div key={item.label} className="card" style={{ padding: '16px', textAlign: 'center' }}>
            <div style={{ fontSize: '28px', fontWeight: '900', color: item.count > 0 ? '#ef4444' : '#10b981' }}>{item.count}</div>
            <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>{item.label}</div>
          </div>
        ))}
      </div>

      {/* Subtab Buttons */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        {([
          { key: 'pending', label: `⏳ 待審核 (${allPending.length})` },
          { key: 'history', label: `📋 已審核紀錄 (${allHistory.length})` },
          { key: 'balance', label: `🏖️ 全員假別餘額` },
        ] as const).map(tab => (
          <button key={tab.key} onClick={() => setLeavesSubTab(tab.key)}
            style={{ padding: '9px 18px', borderRadius: '8px', fontSize: '13px', fontWeight: '700', border: 'none', cursor: 'pointer',
              backgroundColor: leavesSubTab === tab.key ? 'var(--primary)' : '#f3f4f6',
              color: leavesSubTab === tab.key ? '#fff' : 'var(--text-main)' }}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Pending Requests ── */}
      {leavesSubTab === 'pending' && (
        <div className="card" style={{ padding: '24px' }}>
          {allPending.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#10b981', fontWeight: '700', fontSize: '15px' }}>🎉 目前無待審核的差勤申請！</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '14px' }}>
              {allPending.map(item => (
                <div key={item.id}>
                  <div style={{ fontSize: '11px', fontWeight: '700', color: '#9ca3af', marginBottom: '6px' }}>{typeLabel(item._type)}</div>
                  <ApproveCard
                    item={item} type={item._type}
                    onApprove={() => item._type === 'leave' ? handleApproveLeaveLocal(item.id) : item._type === 'overtime' ? handleApproveOTLocal(item.id) : item._type === 'punch' ? handleApprovePCLocal(item.id) : handleApproveAppealLocal(item.id)}
                    onReject={() => item._type === 'leave' ? handleRejectLeaveLocal(item.id) : item._type === 'overtime' ? handleRejectOTLocal(item.id) : item._type === 'punch' ? handleRejectPCLocal(item.id) : handleRejectAppealLocal(item.id)}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── History Records ── */}
      {leavesSubTab === 'history' && (
        <div className="card" style={{ padding: '24px' }}>
          <h3 style={{ margin: '0 0 16px', fontSize: '15px', fontWeight: '700' }}>已審核差勤紀錄</h3>
          {allHistory.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)', fontSize: '13px' }}>尚無已審核紀錄</div>
          ) : (
            <div className="table-scroll-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>員工</th><th>申請類型</th><th>詳細內容</th><th>申請時間</th><th>狀態</th><th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {allHistory.map(item => {
                    const s = statusBadge(item.status);
                    return (
                      <tr key={item.id}>
                        <td style={{ fontWeight: '600' }}>{item.empName}</td>
                        <td>{typeLabel(item._type)}</td>
                        <td style={{ fontSize: '12px', color: '#6b7280' }}>
                          {item._type === 'leave' && `${LEAVE_TYPES.find(t => t.value === item.leaveType)?.label || item.leaveType} ${item.startDate}~${item.endDate} ${item.hours}h`}
                          {item._type === 'overtime' && (() => {
                            const empPunches = attendance.filter((rec: any) => rec.employeeId === item.employeeId && rec.date === item.date);
                            const punchTimes = empPunches.map((rec: any) => rec.time).filter(Boolean).sort();
                            const punchRange = punchTimes.length > 0 ? ` [打卡: ${punchTimes[0]}~${punchTimes[punchTimes.length - 1]}]` : ' [無打卡]';
                            return (
                              <span>
                                {item.date} {item.startTime && item.endTime ? `${item.startTime}~${item.endTime} ` : ''}({item.hours}h)
                                <strong style={{ color: '#059669', marginLeft: '6px' }}>{punchRange}</strong>
                              </span>
                            );
                          })()}
                          {item._type === 'punch' && `${item.date} ${item.time} ${item.type === 'clock_in' ? '上班' : '下班'}`}
                          {item._type === 'appeal' && `${item.exceptionDate || item.date} [${item.exceptionType || '遲到/早退異常'}]`}
                        </td>
                        <td style={{ fontSize: '12px', color: '#9ca3af' }}>{item.timestamp ? new Date(item.timestamp).toLocaleDateString('zh-TW') : '-'}</td>
                        <td><span style={{ padding: '2px 10px', borderRadius: '12px', fontSize: '12px', fontWeight: '700', color: s.color, backgroundColor: s.bg }}>{s.label}</span></td>
                        <td>
                          {item._type === 'leave' && (
                            <div style={{ display: 'flex', gap: '8px' }}>
                              <button 
                                className="btn-text" 
                                style={{ color: 'var(--primary)', fontSize: '12px', border: 'none', background: 'none', cursor: 'pointer' }}
                                onClick={() => handleOpenEditLeave(item)}
                              >
                                編輯
                              </button>
                              <button 
                                className="btn-text" 
                                style={{ color: '#ef4444', fontSize: '12px', border: 'none', background: 'none', cursor: 'pointer' }}
                                onClick={() => handleDeleteLeave(item.id)}
                              >
                                刪除
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Quota Balance ── */}
      {leavesSubTab === 'balance' && (
        <div className="card" style={{ padding: '24px' }}>
          <h3 style={{ margin: '0 0 16px', fontSize: '15px', fontWeight: '700' }}>全員假別剩餘天數</h3>
          <div className="table-scroll-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>員工姓名</th>
                  <th>到職日</th>
                  <th>🏖️ 特別休假</th>
                  <th>🏥 病假 (/30天)</th>
                  <th>👤 事假 (/14天)</th>
                  <th>💊 生理假 (/3天)</th>
                  <th>💍 婚假 (/8天)</th>
                </tr>
              </thead>
              <tbody>
                {employees.map(emp => {
                  const annualTotal = calcAnnual(emp.onboardDate || '');
                  const annualUsed = usedByEmpType(emp.id, 'annual');
                  const sickUsed = usedByEmpType(emp.id, 'sick');
                  const personalUsed = usedByEmpType(emp.id, 'personal');
                  const menstrualUsed = usedByEmpType(emp.id, 'menstrual');
                  const marriageUsed = usedByEmpType(emp.id, 'marriage');
                  const cell = (used: number, total: number) => {
                    const rem = Math.max(0, total - used);
                    const pct = total > 0 ? (used / total) * 100 : 0;
                    return (
                      <td key={`${emp.id}-${total}`} style={{ textAlign: 'center' }}>
                        <div style={{ fontWeight: '700', color: rem === 0 ? '#ef4444' : rem <= 2 ? '#d97706' : '#10b981', fontSize: '15px' }}>{rem.toFixed(1)}</div>
                        <div style={{ fontSize: '10px', color: '#9ca3af' }}>已用 {used.toFixed(1)}</div>
                        <div style={{ marginTop: '3px', height: '4px', borderRadius: '2px', backgroundColor: '#e5e7eb', overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${Math.min(100, pct)}%`, backgroundColor: pct >= 90 ? '#ef4444' : pct >= 60 ? '#d97706' : '#10b981', borderRadius: '2px' }} />
                        </div>
                      </td>
                    );
                  };
                  return (
                    <tr key={emp.id}>
                      <td style={{ fontWeight: '600' }}>{emp.name}</td>
                      <td style={{ fontSize: '12px', color: '#6b7280' }}>{emp.onboardDate || '-'}</td>
                      {cell(annualUsed, annualTotal)}
                      {cell(sickUsed, LEAVE_QUOTA.sick)}
                      {cell(personalUsed, LEAVE_QUOTA.personal)}
                      {cell(menstrualUsed, LEAVE_QUOTA.menstrual)}
                      {cell(marriageUsed, LEAVE_QUOTA.marriage)}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{ marginTop: '12px', fontSize: '11px', color: '#9ca3af' }}>
            ※ 剩餘天數以天計。特別休假依到職日年資自動計算（勞基法第38條）。
          </div>
        </div>
      )}

      {/* Edit Leave Modal */}
      {showEditLeaveModal && (
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
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
            maxHeight: '90vh',
            overflowY: 'auto'
          }}>
            <h3 style={{ marginBottom: '20px', color: 'var(--primary)', fontSize: '20px', fontWeight: '700' }}>編輯假單</h3>
            <form onSubmit={handleUpdateLeave} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '13px', fontWeight: '600' }}>員工姓名</label>
                <select 
                  disabled
                  value={editLeaveEmployeeId}
                  style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px', backgroundColor: '#f3f4f6', cursor: 'not-allowed' }}
                >
                  {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '13px', fontWeight: '600' }}>假別</label>
                <select 
                  value={editLeaveType} 
                  onChange={(e) => setEditLeaveType(e.target.value)}
                  style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px', backgroundColor: '#fff' }}
                >
                  {LEAVE_TYPES.map(lt => (
                    <option key={lt.value} value={lt.value}>{lt.label}</option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '13px', fontWeight: '600' }}>開始日期</label>
                <input 
                  type="date" 
                  required 
                  value={editLeaveStart} 
                  onChange={(e) => setEditLeaveStart(e.target.value)} 
                  style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px' }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '13px', fontWeight: '600' }}>結束日期</label>
                <input 
                  type="date" 
                  required 
                  value={editLeaveEnd} 
                  onChange={(e) => setEditLeaveEnd(e.target.value)} 
                  style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px' }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '13px', fontWeight: '600' }}>請假開始時間</label>
                <div style={{ display: 'flex', gap: '4px' }}>
                  <select value={editStartHour} onChange={(e) => setEditStartHour(e.target.value)} style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px', flex: 1, backgroundColor: '#fff' }}>
                    {hoursOptions.map(h => <option key={h} value={h}>{h} 點</option>)}
                  </select>
                  <select value={editStartMin} onChange={(e) => setEditStartMin(e.target.value)} style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px', flex: 1, backgroundColor: '#fff' }}>
                    {minutesOptions.map(m => <option key={m} value={m}>{m} 分</option>)}
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '13px', fontWeight: '600' }}>請假結束時間</label>
                <div style={{ display: 'flex', gap: '4px' }}>
                  <select value={editEndHour} onChange={(e) => setEditEndHour(e.target.value)} style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px', flex: 1, backgroundColor: '#fff' }}>
                    {hoursOptions.map(h => <option key={h} value={h}>{h} 點</option>)}
                  </select>
                  <select value={editEndMin} onChange={(e) => setEditEndMin(e.target.value)} style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px', flex: 1, backgroundColor: '#fff' }}>
                    {minutesOptions.map(m => <option key={m} value={m}>{m} 分</option>)}
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '13px', fontWeight: '600' }}>時數 (小時)</label>
                <input 
                  type="number" 
                  required 
                  disabled 
                  value={editLeaveHours} 
                  style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px', backgroundColor: '#f3f4f6', cursor: 'not-allowed' }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '13px', fontWeight: '600' }}>狀態</label>
                <select 
                  value={editLeaveStatus} 
                  onChange={(e) => setEditLeaveStatus(e.target.value)}
                  style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px', backgroundColor: '#fff' }}
                >
                  <option value="pending">待審核</option>
                  <option value="approved">核准</option>
                  <option value="rejected">駁回</option>
                </select>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '13px', fontWeight: '600' }}>事由 / 說明</label>
                <textarea 
                  value={editLeaveReason} 
                  onChange={(e) => setEditLeaveReason(e.target.value)} 
                  placeholder="請輸入請假事由"
                  style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px', minHeight: '80px', fontFamily: 'inherit' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
                <button 
                  type="button" 
                  onClick={() => setShowEditLeaveModal(false)}
                  style={{ flex: 1, padding: '12px', borderRadius: '8px', border: '1px solid #d1d5db', backgroundColor: '#f3f4f6', cursor: 'pointer', fontWeight: '600', fontSize: '14px' }}
                >
                  取消
                </button>
                <button 
                  type="submit" 
                  style={{ flex: 1, padding: '12px', borderRadius: '8px', border: 'none', backgroundColor: 'var(--primary)', color: '#fff', cursor: 'pointer', fontWeight: '600', fontSize: '14px' }}
                >
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
