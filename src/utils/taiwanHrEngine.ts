/**
 * Taiwan HR & Payroll Engine (taiwanHrEngine.ts)
 * 精通台灣勞動基準法、勞保、健保、勞退與差勤計算的核心邏輯引擎。
 */

export interface InsuranceRates {
  laborRate: number;        // 勞保費率 (例如 0.12，包含就業保險、職災費率等)
  nhiRate: number;          // 健保費率 (例如 0.0517)
  nhiAvgDependents: number;   // 健保平均眷屬數 (目前法規為 0.56)
  employerLaborRatio: number; // 雇主負擔比例 (通常為 0.7)
  employeeLaborRatio: number; // 員工自付比例 (通常為 0.2)
  employerNhiRatio: number;   // 雇主負擔比例 (通常為 0.6)
  employeeNhiRatio: number;   // 員工自付比例 (通常為 0.3)
}

// 台灣 2025/2026 年預設勞健退費率
export const DEFAULT_INSURANCE_RATES: InsuranceRates = {
  laborRate: 0.12,
  nhiRate: 0.0517,
  nhiAvgDependents: 0.56,
  employerLaborRatio: 0.7,
  employeeLaborRatio: 0.2,
  employerNhiRatio: 0.6,
  employeeNhiRatio: 0.3
};

/**
 * 大魔王 A：計算單一員工當月勞健退保費（支援破月比例計算）
 * @param onboardDate 到職日 (Date 或 YYYY-MM-DD 字串)
 * @param resignDate 離職日 (Date 或 YYYY-MM-DD 字串，null 代表在職)
 * @param targetYearMonth 結算月份 (格式: YYYY-MM)
 * @param salaryConfig 該員工該月生效的申報級距
 * @param rates 費率設定
 */
