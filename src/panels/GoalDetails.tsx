import { useState } from 'react';
import { Alert, Button, Caption, Div, Group, Header, Panel, PanelHeader, PanelHeaderBack, Text, Title } from '@vkontakte/vkui';
import { Icon28DeleteOutline } from '@vkontakte/icons';
import { useParams } from '@vkontakte/vk-mini-apps-router';
import { useSafeBack } from '../hooks/useSafeBack';
import { Goal, NavIdProps } from '../types';
import { dateFromKey, getCurrentValue, getDoneDays, getProgress, getStreak, shiftDate, toDateKey } from '../utils/goals';
import { GoalCard } from '../components/GoalCard';

interface GoalDetailsProps extends NavIdProps {
  goals: Goal[];
  loading?: boolean;
  currentUserId: string;
  onOpenGoal: (id: string) => void;
  onMark: (id: string, status: 'done' | 'skipped') => void;
  onAddValue: (id: string, value: number) => void;
  onDelete: (id: string) => void;
}

export const GoalDetails = ({ id, goals, loading, currentUserId, onOpenGoal, onMark, onAddValue, onDelete }: GoalDetailsProps) => {
  const goBack = useSafeBack();
  const params = useParams<'id'>();
  const [isDeleteOpen, setDeleteOpen] = useState(false);
  const goal = goals.find((item) => item.id === params?.id);

  if (!goal) {
    return (
      <Panel id={id}>
        <PanelHeader before={<PanelHeaderBack onClick={goBack} />}>Цель</PanelHeader>
        <Div className="empty-state"><Text>{loading ? 'Загружаем цель…' : 'Цель не найдена. Вернитесь к списку и выберите другую.'}</Text></Div>
      </Panel>
    );
  }

  const days = Array.from({ length: 14 }, (_, index) => shiftDate(index - 13));
  const created = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }).format(dateFromKey(goal.createdAt));
  const progress = getProgress(goal);
  const currentValue = getCurrentValue(goal);
  const streak = getStreak(goal);
  const doneDays = getDoneDays(goal);

  return (
    <Panel id={id}>
      <PanelHeader before={<PanelHeaderBack onClick={goBack} />}>Прогресс цели</PanelHeader>
      <Div>
        <GoalCard goal={goal} onOpen={onOpenGoal} onMark={onMark} onAddValue={onAddValue} />
      </Div>
      <Group mode="plain" header={<Header size="s">Ваши достижения</Header>}>
        <Div className="stats-grid">
          <div className="stat-card"><strong>{streak}</strong><Caption>{streak === 1 ? 'день подряд' : 'дней подряд'}</Caption></div>
          <div className="stat-card"><strong>{goal.type === 'quantity' ? currentValue.toLocaleString('ru-RU') : doneDays}</strong><Caption>{goal.type === 'quantity' ? goal.unit : doneDays === 1 ? 'успешный день' : 'успешных дней'}</Caption></div>
          <div className="stat-card"><strong>{progress}%</strong><Caption>общий прогресс</Caption></div>
        </Div>
      </Group>
      <Group mode="plain" header={<Header size="s">Последние 14 дней</Header>}>
        <Div>
          <div className="calendar-grid">
            {days.map((day) => {
              const entry = goal.entries[toDateKey(day)];
              const status = entry?.status || 'empty';
              return (
                <div key={toDateKey(day)} className={`calendar-day calendar-day--${status}`}>
                  <Caption>{new Intl.DateTimeFormat('ru-RU', { weekday: 'narrow' }).format(day)}</Caption>
                  <strong>{day.getDate()}</strong>
                </div>
              );
            })}
          </div>
          <div className="calendar-legend"><span><i className="legend-dot legend-dot--done" />Выполнено</span><span><i className="legend-dot legend-dot--skipped" />Пропуск</span></div>
        </Div>
      </Group>
      <Group mode="plain">
        <Div className="goal-info">
          <Title level="3" weight="2">О цели</Title>
          <Text>{goal.rule}</Text>
          <Caption>Создана {created} · {goal.privacy === 'private' ? 'личная цель' : 'цель с друзьями'}</Caption>
          <Caption>Пропущенный день сохраняет всю вашу историю. Можно продолжить в любой момент.</Caption>
        </Div>
      </Group>
      <Group mode="plain">
        <Div>
          <Button className="delete-goal-button" stretched size="l" mode="tertiary" before={<Icon28DeleteOutline />} onClick={() => setDeleteOpen(true)}>
            {goal.privacy === 'group' && goal.ownerId !== currentUserId ? 'Выйти из цели' : 'Удалить цель'}
          </Button>
        </Div>
      </Group>
      {isDeleteOpen && (
        <Alert
          title={goal.privacy === 'group' && goal.ownerId !== currentUserId ? 'Выйти из цели?' : 'Удалить цель?'}
          description={goal.privacy === 'group' && goal.ownerId !== currentUserId
            ? 'Ваша история в этой цели будет удалена. Цель и прогресс остальных участников сохранятся.'
            : goal.privacy === 'group' && (goal.participants?.length || 1) > 1
              ? `«${goal.title}» будет удалена у всех участников (${goal.participants?.length}) вместе с их прогрессом. Это действие нельзя отменить.`
              : `«${goal.title}» и вся история прогресса будут удалены. Это действие нельзя отменить.`}
          actionsLayout="vertical"
          actions={[
            { title: 'Отмена', mode: 'cancel' },
            {
              title: goal.privacy === 'group' && goal.ownerId !== currentUserId ? 'Выйти из цели' : 'Удалить цель',
              mode: 'destructive',
              autoCloseDisabled: true,
              action: () => {
                onDelete(goal.id);
                setDeleteOpen(false);
              },
            },
          ]}
          onClose={() => setDeleteOpen(false)}
          onClosed={() => setDeleteOpen(false)}
          dismissLabel="Закрыть"
        />
      )}
    </Panel>
  );
};
