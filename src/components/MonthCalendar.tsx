import { useState } from 'react';
import { Icon24ChevronLeft, Icon24ChevronRight } from '@vkontakte/icons';
import { IconButton } from '@vkontakte/vkui';
import { Goal } from '../types';
import { addDays, dateFromKey, formatStreakUnit, getBestStreak, isScheduledDay, plural, todayKey, yesterdayKey } from '../utils/goals';

interface MonthCalendarProps {
  goal: Goal;
  /** Today and yesterday can be changed by tapping (when the goal accepts marks). */
  canTapDays: boolean;
  onCycleDay: (key: string) => void;
}

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const monthTitle = new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric' });

/** YYYY-MM-01 of the month `offset` months away from the current one (0 = this month, -1 = previous). */
const monthStart = (offset: number) => {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(1);
  date.setMonth(date.getMonth() + offset);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`;
};

export const MonthCalendar = ({ goal, canTapDays, onCycleDay }: MonthCalendarProps) => {
  const [offset, setOffset] = useState(0);
  const today = todayKey();
  const yesterday = yesterdayKey();
  const first = monthStart(offset);
  const daysInMonth = new Date(dateFromKey(first).getFullYear(), dateFromKey(first).getMonth() + 1, 0).getDate();
  const leadingBlanks = (dateFromKey(first).getDay() + 6) % 7; // Monday-first grid
  const keys = Array.from({ length: daysInMonth }, (_, index) => addDays(first, index));
  const canGoBack = first > goal.createdAt.slice(0, 7) + '-01';

  const monthDone = keys.filter((key) => goal.entries[key]?.status === 'done').length;
  const monthSkipped = keys.filter((key) => goal.entries[key]?.status === 'skipped').length;
  const best = getBestStreak(goal);
  const title = monthTitle.format(dateFromKey(first));

  return (
    <div className="month-calendar">
      <div className="month-calendar__header">
        <IconButton label="Предыдущий месяц" disabled={!canGoBack} onClick={() => setOffset(offset - 1)}><Icon24ChevronLeft /></IconButton>
        <strong className="month-calendar__title">{title.charAt(0).toUpperCase() + title.slice(1)}</strong>
        <IconButton label="Следующий месяц" disabled={offset >= 0} onClick={() => setOffset(offset + 1)}><Icon24ChevronRight /></IconButton>
      </div>

      <div className="calendar-grid">
        {WEEKDAYS.map((weekday) => <span key={weekday} className="month-calendar__weekday">{weekday}</span>)}
        {Array.from({ length: leadingBlanks }, (_, index) => <span key={`blank-${index}`} />)}
        {keys.map((key) => {
          const status = goal.entries[key]?.status || 'empty';
          const off = !isScheduledDay(goal, key) || key < goal.createdAt || key > today;
          const tappable = canTapDays && !off && (key === today || key === yesterday);
          const className = `calendar-day calendar-day--${status} ${off ? 'calendar-day--off' : ''} ${tappable ? 'calendar-day--tappable' : ''} ${key === today ? 'calendar-day--today' : ''}`;
          const day = Number(key.slice(8));
          return tappable ? (
            <button
              type="button"
              key={key}
              className={className}
              onClick={() => onCycleDay(key)}
              aria-label={`${key === today ? 'Сегодня' : 'Вчера'}: ${status === 'done' ? 'выполнено' : status === 'skipped' ? 'пропуск' : 'нет отметки'}. Нажмите, чтобы изменить`}
            >
              <strong>{day}</strong>
            </button>
          ) : (
            <div key={key} className={className}><strong>{day}</strong></div>
          );
        })}
      </div>

      <div className="month-calendar__stats">
        <span><strong>{monthDone}</strong> {plural(monthDone, ['отметка', 'отметки', 'отметок'])} за месяц</span>
        <span><strong>{monthSkipped}</strong> {plural(monthSkipped, ['пропуск', 'пропуска', 'пропусков'])}</span>
        <span>лучшая серия: <strong>{best}</strong> {formatStreakUnit(goal, best)}</span>
      </div>
    </div>
  );
};
