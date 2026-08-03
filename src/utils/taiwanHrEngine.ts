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
  laborRate: 0.125, // 2025/2026年最新法定費率 (普通事故 11.5% + 就業保險 1.0%)
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

  // 勞保自付與雇主負擔計算：拆分普通事故（11.5%）與就業保險（1.0%）各自計算並四捨五入後再相加
  // 假設就業保險費率固定為 1% (0.01)，其餘為普通事故費率
  const employInsRate = 0.01;
  const ordinaryRate = Math.max(0, rates.laborRate - employInsRate);

  // 普通事故保險費
  const ordinaryEmp = Math.round(salaryConfig.laborSub * ordinaryRate * rates.employeeLaborRatio * (laborDays / 30));
  const ordinaryEmpr = Math.round(salaryConfig.laborSub * ordinaryRate * rates.employerLaborRatio * (laborDays / 30));

  // 就業保險費
  const employEmp = Math.round(salaryConfig.laborSub * employInsRate * rates.employeeLaborRatio * (laborDays / 30));
  const employEmpr = Math.round(salaryConfig.laborSub * employInsRate * rates.employerLaborRatio * (laborDays / 30));

  // 合計自付與雇主負擔
  const employeeLabor = ordinaryEmp + employEmp;
  const employerLabor = ordinaryEmpr + employEmpr;

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

  // === 3. 勞工退休金 (雇主強提 6%，依勞退條例一律以 30 天為計算基準折算破月) ===
  const employerPension = Math.round(salaryConfig.pensionSub * 0.06 * (laborDays / 30));

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
  void isClockIn; // Satisfy TS compiler strict check
  let matchedSchedule = null;
  let minDiff = Infinity;
  let matchedWorkDate = '';

  for (const sched of activeSchedules) {
    const workDate = sched.workDate || sched.date || '';
    if (!workDate) continue;

    let startTime = sched.startTime || '';
    let endTime = sched.endTime || '';

    if (!startTime || !endTime) {
      const timeMatch = (sched.shift || '').match(/\((\d{1,2}:\d{2})\s*-\s*[^)]*?(\d{1,2}:\d{2})\)/);
      if (timeMatch) {
        startTime = timeMatch[1];
        endTime = timeMatch[2];
      }
    }

    if (!startTime || !endTime) continue;

    const startMins = parseTimeStrToMinutes(startTime);
    const endMins = parseTimeStrToMinutes(endTime);
    const startH = Math.floor(startMins / 60);
    const startM = startMins % 60;
    const endH = Math.floor(endMins / 60);
    const endM = endMins % 60;
    
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

    // 為了相容一天 4 次打卡（包括休息打卡），我們同時比對上班時間、下班時間以及中間的休息時間（以兩者中點估算）
    const midpoint = (expectedIn.getTime() + expectedOut.getTime()) / 2;
    const expectedTimes = [expectedIn.getTime(), expectedOut.getTime(), midpoint];

    let bestSchedDiff = Infinity;
    for (const t of expectedTimes) {
      const d = Math.abs(clockTime.getTime() - t);
      if (d < bestSchedDiff) {
        bestSchedDiff = d;
      }
    }

    if (bestSchedDiff < minDiff) {
      minDiff = bestSchedDiff;
      matchedSchedule = sched;
      matchedWorkDate = workDate;
    }
  }

  // 如果最接近的預計時間在容許誤差內，則關聯至該班表（因包含休息時間比對，容許值取 toleranceHours 與 6 小時的最大值）
  const maxTolerance = Math.max(toleranceHours * 60 * 60 * 1000, 6 * 60 * 60 * 1000);
  if (matchedSchedule && minDiff < maxTolerance) {
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

export function isOffShift(shiftName: string): boolean {
  if (!shiftName) return false;
  // Clean name by removing any time ranges or extra spaces
  const cleanName = shiftName.split('(')[0].trim();
  return cleanName === '例假' || cleanName === '休假' || cleanName === '國定假日' || cleanName === '排休' || cleanName === '公休';
}

/**
 * 羅布斯（Robust）時間字串解析器
 * 支援 24小時制 (e.g. "17:30")、中文12小時制 (e.g. "下午05:30", "上午09:00")、英文AM/PM (e.g. "05:30 PM")
 * 回傳當天起算的分鐘數
 */
export function parseTimeStrToMinutes(timeStr: string): number {
  if (!timeStr) return 0;
  const match = timeStr.match(/(\d{1,2})\s*:\s*(\d{2})/);
  if (!match) return 0;
  let h = Number(match[1]);
  const m = Number(match[2]);
  const lowerStr = timeStr.toLowerCase();
  if ((timeStr.includes('下午') || lowerStr.includes('pm')) && h < 12) h += 12;
  if ((timeStr.includes('上午') || lowerStr.includes('am')) && h === 12) h = 0;
  return h * 60 + m;
}

/**
 * 羅布斯（Robust）班表上下班時間與班別資訊提取器
 */
export function getShiftStartEndTimes(
  dateSched: any,
  shifts: any[]
): {
  startTimeStr: string;
  endTimeStr: string;
  shiftDef: any;
  expectsFour: boolean;
} {
  if (!dateSched || !dateSched.shift) {
    return { startTimeStr: '', endTimeStr: '', shiftDef: null, expectsFour: false };
  }

  const shiftRaw = dateSched.shift || '';
  const shiftName = shiftRaw.split('(')[0].trim();
  const shiftDef = (shifts || []).find((s: any) => s.name === shiftName || s.name === shiftRaw);

  let startTimeStr = dateSched.startTime || '';
  let endTimeStr = dateSched.endTime || '';

  if (!startTimeStr || !endTimeStr) {
    const timeMatch = shiftRaw.match(/\((\d{1,2}:\d{2})\s*-\s*[^)]*?(\d{1,2}:\d{2})\)/);
    if (timeMatch) {
      if (!startTimeStr) startTimeStr = timeMatch[1];
      if (!endTimeStr) endTimeStr = timeMatch[2];
    }
  }

  if (!startTimeStr || !endTimeStr) {
    if (shiftDef) {
      if (!startTimeStr) startTimeStr = shiftDef.startTime || '';
      if (!endTimeStr) endTimeStr = shiftDef.endTime || '';
    }
  }

  const expectsFour = shiftDef
    ? !!((shiftDef.breakStartTime && shiftDef.breakEndTime) || (shiftDef.breakDuration && shiftDef.breakDuration > 0))
    : false;

  return { startTimeStr, endTimeStr, shiftDef, expectsFour };
}

