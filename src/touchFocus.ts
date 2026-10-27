/** 有滑鼠的裝置（電腦）才自動把游標放進第一個欄位；手機自動對焦不會叫出鍵盤，反而造成問題 */
export const canAutoFocus = typeof window !== 'undefined' && window.matchMedia('(pointer: fine)').matches;

/**
 * 手機保險機制：點到一個「已經有游標但沒有鍵盤」的欄位時，先移開游標再放回去。
 * 這樣對焦是由使用者的點擊觸發，iOS（特別是加到主畫面的 APP）才會叫出鍵盤。
 */
export function installTouchFocusFix(): void {
  if (typeof window === 'undefined' || canAutoFocus) return;
  document.addEventListener(
    'touchend',
    (e) => {
      const el = e.target;
      if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return;
      if (el.readOnly || el.disabled) return;
      if (['checkbox', 'radio', 'button', 'submit', 'date', 'file', 'range', 'color'].includes(el.type)) return;
      if (document.activeElement === el) {
        el.blur();
        el.focus();
      }
    },
    { passive: true },
  );
}
