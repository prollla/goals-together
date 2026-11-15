import { FormEvent, useState } from 'react';
import { Icon24ChevronRight, Icon20Check } from '@vkontakte/icons';
import { Button, Caption, Card, Input, Progress, Text, Title } from '@vkontakte/vkui';
import { Goal } from '../types';
import {
  MAX_SKIPS_IN_ROW, canMarkYesterday, formatNumber, formatStreakUnit, getCurrentValue, getDoneDays, getProgress, getStreak,
  getTargetCount, getWeekProgress, isCompleted, isDone, isScheduledDay, plural, todayKey, yesterdayKey,
} from '../utils/goals';
import { GoalTypeIcon } from './GoalTypeIcon';

export interface GoalActions {
  onMark: (id: string, status: 'done' | 'skipped', date?: string) => void;
  onAddValue: (id: string, value: number) => void;
  onResetDay: (id: string, date?: string) => void;
}

interface GoalCardProps extends GoalActions {
  goal: Goal;
  onOpen: (id: string) => void;
}

const successfulDays = (count: number) => `${count} ${plural(count, ['успешный день', 'успешных дня', 'успешных дней'])}`;

/** Progress line under the title: what is measured depends on goal type and schedule. */
const describeProgress = (goal: Goal) => {
  const progress = getProgress(goal);
  if (goal.type === 'quantity') {
    return { text: `${formatNumber(getCurrentValue(goal))} из ${formatNumber(goal.target || 0)} ${goal.unit || ''}`, percent: progress, bar: progress };
  }
  if (goal.frequency === 'weekly') {
    const week = getWeekProgress(goal);
    return { text: `Эта неделя: ${week.done} из ${week.target}`, percent: progress, bar: Math.min(100, Math.round((week.done / week.target) * 100)) };
  }
  if (progress === null) return { text: successfulDays(getDoneDays(goal)), percent: null, bar: null };
  const target = getTargetCount(goal);
  return { text: `${getDoneDays(goal)} из ${target} ${plural(target, ['дня', 'дней', 'дней'])}`, percent: progress, bar: progress };
};

export const GoalCard = ({ goal, onOpen, onMark, onAddValue, onResetDay }: GoalCardProps) => {
  const [amount, setAmount] = useState('');
  const [showAmount, setShowAmount] = useState(false);
  const todayEntry = goal.entries[todayKey()];
  const done = isDone(todayEntry);
  const skipped = todayEntry?.status === 'skipped';
  const completed = isCompleted(goal);
  const dayOff = !isScheduledDay(goal, todayKey());
  const streak = getStreak(goal);
  const { text, percent, bar } = describeProgress(goal);

  const submitValue = (event: FormEvent) => {
    event.preventDefault();
    const numericValue = Number(amount.replace(',', '.'));
    if (numericValue > 0) {
      onAddValue(goal.id, numericValue);
      setAmount('');
      setShowAmount(false);
    }
  };

  return (
    <Card mode="shadow" className={`goal-card goal-card--${goal.color} ${completed ? 'goal-card--completed' : ''}`}>
      <button type="button" className="goal-card__main" onClick={() => onOpen(goal.id)}>
        <span className="goal-card__icon"><GoalTypeIcon type={goal.type} /></span>
        <span className="goal-card__heading">
          <Title level="3" weight="2">{goal.title}</Title>
          <Caption className="goal-card__rule">{goal.rule}</Caption>
        </span>
        <Icon24ChevronRight className="goal-card__chevron" />
      </button>

      <div className="goal-card__progress-meta">
        <Caption>{text}</Caption>
        {percent !== null && <Caption weight="1">{percent}%</Caption>}
      </div>
      {bar !== null && <Progress value={bar} aria-label={`Прогресс цели ${goal.title}`} />}

      <div className="goal-card__footer">
        {completed ? <span /> : (
          <span className="streak-badge">{streak > 0 ? `Серия ${streak} ${formatStreakUnit(goal, streak)}` : 'Первый шаг — сегодня'}</span>
        )}
        {goal.privacy === 'group' && <Caption>с друзьями</Caption>}
      </div>

      {completed && (
        <div className="goal-card__completed" role="status">
          🎉 Цель завершена{goal.type === 'quantity' ? '' : ` · ${successfulDays(getDoneDays(goal))}`}
        </div>
      )}

      {!completed && dayOff && (
        <div className="goal-card__day-off">Сегодня выходной по расписанию — отметка не нужна</div>
      )}

      {!completed && !dayOff && goal.type !== 'quantity' && (
        <div className="goal-card__actions">
          {done ? (
            <>
              <span className="goal-card__status goal-card__status--done" role="status">
                <Icon20Check />
                {goal.type === 'quit' ? 'Сегодня без привычки' : 'Выполнено сегодня'}
              </span>
              <Button size="m" mode="tertiary" appearance="neutral" onClick={() => onMark(goal.id, 'done')}>
                Отменить
              </Button>
            </>
          ) : (
            <>
              <Button stretched size="m" mode="primary" before={<Icon20Check />} onClick={() => onMark(goal.id, 'done')}>
                {goal.type === 'quit' ? 'День без привычки' : 'Сделано'}
              </Button>
              <Button size="m" mode="tertiary" appearance="neutral" aria-label={skipped ? 'Отменить пропуск' : undefined} onClick={() => onMark(goal.id, 'skipped')}>
                {skipped ? 'Отменить' : 'Пропустить'}
              </Button>
            </>
          )}
        </div>
      )}
      {!completed && !dayOff && goal.type !== 'quantity' && skipped && (
        <Caption className="goal-card__skipped-note">
          День пропущен. Серия прервётся только после {MAX_SKIPS_IN_ROW} пропусков подряд.
        </Caption>
      )}
      {!completed && canMarkYesterday(goal) && (
        <button type="button" className="goal-card__yesterday" onClick={() => onMark(goal.id, 'done', yesterdayKey())}>
          Забыли отметить вчера? <strong>Отметить вчера</strong>
        </button>
      )}

      {!completed && goal.type === 'quantity' && (
        <div className="goal-card__quantity">
          {done && !showAmount && (
            <div className="today-result">
              <Text>Сегодня: +{formatNumber(todayEntry.value || 0)} {goal.unit}</Text>
              <Button size="s" mode="tertiary" appearance="neutral" onClick={() => onResetDay(goal.id)}>Сбросить</Button>
            </div>
          )}
          {!showAmount ? (
            <Button stretched size="m" mode="secondary" onClick={() => setShowAmount(true)}>
              {done ? 'Добавить ещё' : 'Добавить результат'}
            </Button>
          ) : (
            <form className="value-form" onSubmit={submitValue}>
              <Input
                type="text"
                inputMode="decimal"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                placeholder={`Сколько ${goal.unit || ''}?`}
                aria-label="Добавленный результат"
                autoFocus
              />
              <Button size="m" type="submit">Добавить</Button>
            </form>
          )}
        </div>
      )}
    </Card>
  );
};
