/**
 * 判斷是否為台灣國定假日
 * @param dateStr 格式 YYYY-MM-DD
 */
export function getTaiwanHoliday(dateStr: string): string | null {
  const holidayMap: { [date: string]: string } = {
    // 2025 年主要放假日
    '2025-01-01': '元旦',
    '2025-01-26': '小年夜',
    '2025-01-27': '除夕',
    '2025-01-28': '春節初一',
    '2025-01-29': '春節初二',
    '2025-01-30': '春節初三',
    '2025-02-28': '和平紀念日',
    '2025-04-03': '兒童節',
    '2025-04-04': '清明節',
    '2025-05-01': '勞動節',
    '2025-05-31': '端午節',
    '2025-09-28': '教師節',
    '2025-10-06': '中秋節',
    '2025-10-10': '國慶日',
    '2025-10-25': '臺灣光復節',
    '2025-12-25': '行憲紀念日',

    // 2026 年主要放假日
    '2026-01-01': '元旦',
    '2026-02-15': '小年夜',
    '2026-02-16': '除夕',
    '2026-02-17': '春節初一',
    '2026-02-18': '春節初二',
    '2026-02-19': '春節初三',
    '2026-02-28': '和平紀念日',
    '2026-04-03': '兒童節',
    '2026-04-04': '清明節',
    '2026-05-01': '勞動節',
    '2026-06-19': '端午節',
    '2026-09-25': '中秋節',
    '2026-09-28': '教師節',
    '2026-10-10': '國慶日',
    '2026-10-25': '臺灣光復節',
    '2026-12-25': '行憲紀念日',
  };

  if (holidayMap[dateStr]) {
    return holidayMap[dateStr];
  }

  // 備用匹配：固定節日 (MM-DD)
  const md = dateStr.substring(5); // 取得 MM-DD
  if (md === '01-01') return '元旦';
  if (md === '02-28') return '和平紀念日';
  if (md === '05-01') return '勞動節';
  if (md === '09-28') return '教師節';
  if (md === '10-10') return '國慶日';
  if (md === '10-25') return '臺灣光復節';
  if (md === '12-25') return '行憲紀念日';

  return null;
}

/**
 * 判斷該日期是否為雙薪或加倍給薪之日期類型
 * @param dateStr 格式 YYYY-MM-DD
 */
export function getDoublePayType(dateStr: string): 'holiday' | 'rest' | 'regular_off' | null {
  const holiday = getTaiwanHoliday(dateStr);
  if (holiday) {
    return 'holiday'; // 國定假日雙薪
  }

  const d = new Date(dateStr);
  const dayOfWeek = d.getDay(); // 0 is Sunday, 6 is Saturday
  if (dayOfWeek === 6) {
    return 'rest'; // 週六休息日（加班費加成）
  }
  if (dayOfWeek === 0) {
    return 'regular_off'; // 週日例假日（原則上不排班，若排班則雙薪且補休）
  }

  return null;
}
