import { useEffect, useState } from 'react';
import bridge, { UserInfo } from '@vkontakte/vk-bridge';
import { Switch } from '@vkontakte/vkui';
import { Icon28NotificationAddOutline } from '@vkontakte/icons';
import { getReminderSettings, isVkLaunch, saveReminderSettings } from '../api';
import { ReminderSettings } from '../types';

interface RemindersCardProps {
  user?: UserInfo;
  /** false while the VK profile is loading: no request until then. */
  ready: boolean;
  onNotice: (message: string) => void;
}

/** Evening reminder toggle. Hidden when the server cannot send VK notifications (no service key). */
export const RemindersCard = ({ user, ready, onNotice }: RemindersCardProps) => {
  const [settings, setSettings] = useState<ReminderSettings>();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!ready) return undefined;
    let active = true;
    getReminderSettings(user).then((data) => { if (active) setSettings(data); }).catch(() => undefined);
    return () => { active = false; };
  }, [ready, user]);

  if (!settings?.available) return null;

  const toggle = async (enabled: boolean) => {
    setSaving(true);
    try {
      if (isVkLaunch()) {
        // VK delivers mini app notifications only after the user allows them in this system dialog.
        if (enabled) await bridge.send('VKWebAppAllowNotifications');
        else await bridge.send('VKWebAppDenyNotifications').catch(() => undefined);
      }
      setSettings(await saveReminderSettings(enabled, user));
      onNotice(enabled ? 'Напомним в 20:00, если цели не будут отмечены' : 'Напоминания выключены');
    } catch {
      onNotice(enabled ? 'Чтобы получать напоминания, разрешите уведомления от приложения' : 'Не удалось сохранить настройку');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="reminders-card">
      <span className="reminders-card__icon"><Icon28NotificationAddOutline width={24} height={24} /></span>
      <span className="reminders-card__body">
        <strong>Напоминать вечером</strong>
        <small>В 20:00, если на сегодня что-то не отмечено. А ещё — когда друзья вас поддержат.</small>
      </span>
      <Switch
        checked={settings.notifications}
        disabled={saving}
        aria-label="Напоминания"
        onChange={(event) => void toggle(event.target.checked)}
      />
    </div>
  );
};
