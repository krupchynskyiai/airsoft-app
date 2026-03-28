import React, { useEffect, useMemo } from "react";

export function useTelegram() {
  const tg = useMemo(() => window.Telegram?.WebApp, []);
  const isRealTelegram = !!tg?.initData;

  useEffect(() => {
    if (!tg) return;

    tg.ready();
    tg.expand();

    // Ці методи доступні тільки в реальному Telegram
    if (isRealTelegram) {
      try { tg.setHeaderColor("#1a1a2e"); } catch (e) {}
      try { tg.setBackgroundColor("#16213e"); } catch (e) {}
    }
  }, [tg, isRealTelegram]);

  return {
    tg,
    isRealTelegram,
    user: tg?.initDataUnsafe?.user || null,
    colorScheme: tg?.colorScheme || "dark",
    close: () => {
      if (isRealTelegram) tg?.close();
    },
    showAlert: (msg) => {
      if (isRealTelegram) {
        tg?.showAlert(msg);
      } else {
        window.alert(msg);
      }
    },
    /** Підтвердження (Telegram showConfirm або window.confirm у браузері). Повертає Promise<boolean>. */
    showConfirm: (msg) => {
      if (isRealTelegram && typeof tg?.showConfirm === "function") {
        return new Promise((resolve) => {
          try {
            tg.showConfirm(msg, (ok) => resolve(!!ok));
          } catch (e) {
            resolve(window.confirm(msg));
          }
        });
      }
      return Promise.resolve(window.confirm(msg));
    },
    haptic: (type = "impact") => {
      if (!isRealTelegram) return;
      try {
        if (type === "impact") tg?.HapticFeedback?.impactOccurred("medium");
        if (type === "success") tg?.HapticFeedback?.notificationOccurred("success");
        if (type === "error") tg?.HapticFeedback?.notificationOccurred("error");
      } catch (e) {}
    },
  };
}