/**
 * 依據排班與當天所有打卡紀錄，動態判斷第一筆上班是否遲到，以及最後一筆下班是否早退
 */
export function evaluatePunchesStatus(
  dayAtts: any[],
  startTimeStr: string,
  endTimeStr: string,
  expectsFour?: boolean,
  breakDuration?: number,
  toleranceMinutes: number = 5
) {
  let isLate = false;
  let isEarly = false;

  if (!startTimeStr || !endTimeStr) {
    return { isLate, isEarly };
  }

  const inRecs = dayAtts.filter(r => r.type === '上班').sort((a, b) => parseTimeStrToMinutes(a.time || '') - parseTimeStrToMinutes(b.time || ''));
  const outRecs = dayAtts.filter(r => r.type === '下班').sort((a, b) => parseTimeStrToMinutes(a.time || '') - parseTimeStrToMinutes(b.time || ''));

  const tol = typeof toleranceMinutes === 'number' ? Math.max(0, toleranceMinutes) : 5;

  // 遲到判定：只以第一筆上班打卡為準
  const firstIn = inRecs[0];
  if (firstIn) {
    if (firstIn.status === '遲到') {
      isLate = true;
    } else if (firstIn.status === '正常') {
      isLate = false;
    } else {
      const expectedInMins = parseTimeStrToMinutes(startTimeStr);
      const actualInMins = parseTimeStrToMinutes(firstIn.time || '');
      if (actualInMins > (expectedInMins + tol)) {
        isLate = true;
      }
    }
  }

  // 彈性休息時間遲到判定：若為預期四次打卡的班別
  if (expectsFour && inRecs.length >= 2 && outRecs.length >= 1) {
    const firstOut = outRecs[0];
    const secondIn = inRecs[1];
    if (firstOut && secondIn && firstOut.time && secondIn.time) {
      if (secondIn.status === '遲到') {
        isLate = true;
      } else if (secondIn.status !== '正常') {
        const startMin = parseTimeStrToMinutes(firstOut.time);
        const endMin = parseTimeStrToMinutes(secondIn.time);
        let diff = endMin - startMin;
        if (diff < 0) diff += 24 * 60; // 跨夜
        const maxBreakMin = breakDuration && breakDuration > 0 ? breakDuration : 60;
        if (diff > maxBreakMin + tol) {
          isLate = true;
        }
      }
    }
  }

  // 早退判定：只以下班打卡的最後一筆為準（避免中間休息打卡被計入早退）
  const lastOut = outRecs[outRecs.length - 1];
  if (lastOut) {
    if (expectsFour && outRecs.length < 2) {
      // 僅第一字下班，屬休息開始，不判早退
      isEarly = false;
    } else if (lastOut.status === '早退') {
      isEarly = true;
    } else if (lastOut.status === '正常') {
      isEarly = false;
    } else {
      const expectedInMins = parseTimeStrToMinutes(startTimeStr);
      let expectedOutMins = parseTimeStrToMinutes(endTimeStr);
      if (expectedOutMins < expectedInMins) expectedOutMins += 24 * 60; // 跨夜

      let actualOutMins = parseTimeStrToMinutes(lastOut.time || '');
      if (actualOutMins < expectedInMins) actualOutMins += 24 * 60; // 跨夜

      if (actualOutMins < expectedOutMins - 1) {
        isEarly = true;
      }
    }
  }

  return { isLate, isEarly };
}

