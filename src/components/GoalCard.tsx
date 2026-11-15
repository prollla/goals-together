import { FormEvent, useState } from 'react';
import { Icon24ChevronRight, Icon20Check } from '@vkontakte/icons';
import { Button, Caption, Card, Input, Progress, Text, Title } from '@vkontakte/vkui';
import { Goal } from '../types';
import { formatNumber, getCurrentValue, getDoneDays, getProgress, getStreak, isDone, toDateKey } from '../utils/goals';
import { GoalTypeIcon } from './GoalTypeIcon';

interface GoalCardProps {
  goal: Goal;
  onOpen: (id: string) => void;
  onMark: (id: string, status: 'done' | 'skipped') => void;
  onAddValue: (id: string, value: number) => void;
}

export const GoalCard = ({ goal, onOpen, onMark, onAddValue }: GoalCardProps) => {
  const [amount, setAmount] = useState('');
  const [showAmount, setShowAmount] = useState(false);
  const todayEntry = goal.entries[toDateKey()];
  const done = isDone(todayEntry);
  const skipped = todayEntry?.status === 'skipped';
  const progress = getProgress(goal);
  const streak = getStreak(goal);
  const value = getCurrentValue(goal);

  const submitValue = (event: FormEvent) => {
    event.preventDefault();
    const numericValue = Number(amount.replace(',', '.'));
    if (numericValue > 0) {
      onAddValue(goal.id, numericValue);
      setAmount('');
      setShowAmount(false);
    }
  };

  const progressText =
    goal.type === 'quantity'
      ? `${formatNumber(value)} из ${formatNumber(goal.target || 0)} ${goal.unit || ''}`
      : goal.duration
        ? `${getDoneDays(goal)} из ${goal.duration} дней`
        : `${getDoneDays(goal)} успешных дней`;

  return (
    <Card mode="shadow" className={`goal-card goal-card--${goal.color}`}>
      <button type="button" className="goal-card__main" onClick={() => onOpen(goal.id)}>
        <span className="goal-card__icon"><GoalTypeIcon type={goal.type} /></span>
        <span className="goal-card__heading">
          <Title level="3" weight="2">{goal.title}</Title>
          <Caption className="goal-card__rule">{goal.rule}</Caption>
        </span>
        <Icon24ChevronRight className="goal-card__chevron" />
      </button>

      <div className="goal-card__progress-meta">
        <Caption>{progressText}</Caption>
        <Caption weight="1">{progress}%</Caption>
      </div>
      <Progress value={progress} aria-label={`Прогресс цели ${goal.title}`} />

      <div className="goal-card__footer">
        <span className="streak-badge">{streak > 0 ? `Серия ${streak} ${streak === 1 ? 'день' : streak < 5 ? 'дня' : 'дней'}` : 'Первый шаг — сегодня'}</span>
        {goal.privacy === 'group' && <Caption>с друзьями</Caption>}
      </div>

      {goal.type !== 'quantity' && (
        <div className="goal-card__actions">
          <Button
            stretched
            size="m"
            mode={done ? 'primary' : 'secondary'}
            before={done ? <Icon20Check /> : undefined}
            onClick={() => onMark(goal.id, 'done')}
          >
            {done ? 'Выполнено' : 'Отметить выполнение'}
          </Button>
          {!done && (
            <Button size="m" mode="tertiary" onClick={() => onMark(goal.id, 'skipped')}>
              {skipped ? 'Вернуть' : 'Пропустить'}
            </Button>
          )}
        </div>
      )}

      {goal.type === 'quantity' && (
        <div className="goal-card__quantity">
          {done && !showAmount && (
            <Text className="today-result">Сегодня: +{formatNumber(todayEntry.value || 0)} {goal.unit}</Text>
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
