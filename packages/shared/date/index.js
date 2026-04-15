export function pad2(value) {
    return String(value).padStart(2, '0');
}
export function toDateKey(date) {
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}
export function getDaysInMonth(year, month) {
    return new Date(year, month + 1, 0).getDate();
}
export function getMonthRange(year, month) {
    return {
        from: `${year}-${pad2(month + 1)}-01`,
        to: `${year}-${pad2(month + 1)}-${pad2(getDaysInMonth(year, month))}`,
    };
}
export function getPreviousMonth(year, month) {
    if (month === 0) {
        return { year: year - 1, month: 11 };
    }
    return { year, month: month - 1 };
}
export function getWeekStart(date) {
    const value = new Date(date);
    const day = value.getDay();
    value.setDate(value.getDate() - (day === 0 ? 6 : day - 1));
    value.setHours(0, 0, 0, 0);
    return value;
}