/**
 * 薪資計算工時最小單位：半小時 (0.5 小時) 結算
 * 例：7.2 小時 -> 7.0 小時，7.7 小時 -> 7.5 小時，0.4 小時 -> 0 小時
 */
export function roundToHalfHour(hours: number): number {
  if (!hours || hours <= 0) return 0;
  return Math.floor(hours * 2) / 2;
}



/**
 * 每日打卡分析引擎（新版）
 * 
 * 根據班別定義解析出【每個打卡時間窗格】(上班1、下班1、上班2、下班2)，
 * 然後從當天所有打卡紀錄中，為每個窗格找出「最接近預期時間」的一筆打卡，
 * 最後判定每格的狀態（正常/遲到/早退/缺卡）並計算實際有效工時。
 *
 * 特性：
 * - 有固定休息起訖時間（breakStartTime/breakEndTime）→ 4槽位，兩段分別計算，休息自然排除
 * - 只有休息時長（breakDuration）→ 2槽位，計算完工時後扣除休息時長
 * - 不會將同一窗格附近的多次重複打卡重複計算，只取最接近的一筆
 * - 缺卡的時段視為無法計算，不產生任何工時
 */
export interface PunchSlot {
  label: string;           // '上班', '下班', '休息開始', '休息結束'
  type: '上班' | '下班';
  expectedMins: number;    // 預期時間（分鐘）
  matchedTime: string;     // 匹配到的打卡時間（HH:MM），缺卡為 ''
  matchedMins: number;     // 匹配到的分鐘數，缺卡為 -1
  status: '正常' | '遲到' | '早退' | '缺卡';
  isMissing: boolean;
}

export interface DayPunchAnalysis {
  slots: PunchSlot[];
  effectiveHours: number;    // 已扣休息的有效工時（半小時單位）
  hasMissingPunch: boolean;  // 是否有缺卡
  isLate: boolean;
  isEarly: boolean;
  periodHours: [number, number][];  // 每段實際上班時間 [inMins, outMins]
}