export function calculatePayrollInsurance(
  onboardDate: Date | string,
  resignDate: Date | string | null,
  targetYearMonth: string,
  salaryConfig: { laborSub: number; nhiSub: number; pensionSub: number; nhiDependents?: number },
  rates: InsuranceRates = DEFAULT_INSURANCE_RATES
) {
  const oDate = typeof onboardDate === 'string' ? new Date(onboardDate) : onboardDate;
  const rDate = resignDate ? (typeof resignDate === 'string' ? new Date(resignDate) : resignDate) : null;
  
  const [year, month] = targetYearMonth.split('-').map(Number);
  
  // 取得結算月份之第一天與最後一天
  const monthStart = new Date(year, month - 1, 1);
  const monthEnd = new Date(year, month, 0); // 0 號代表上個月的最後一天，即本月最後一天
  const daysInMonth = monthEnd.getDate();

  // 確定在職起迄與本月之重疊區間
  const activeStart = oDate > monthStart ? oDate : monthStart;
  const activeEnd = rDate && rDate < monthEnd ? rDate : monthEnd;

  // 如果到職日在當月之後，或者離職日在當月之前，代表當月完全不在職，保費皆為 0
  if (activeStart > monthEnd || (rDate && rDate < monthStart)) {
    return {
      laborDays: 0,
      employeeLabor: 0,
      employerLabor: 0,
      employeeNhi: 0,
      employerNhi: 0,
      employerPension: 0
    };
  }

  // === 1. 勞保天數計算 (採用台灣勞保 30天制大魔王規則) ===
  let laborDays = 0;
  const isFullMonth = activeStart.getTime() === monthStart.getTime() && activeEnd.getTime() === monthEnd.getTime();

  if (isFullMonth) {
    // 整月在職，不論大小月（31天或28天）皆以 30 天計
    laborDays = 30;
  } else {
    // 破月計算：
    const startDay = activeStart.getDate();
    const endDay = activeEnd.getDate();

    if (oDate > monthStart && (!rDate || rDate >= monthEnd)) {
      // 月中到職，未離職：30 - 到職日 + 1 (若31號到職算30號，亦即1天)
      const adjustedStart = startDay === 31 ? 30 : startDay;
      laborDays = 30 - adjustedStart + 1;
    } else if (oDate <= monthStart && rDate && rDate < monthEnd) {
      // 月初已在職，月中離職：以實際離職日計天數 (若31號離職算30天)
      laborDays = endDay === 31 ? 30 : endDay;
    } else {
      // 當月內到職且離職
      const diffTime = Math.abs(activeEnd.getTime() - activeStart.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
      laborDays = Math.min(diffDays, 30);
    }
  }

  // 勞保自付與雇主負擔計算
  const totalLaborPremium = salaryConfig.laborSub * rates.laborRate;
  const employeeLabor = Math.round(totalLaborPremium * rates.employeeLaborRatio * (laborDays / 30));
  const employerLabor = Math.round(totalLaborPremium * rates.employerLaborRatio * (laborDays / 30));

  // === 2. 全民健保計算 (採用月底在職足月計費制) ===
  let paysNhiThisMonth = false;
  
  // 健保規則：月底最後一天需在職；或者「同月申報入出籍」(當月到職且當月離職)
  const isEmployedAtMonthEnd = (!rDate || rDate >= monthEnd);
  const startAndLeaveSameMonth = 
    (oDate >= monthStart && oDate <= monthEnd) && 
    (rDate && rDate >= monthStart && rDate <= monthEnd);

  if (isEmployedAtMonthEnd || startAndLeaveSameMonth) {
    paysNhiThisMonth = true;
  }

  let employeeNhi = 0;
  let employerNhi = 0;

  if (paysNhiThisMonth) {
    // 實際加保眷屬數限制在 0 至 3 之間
    const deps = typeof salaryConfig.nhiDependents === 'number' ? Math.max(0, Math.min(salaryConfig.nhiDependents, 3)) : 0;
    // 員工自付健保費 = 投保金額 * 費率 * 員工自付比例 * (1 + 眷屬數) (四捨五入)
    employeeNhi = Math.round(salaryConfig.nhiSub * rates.nhiRate * rates.employeeNhiRatio * (1 + deps));
    // 雇主負擔健保費 = 投保金額 * 費率 * 雇主比例 * (1 + 平均眷屬數) (四捨五入)
    employerNhi = Math.round(salaryConfig.nhiSub * rates.nhiRate * rates.employerNhiRatio * (1 + rates.nhiAvgDependents));
  }

  // === 3. 勞工退休金 (雇主強提 6%，按當月實際在職日曆天數折算) ===
  const calendarDaysActive = Math.ceil(Math.abs(activeEnd.getTime() - activeStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  const pensionRatio = Math.min(calendarDaysActive / daysInMonth, 1.0);
  const employerPension = Math.round(salaryConfig.pensionSub * 0.06 * pensionRatio);

  return {
    laborDays,
    employeeLabor,
    employerLabor,
    employeeNhi,
    employerNhi,
    employerPension
  };
}

export interface LeavePeriod {
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  entitledDays: number;
}

/**
 * 大魔王 B：特別休假自動分配引擎（週年制）
 * 依員工到職日與基準時間點，生成歷史至當前所有的特休週年額度
 * @param onboardDateStr 員工到職日 (YYYY-MM-DD)
 * @param currentDate 比對基準日，預設為今日
 */
export function calculateAnniversaryLeavePeriods(onboardDateStr: string, currentDate: Date = new Date()): LeavePeriod[] {
  const onboard = new Date(onboardDateStr);
  const periods: LeavePeriod[] = [];
  
  const getFormatDate = (d: Date) => d.toISOString().substring(0, 10);

  // 1. 滿半年 (6個月) 享 3 天，使用期限至滿一年前夕
  const halfYearStart = new Date(onboard);
  halfYearStart.setMonth(halfYearStart.getMonth() + 6);
  const halfYearEnd = new Date(onboard);
  halfYearEnd.setFullYear(halfYearEnd.getFullYear() + 1);
  halfYearEnd.setDate(halfYearEnd.getDate() - 1);

  if (currentDate >= halfYearStart) {
    periods.push({
      startDate: getFormatDate(halfYearStart),
      endDate: getFormatDate(halfYearEnd),
      entitledDays: 3
    });
  }

  // 2. 滿一年以上各週年額度
  let yearsOfService = 1;
  while (true) {
    const periodStart = new Date(onboard);
    periodStart.setFullYear(periodStart.getFullYear() + yearsOfService);
    
    if (currentDate < periodStart) {
      break; // 尚未到達該年資，停止發放
    }

    const periodEnd = new Date(onboard);
    periodEnd.setFullYear(periodEnd.getFullYear() + yearsOfService + 1);
    periodEnd.setDate(periodEnd.getDate() - 1);

    // 依年資查表計算特休天數
    let days = 0;
    if (yearsOfService === 1) days = 7;
    else if (yearsOfService === 2) days = 10;
    else if (yearsOfService >= 3 && yearsOfService < 5) days = 14;
    else if (yearsOfService >= 5 && yearsOfService < 10) days = 15;
    else {
      // 10年以上，每滿一年加1天，上限30天
      days = Math.min(15 + (yearsOfService - 10 + 1), 30);
    }

    periods.push({
      startDate: getFormatDate(periodStart),
      endDate: getFormatDate(periodEnd),
      entitledDays: days
    });

    yearsOfService++;
  }

  return periods;
}

/**
 * 大魔王 C：跨夜班打卡智能工作日匹配
 * 根據員工排班，判定打卡點應歸屬哪一個工作日 (workDate) 以進行工時匹配。
 * @param employeeId 員工 UID
 * @param clockTime 此次打卡時間
 * @param isClockIn true為上班打卡，false為下班打卡
 * @param activeSchedules 員工最近的排班紀錄列表（包含 workDate, startTime 22:00, endTime 06:00 等）
 * @param toleranceHours 匹配容許小時差，預設為 4 小時
 */
export function assignClockToWorkDate(
  clockTime: Date,
  isClockIn: boolean,
  activeSchedules: Array<{ id: string; workDate?: string; date?: string; startTime?: string; endTime?: string; shift?: string }>,
  toleranceHours: number = 4
) {
  let matchedSchedule = null;
  let minDiff = Infinity;
  let matchedWorkDate = '';

  for (const sched of activeSchedules) {
    const workDate = sched.workDate || sched.date || '';
    if (!workDate) continue;

    let startTime = sched.startTime || '';
    let endTime = sched.endTime || '';

    if (!startTime || !endTime) {
      const timeMatch = (sched.shift || '').match(/\((\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})\)/);
      if (timeMatch) {
        startTime = timeMatch[1];
        endTime = timeMatch[2];
      }
    }

    if (!startTime || !endTime) continue;

    const [startH, startM] = startTime.split(':').map(Number);
    const [endH, endM] = endTime.split(':').map(Number);
    
    const schedYear = Number(workDate.substring(0, 4));
    const schedMonth = Number(workDate.substring(5, 7));
    const schedDay = Number(workDate.substring(8, 10));

    // 預計上班打卡時間
    const expectedIn = new Date(schedYear, schedMonth - 1, schedDay, startH, startM);
    
    // 預計下班打卡時間 (若下班小時小於上班小時，代表跨日)
    const expectedOut = new Date(schedYear, schedMonth - 1, schedDay, endH, endM);
    if (expectedOut < expectedIn) {
      expectedOut.setDate(expectedOut.getDate() + 1); // 跨日加一天
    }

    const expectedTarget = isClockIn ? expectedIn : expectedOut;
    const diff = Math.abs(clockTime.getTime() - expectedTarget.getTime());

    if (diff < minDiff) {
      minDiff = diff;
      matchedSchedule = sched;
      matchedWorkDate = workDate;
    }
  }

  // 如果最接近的預計時間在容許誤差內，則關聯至該班表
  if (matchedSchedule && minDiff < toleranceHours * 60 * 60 * 1000) {
    return {
      workDate: matchedWorkDate,
      scheduleId: matchedSchedule.id
    };
  }

  // 若查無排班，直接以打卡所在的日曆天作為預設工作日
  const localDateStr = clockTime.toLocaleDateString('sv');
  return {
    workDate: localDateStr,
    scheduleId: null
  };
}

/**
 * 加班費率計算機 (符合台灣勞基法第24條規定)
 * @param hourlyRate 員工平日每小時工資額
 * @param hours 加班時數
 * @param dayType 屬性: 'regular' 平日 | 'rest' 休息日 | 'holiday' 例假日/國定假日
 */
export function calculateOvertimePay(hourlyRate: number, hours: number, dayType: 'regular' | 'rest' | 'holiday') {
  let pay = 0;
  
  if (dayType === 'regular') {
    // 平日加班費：前 2 小時按平日每小時工資額加給 1/3 以上 (1.34)；後 2 小時按平日每小時工資額加給 2/3 以上 (1.67)
    const tier1 = Math.min(hours, 2);
    const tier2 = Math.max(hours - 2, 0);
    pay = Math.round(tier1 * hourlyRate * 1.34 + tier2 * hourlyRate * 1.67);
  } else if (dayType === 'rest') {
    // 休息日加班費：前 2 小時按平日每小時工資額加給 1 又 1/3 以上 (1.34)；第 3 至 8 小時加給 1 又 2/3 以上 (1.67)；第 9 小時起加給 2 又 2/3 以上 (2.67)
    const tier1 = Math.min(hours, 2);
    const tier2 = Math.min(Math.max(hours - 2, 0), 6);
    const tier3 = Math.max(hours - 8, 0);
    pay = Math.round(tier1 * hourlyRate * 1.34 + tier2 * hourlyRate * 1.67 + tier3 * hourlyRate * 2.67);
  } else if (dayType === 'holiday') {
    // 例假日/國定假日：8 小時以內一律加倍給一日工資 (即 8 * hourlyRate)，超過 8 小時則前 2 小時給 1.34，後 2 小時給 1.67
    if (hours <= 0) return 0;
    
    if (hours <= 8) {
      pay = Math.round(8 * hourlyRate); // 即使只加班1小時，國定假日出勤也要給足一日薪水
    } else {
      const overtimeHours = hours - 8;
      const tier1 = Math.min(overtimeHours, 2);
      const tier2 = Math.max(overtimeHours - 2, 0);
      pay = Math.round((8 * hourlyRate) + (tier1 * hourlyRate * 1.34) + (tier2 * hourlyRate * 1.67));
    }
  }

  return pay;
}

/**
 * 判斷是否為休假/休息班別（不需打卡紀錄）
 */
export function isOffShift(shiftName: string): boolean {
  const name = shiftName || '';
  if (name === '例假' || name === '休假' || name === '國定假日' || name === '排休' || name === '公休') return true;
  return (name.includes('休') || name.includes('例') || name.includes('假')) && !name.includes('班');
}