export function analyzeDayPunches(
  dayAtts: any[],
  dateSched: any,
  shifts: any[],
  toleranceMins: number = 5
): DayPunchAnalysis {
  const { startTimeStr, endTimeStr, shiftDef, expectsFour } = getShiftStartEndTimes(dateSched, shifts);
  
  const noResult: DayPunchAnalysis = {
    slots: [],
    effectiveHours: 0,
    hasMissingPunch: false,
    isLate: false,
    isEarly: false,
    periodHours: []
  };

  if (!startTimeStr || !endTimeStr) return noResult;

  const baseStart = parseTimeStrToMinutes(startTimeStr);
  let baseEnd = parseTimeStrToMinutes(endTimeStr);
  if (baseEnd < baseStart) baseEnd += 24 * 60;

  // 建立預期的打卡窗格
  const expectedSlots: { label: string; type: '上班' | '下班'; expectedMins: number }[] = [];
  // 是否使用固定休息時間4槽位模式
  const useFixedBreak = expectsFour && !!(shiftDef?.breakStartTime && shiftDef?.breakEndTime);

  // 判斷實際打卡是否呈現 上/下/上/下 的四次模式（breakDuration 班別也可能打四次卡）
  const sortedAttsForDetect = [...dayAtts]
    .filter(r => r.time)
    .sort((a, b) => parseTimeStrToMinutes(a.time) - parseTimeStrToMinutes(b.time));
  const inSeq = sortedAttsForDetect.map(r => r.type);
  const isActualFourPunch =
    inSeq.length >= 4 &&
    inSeq[0] === '上班' && inSeq[1] === '下班' && inSeq[2] === '上班' && inSeq[3] === '下班';

  // 四次打卡但只有 breakDuration（無固定休息起訖）：
  // 根據實際第一次下班/第二次上班時間推算出休息窗格
  const useDurationFourPunch = expectsFour && !useFixedBreak && isActualFourPunch;

  if (useFixedBreak) {
    // 四次打卡（固定休息起訖）：上班 → 休息開始 → 休息結束 → 下班
    // 休息時間自然被排除（兩段分開計算）
    let breakStart = parseTimeStrToMinutes(shiftDef!.breakStartTime);
    let breakEnd = parseTimeStrToMinutes(shiftDef!.breakEndTime);
    if (breakStart < baseStart) breakStart += 24 * 60;
    if (breakEnd < baseStart) breakEnd += 24 * 60;
    expectedSlots.push({ label: '上班', type: '上班', expectedMins: baseStart });
    expectedSlots.push({ label: '休息開始', type: '下班', expectedMins: breakStart });
    expectedSlots.push({ label: '休息結束', type: '上班', expectedMins: breakEnd });
    expectedSlots.push({ label: '下班', type: '下班', expectedMins: baseEnd });
  } else if (useDurationFourPunch) {
    // 四次打卡（breakDuration 班別，但實際打了4次）：
    // 用實際第一次下班 / 第二次上班的時間作為預期休息窗格
    const actualBreakStart = parseTimeStrToMinutes(sortedAttsForDetect[1].time);
    const actualBreakEnd   = parseTimeStrToMinutes(sortedAttsForDetect[2].time);
    expectedSlots.push({ label: '上班',    type: '上班', expectedMins: baseStart });
    expectedSlots.push({ label: '休息開始', type: '下班', expectedMins: actualBreakStart });
    expectedSlots.push({ label: '休息結束', type: '上班', expectedMins: actualBreakEnd });
    expectedSlots.push({ label: '下班',    type: '下班', expectedMins: baseEnd });
  } else {
    // 兩次打卡（普通班或只有休息時長）：上班 → 下班
    // 若有 breakDuration，計算完工時後再扣除（見下方）
    expectedSlots.push({ label: '上班', type: '上班', expectedMins: baseStart });
    expectedSlots.push({ label: '下班', type: '下班', expectedMins: baseEnd });
  }

  // 依打卡時間排序
  const sortedAtts = [...dayAtts]
    .filter(r => r.time)
    .sort((a, b) => parseTimeStrToMinutes(a.time) - parseTimeStrToMinutes(b.time));

  // 為每個窗格找最接近且尚未被使用的打卡紀錄
  const usedIds = new Set<string>();

  const slots: PunchSlot[] = expectedSlots.map(slot => {
    const candidatesOfType = sortedAtts.filter(r =>
      r.type === slot.type && !usedIds.has(r.id || r.timestamp + r.time)
    );
    
    if (candidatesOfType.length === 0) {
      return {
        ...slot,
        matchedTime: '',
        matchedMins: -1,
        status: '缺卡' as const,
        isMissing: true
      };
    }

    // 找與預期時間最近的一筆
    let bestMatch = candidatesOfType[0];
    let bestDiff = Infinity;
    for (const rec of candidatesOfType) {
      let recMins = parseTimeStrToMinutes(rec.time);
      // 處理跨夜：若預期在24:00後，調整紀錄時間
      if (slot.expectedMins >= 24 * 60 && recMins < 12 * 60) recMins += 24 * 60;
      const diff = Math.abs(recMins - slot.expectedMins);
      if (diff < bestDiff) {
        bestDiff = diff;
        bestMatch = rec;
      }
    }

    const matchId = bestMatch.id || bestMatch.timestamp + bestMatch.time;
    usedIds.add(matchId);

    let matchedMins = parseTimeStrToMinutes(bestMatch.time);
    if (slot.expectedMins >= 24 * 60 && matchedMins < 12 * 60) matchedMins += 24 * 60;

    // 狀態判定
    let status: PunchSlot['status'] = '正常';
    if (bestMatch.status === '遲到') {
      status = '遲到';
    } else if (bestMatch.status === '早退') {
      status = '早退';
    } else if (slot.type === '上班') {
      if (matchedMins > slot.expectedMins + toleranceMins) status = '遲到';
    } else {
      if (matchedMins < slot.expectedMins - 1) status = '早退';
    }

    return {
      ...slot,
      matchedTime: bestMatch.time,
      matchedMins,
      status,
      isMissing: false
    };
  });

  // ─── 計算有效工時 ───────────────────────────────────────────
  const periodHours: [number, number][] = [];
  let effectiveHours = 0;
  let hasMissingPunch = false;
  let isLate = false;
  let isEarly = false;

  if (useFixedBreak || useDurationFourPunch) {
    // 4槽位模式：先嘗試計算兩段
    const slot0 = slots[0]; // 上班
    const slot1 = slots[1]; // 休息開始（下班）
    const slot2 = slots[2]; // 休息結束（上班）
    const slot3 = slots[3]; // 下班

    const firstMissing = slot0?.isMissing;
    const lastMissing  = slot3?.isMissing;
    const midMissing   = slot1?.isMissing || slot2?.isMissing;

    if (firstMissing || lastMissing) {
      // 第一次上班或最後一次下班缺卡 → 真正缺卡，無法計算
      hasMissingPunch = true;
    } else if (midMissing) {
      // 中間休息打卡缺卡（只打了3次）→ 降回2槽位模式：用第一次上班 + 最後一次下班計算
      // 並自動扣除班表規定的休息時間
      const inMins  = slot0!.matchedMins;
      let outMins   = slot3!.matchedMins;
      if (outMins < inMins) outMins += 24 * 60;
      let rawHours = Math.max(0, (outMins - inMins) / 60);

      // 扣除休息時間（優先用固定起訖，否則用 breakDuration）
      if (shiftDef?.breakStartTime && shiftDef?.breakEndTime) {
        let bStart = parseTimeStrToMinutes(shiftDef!.breakStartTime);
        let bEnd   = parseTimeStrToMinutes(shiftDef!.breakEndTime);
        if (bEnd < bStart) bEnd += 24 * 60;
        const overlapStart = Math.max(inMins, bStart);
        const overlapEnd   = Math.min(outMins, bEnd);
        rawHours = Math.max(0, rawHours - Math.max(0, (overlapEnd - overlapStart) / 60));
      } else if (shiftDef?.breakDuration && shiftDef.breakDuration > 0) {
        rawHours = Math.max(0, rawHours - shiftDef.breakDuration / 60);
      }

      effectiveHours = rawHours;
      periodHours.push([inMins, outMins]);
      hasMissingPunch = true; // 標記有缺卡（顯示用），但工時已計算
    } else {
      // 四次全齊 → 兩段分別計算，休息自然排除（不論 fixedBreak 或 durationFour 都如此）
      for (let i = 0; i < slots.length; i += 2) {
        const inSlot  = slots[i];
        const outSlot = slots[i + 1];
        if (!inSlot || !outSlot || inSlot.isMissing || outSlot.isMissing) continue;
        let inMins  = inSlot.matchedMins;
        let outMins = outSlot.matchedMins;
        if (outMins < inMins) outMins += 24 * 60;
        effectiveHours += Math.max(0, (outMins - inMins) / 60);
        periodHours.push([inMins, outMins]);
      }
    }

    // 遲到/早退判定
    if (slot0 && !slot0.isMissing && slot0.status === '遲到') isLate = true;
    if (slot3 && !slot3.isMissing && slot3.status === '早退') isEarly = true;

  } else {
    // 2槽位模式
    for (let i = 0; i < slots.length; i += 2) {
      const inSlot  = slots[i];
      const outSlot = slots[i + 1];
      if (!inSlot || !outSlot) continue;
      if (inSlot.isMissing || outSlot.isMissing) {
        hasMissingPunch = true;
        continue;
      }
      let inMins  = inSlot.matchedMins;
      let outMins = outSlot.matchedMins;
      if (outMins < inMins) outMins += 24 * 60;
      effectiveHours += Math.max(0, (outMins - inMins) / 60);
      periodHours.push([inMins, outMins]);
      if (inSlot.status  === '遲到') isLate = true;
      if (outSlot.status === '早退') isEarly = true;
    }

    // 第一次上班遲到 / 最後一次下班早退
    if (slots.length > 0 && slots[0].status === '遲到') isLate = true;
    if (slots.length > 0 && slots[slots.length - 1].status === '早退') isEarly = true;

    // 扣除休息時間
    if (!hasMissingPunch && effectiveHours > 0 && shiftDef) {
      if (shiftDef.breakStartTime && shiftDef.breakEndTime) {
        let bStart = parseTimeStrToMinutes(shiftDef.breakStartTime);
        let bEnd   = parseTimeStrToMinutes(shiftDef.breakEndTime);
        if (bEnd < bStart) bEnd += 24 * 60;
        if (periodHours.length > 0) {
          const [workIn, workOut] = periodHours[0];
          if (bStart < workIn && bStart + 24 * 60 >= workIn && bStart + 24 * 60 <= workOut) {
            bStart += 24 * 60; bEnd += 24 * 60;
          }
          const overlapHours = Math.max(0, (Math.min(workOut, bEnd) - Math.max(workIn, bStart)) / 60);
          effectiveHours = Math.max(0, effectiveHours - overlapHours);
        }
      } else if (shiftDef.breakDuration > 0) {
        effectiveHours = Math.max(0, effectiveHours - shiftDef.breakDuration / 60);
      }
    }
  }

  effectiveHours = roundToHalfHour(effectiveHours);

  return { slots, effectiveHours, hasMissingPunch, isLate, isEarly, periodHours };
}

export function getMonthlyExpectedHours(
  year: number,
  month: number,
  holidays: any[] = []
): { workingDays: number; expectedHours: number } {
  const daysInMonth = new Date(year, month, 0).getDate();
  let workingDays = 0;

  const holidayDateSet = new Set(
    (holidays || []).map(h => h.movedDate || h.date).filter(Boolean)
  );

  for (let day = 1; day <= daysInMonth; day++) {
    const monthStr = String(month).padStart(2, '0');
    const dayStr = String(day).padStart(2, '0');
    const dateStr = `${year}-${monthStr}-${dayStr}`;

    const dateObj = new Date(year, month - 1, day);
    const dayOfWeek = dateObj.getDay();

    // 0 = 週日, 6 = 週六
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const isNationalHoliday = holidayDateSet.has(dateStr);

    if (!isWeekend && !isNationalHoliday) {
      workingDays++;
    }
  }

  return {
    workingDays,
    expectedHours: workingDays * 8
  };
}

/**
 * 颱風假受影響排班時數計算 helper
 */
export function calculateTyphoonLeaveHours(
  startTimeStr: string,
  endTimeStr: string,
  mode: 'full_day' | 'partial',
  typhoonStartStr?: string,
  breakDuration: number = 60
): number {
  if (!startTimeStr || !endTimeStr) return 0;

  const startMins = parseTimeStrToMinutes(startTimeStr);
  let endMins = parseTimeStrToMinutes(endTimeStr);
  if (endMins < startMins) endMins += 24 * 60;

  const totalShiftMins = Math.max(0, endMins - startMins - breakDuration);

  if (mode === 'full_day') {
    return Math.max(0, totalShiftMins / 60);
  }

  if (!typhoonStartStr) return 0;
  let typhoonStartMins = parseTimeStrToMinutes(typhoonStartStr);
  if (typhoonStartMins < startMins) typhoonStartMins = startMins;

  if (typhoonStartMins >= endMins) return 0;

  const affectedMins = Math.max(0, endMins - typhoonStartMins);
  return Math.min(totalShiftMins / 60, Math.max(0, affectedMins / 60));
}

export interface SpecialLeavePeriod {
  name: string;
  startDate: string;
  endDate: string;
  lookbackStart: string;
  lookbackEnd: string;
  entitledHours: number;
  usedHours: number;
  remainingHours: number;
  isExpired: boolean;
  isActive: boolean;
}

/**
 * 依週年制與薪資類型（月薪/時薪工讀）動態計算特休區間額度、使用時數與到期狀態
 */
export function calculateSpecialLeavePeriods(
  onboardDateStr: string,
  currentDate: Date,
  salaryType: 'monthly' | 'hourly',
  getWorkedHours: (start: string, end: string) => number,
  approvedAnnualLeaves: Array<{ startDate: string; endDate: string; hours: number }>
): SpecialLeavePeriod[] {
  if (!onboardDateStr) return [];
  const onboard = new Date(onboardDateStr);
  const periods: SpecialLeavePeriod[] = [];
  
  const formatDateStr = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dateVal = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dateVal}`;
  };
  
  const addDays = (d: Date, days: number) => {
    const res = new Date(d);
    res.setDate(res.getDate() + days);
    return res;
  };

  const halfYearStart = new Date(onboard);
  halfYearStart.setMonth(halfYearStart.getMonth() + 6);
  const oneYearStart = new Date(onboard);
  oneYearStart.setFullYear(oneYearStart.getFullYear() + 1);
  const halfYearEnd = addDays(oneYearStart, -1);

  const addPeriod = (
    name: string,
    pStart: Date,
    pEnd: Date,
    lStart: Date,
    lEnd: Date,
    fullTimeDays: number,
    fullTimeNormalHours: number
  ) => {
    // 只有當前時間大於或等於追溯起日（亦即進入該階段）時才計算，但特休在 pStart 起才可動用
    // 若該特休期間是在當月開始產生，即使當前日期尚未到達 pStart，也進行計算以便通知與顯示
    const isSameMonthAndYear = pStart.getFullYear() === currentDate.getFullYear() && pStart.getMonth() === currentDate.getMonth();
    if (currentDate < pStart && !isSameMonthAndYear) return;

    let entitledHours = fullTimeDays * 8;
    if (salaryType === 'hourly') {
      const workedHours = getWorkedHours(formatDateStr(lStart), formatDateStr(lEnd));
      entitledHours = (workedHours / fullTimeNormalHours) * (fullTimeDays * 8);
      entitledHours = Math.round(entitledHours * 10) / 10;
    }

    const pStartStr = formatDateStr(pStart);
    const pEndStr = formatDateStr(pEnd);

    // 計算此特休區間內已被核准使用的特休時數
    let usedHours = 0;
    approvedAnnualLeaves.forEach(lv => {
      if (!lv.startDate || !lv.endDate) return;
      const start = new Date(lv.startDate);
      const end = new Date(lv.endDate);
      const diffDays = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      const hoursPerDay = (lv.hours || 0) / diffDays;
      for (let d = 0; d < diffDays; d++) {
        const curr = new Date(start);
        curr.setDate(start.getDate() + d);
        const dayStr = formatDateStr(curr);
        if (dayStr >= pStartStr && dayStr <= pEndStr) {
          usedHours += hoursPerDay;
        }
      }
    });
    usedHours = Math.round(usedHours * 10) / 10;

    const remainingHours = Math.max(0, entitledHours - usedHours);
    const currentDateStr = formatDateStr(currentDate);
    const isExpired = currentDateStr > pEndStr;
    const isActive = currentDateStr >= pStartStr && currentDateStr <= pEndStr;

    periods.push({
      name,
      startDate: pStartStr,
      endDate: pEndStr,
      lookbackStart: formatDateStr(lStart),
      lookbackEnd: formatDateStr(lEnd),
      entitledHours,
      usedHours,
      remainingHours: isExpired ? 0 : remainingHours,
      isExpired,
      isActive
    });
  };

  // 1. 滿半年特休 (3天/1040小時全職基準)
  addPeriod(
    '滿半年',
    halfYearStart,
    halfYearEnd,
    onboard,
    halfYearStart,
    3,
    1040
  );

  // 2. 滿一年以上各週年額度
  let yearsOfService = 1;
  while (true) {
    const pStart = new Date(onboard);
    pStart.setFullYear(pStart.getFullYear() + yearsOfService);
    
    const isSameMonthAndYear = pStart.getFullYear() === currentDate.getFullYear() && pStart.getMonth() === currentDate.getMonth();
    if (currentDate < pStart && !isSameMonthAndYear) {
      break;
    }

    const pEndLimit = new Date(onboard);
    pEndLimit.setFullYear(pEndLimit.getFullYear() + yearsOfService + 1);
    const pEnd = addDays(pEndLimit, -1);

    const lStart = new Date(onboard);
    lStart.setFullYear(lStart.getFullYear() + yearsOfService - 1);
    const lEnd = pStart;

    let days = 0;
    if (yearsOfService === 1) days = 7;
    else if (yearsOfService === 2) days = 10;
    else if (yearsOfService >= 3 && yearsOfService < 5) days = 14;
    else if (yearsOfService >= 5 && yearsOfService < 10) days = 15;
    else {
      days = Math.min(30, 15 + (yearsOfService - 10 + 1));
    }

    addPeriod(
      `滿${yearsOfService}年`,
      pStart,
      pEnd,
      lStart,
      lEnd,
      days,
      2080
    );

    yearsOfService++;
  }

  return periods;
}

/**
 * 依據核准的「班別調整（shift_adj）」假單，動態增延預期上班時間或縮減預期下班時間
 */
export function getAdjustedShiftTimes(
  startTimeStr: string,
  endTimeStr: string,
  dayLeaves: any[]
) {
  let adjustedStart = startTimeStr;
  let adjustedEnd = endTimeStr;

  if (!startTimeStr || !endTimeStr) {
    return { adjustedStart, adjustedEnd };
  }

  // 篩選當天已核准的請假單 (所有假別皆適用，只要有設定起訖時間且狀態為已核准)
  const activeLeaves = (dayLeaves || []).filter(
    l => l.status === 'approved' && l.startTime && l.endTime
  );

  if (activeLeaves.length === 0) {
    return { adjustedStart, adjustedEnd };
  }

  let startMins = parseTimeStrToMinutes(startTimeStr);
  let endMins = parseTimeStrToMinutes(endTimeStr);
  if (endMins < startMins) endMins += 24 * 60; // 跨夜

  for (const lv of activeLeaves) {
    let lvStartMins = parseTimeStrToMinutes(lv.startTime);
    let lvEndMins = parseTimeStrToMinutes(lv.endTime);
    if (lvEndMins < lvStartMins) lvEndMins += 24 * 60; // 跨夜

    // 情況一：請假區間包含班表的最尾段（如原班表 12-20，請假 19-20）
    if (lvStartMins < endMins && lvEndMins >= endMins) {
      endMins = Math.min(endMins, lvStartMins);
    }
    // 情況二：請假區間包含班表的最首段（如原班表 12-20，請假 12-13）
    if (lvStartMins <= startMins && lvEndMins > startMins) {
      startMins = Math.max(startMins, lvEndMins);
    }
  }

  const minsToTimeStr = (totalMins: number) => {
    const hrs = Math.floor(totalMins / 60) % 24;
    const mins = totalMins % 60;
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
  };

  adjustedStart = minsToTimeStr(startMins);
  adjustedEnd = minsToTimeStr(endMins);

  return { adjustedStart, adjustedEnd };
}

export interface SalaryTypeHistoryItem {
  effectiveDate: string; // YYYY-MM-DD
  salaryType: 'monthly' | 'hourly';
  monthlySalary: number; // hourly rate if hourly, monthly salary if monthly
  laborSub?: number;
  nhiSub?: number;
  pensionSub?: number;
  role?: string;
  attendanceBonus?: number;
  otherAllowance?: number;
  roleAllowance?: number;
  evaluationAllowance?: number;
  note?: string;
}

/**
 * 取得指定月份/日期員工生效的薪資結構與型態 (歷史薪資隔離機制)
 */
export function getEffectiveSalaryConfig(
  emp: any,
  targetYearMonth: string, // YYYY-MM
  targetDate?: string // YYYY-MM-DD
): {
  salaryType: 'monthly' | 'hourly';
  monthlySalary: number;
  laborSub: number;
  nhiSub: number;
  pensionSub: number;
  attendanceBonus: number;
  otherAllowance: number;
  roleAllowance: number;
  evaluationAllowance: number;
} {
  const currentSalaryType: 'monthly' | 'hourly' = emp.salaryType || 'monthly';
  const defaultMonthlySalary = emp.monthlySalary || 32000;
  const defaultLaborSub = emp.laborSub === 0 ? 0 : (emp.laborSub || (currentSalaryType === 'hourly' ? 11100 : 29500));
  const defaultNhiSub = emp.nhiSub === 0 ? 0 : (emp.nhiSub || 29500);
  const defaultPensionSub = emp.pensionSub === 0 ? 0 : (emp.pensionSub || (currentSalaryType === 'hourly' ? 11100 : 29500));

  // 檢查是否有 salaryTypeHistory
  const historyList: SalaryTypeHistoryItem[] = Array.isArray(emp.salaryTypeHistory) ? emp.salaryTypeHistory : [];
  const queryDate = targetDate || `${targetYearMonth}-31`;

  if (historyList.length > 0) {
    const sorted = [...historyList].sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate));
    const matched = sorted.filter(item => item.effectiveDate <= queryDate).pop();
    if (matched) {
      const salType = matched.salaryType || currentSalaryType;
      return {
        salaryType: salType,
        monthlySalary: matched.monthlySalary || defaultMonthlySalary,
        laborSub: matched.laborSub ?? defaultLaborSub,
        nhiSub: matched.nhiSub ?? defaultNhiSub,
        pensionSub: matched.pensionSub ?? defaultPensionSub,
        attendanceBonus: matched.attendanceBonus ?? (emp.attendanceBonus || 0),
        otherAllowance: matched.otherAllowance ?? (emp.otherAllowance || 0),
        roleAllowance: matched.roleAllowance ?? (emp.roleAllowance || 0),
        evaluationAllowance: matched.evaluationAllowance ?? (emp.evaluationAllowance || 0),
      };
    }
  }

  // 若無 historyList 但有 transitionDate (轉正職日期)
  if (emp.transitionDate) {
    const tMonth = emp.transitionDate.substring(0, 7);
    if (targetYearMonth < tMonth || (targetDate && targetDate < emp.transitionDate)) {
      const prevSalType = emp.previousSalaryType || 'hourly';
      const prevSal = emp.previousMonthlySalary || (prevSalType === 'hourly' ? 190 : defaultMonthlySalary);
      return {
        salaryType: prevSalType,
        monthlySalary: prevSal,
        laborSub: prevSalType === 'hourly' ? 11100 : defaultLaborSub,
        nhiSub: defaultNhiSub,
        pensionSub: prevSalType === 'hourly' ? 11100 : defaultPensionSub,
        attendanceBonus: 0,
        otherAllowance: 0,
        roleAllowance: 0,
        evaluationAllowance: 0
      };
    }
  }

  return {
    salaryType: currentSalaryType,
    monthlySalary: defaultMonthlySalary,
    laborSub: defaultLaborSub,
    nhiSub: defaultNhiSub,
    pensionSub: defaultPensionSub,
    attendanceBonus: emp.attendanceBonus || 0,
    otherAllowance: emp.otherAllowance || 0,
    roleAllowance: emp.roleAllowance || 0,
    evaluationAllowance: emp.evaluationAllowance || 0
  };
}



