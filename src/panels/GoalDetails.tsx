import { useState } from 'react';
import { Alert, Button, Caption, Div, Group, Header, Panel, PanelHeader, PanelHeaderBack, Text, Title } from '@vkontakte/vkui';
import { Icon28DeleteOutline, Icon28EditOutline } from '@vkontakte/icons';
import { useParams } from '@vkontakte/vk-mini-apps-router';
import { useSafeBack } from '../hooks/useSafeBack';
import { Goal, NavIdProps } from '../types';
import {
  MAX_SKIPS_IN_ROW, dateFromKey, formatNumber, formatStreakUnit, getCurrentValue, getDoneDays, getEndDate, getProgress, getStreak,
  isCompleted, plural,
} from '../utils/goals';
import { GoalActions, GoalCard } from '../components/GoalCard';
import { MonthCalendar } from '../components/MonthCalendar';
import { shareStory } from '../utils/story';

interface GoalDetailsProps extends NavIdProps, GoalActions {
  goals: Goal[];
  loading?: boolean;
  currentUserId: string;
  onOpenGoal: (id: string) => void;
  onEdit: (id: string) => void;
  /** transfer: the owner leaves and the goal passes to another participant. */
  onDelete: (id: string, transfer?: boolean) => void;
  onNotice?: (message: string) => void;
}

const formatDate = (key: string) => new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' }).format(dateFromKey(key));

const scheduleText = (goal: Goal) => {
  if (goal.type === 'quantity') return 'Результат копится, пока не достигнете цели';
  if (goal.frequency === 'weekdays') return 'По будням — выходные не влияют на серию';
  if (goal.frequency === 'weekly') return `${goal.weeklyTarget || 1} раз в неделю — серия считается в неделях`;
  return 'Каждый день';
};

export const GoalDetails = ({ id, goals, loading, currentUserId, onOpenGoal, onMark, onAddValue, onResetDay, onEdit, onDelete, onNotice }: GoalDetailsProps) => {
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

  const created = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }).format(dateFromKey(goal.createdAt));
  const progress = getProgress(goal);
  const currentValue = getCurrentValue(goal);
  const streak = getStreak(goal);
  const doneDays = getDoneDays(goal);
  const endDate = getEndDate(goal);
  const completed = isCompleted(goal);
  // Only the author edits a shared goal; a private goal always belongs to the current user.
  const canEdit = goal.privacy === 'private' || goal.ownerId === currentUserId;
  const canTapDays = goal.type !== 'quantity' && !completed;
  const otherCount = (goal.participants || []).filter((participant) => participant.userId !== currentUserId).length;
  // participant: leaves; owner-with-friends: passes the goal on or deletes it for all; sole: deletes.
  const leaveRole = goal.privacy === 'group' && goal.ownerId !== currentUserId
    ? 'participant'
    : goal.privacy === 'group' && otherCount > 0 ? 'owner-with-friends' : 'sole';

  // Tap cycle for today/yesterday: empty → done → skipped → empty. Sending "skipped" replaces "done",
  // and sending it again on a skipped day clears the day (same toggle rule as the server).
  const cycleDay = (key: string) => onMark(goal.id, goal.entries[key] ? 'skipped' : 'done', key);

  const shareStreak = async () => {
    try {
      const result = await shareStory({ emoji: '🔥', title: `Серия ${streak} ${formatStreakUnit(goal, streak)}`, subtitle: goal.title });
      if (result === 'downloaded') onNotice?.('Картинка для истории сохранена');
    } catch {
      // The user closed the story editor: nothing to report.
    }
  };

  return (
    <Panel id={id}>
      <PanelHeader before={<PanelHeaderBack onClick={goBack} />}>Прогресс цели</PanelHeader>
      <Div>
        <GoalCard goal={goal} onOpen={onOpenGoal} onMark={onMark} onAddValue={onAddValue} onResetDay={onResetDay} />
      </Div>
      <Group mode="plain" header={<Header size="s">Ваши достижения</Header>}>
        <Div className="stats-grid">
          <div className="stat-card">
            <strong>{streak}</strong>
            <Caption>{formatStreakUnit(goal, streak)} подряд</Caption>
          </div>
          <div className="stat-card">
            <strong>{goal.type === 'quantity' ? formatNumber(currentValue) : doneDays}</strong>
            <Caption>{goal.type === 'quantity' ? goal.unit : plural(doneDays, ['успешный день', 'успешных дня', 'успешных дней'])}</Caption>
          </div>
          <div className="stat-card">
            <strong>{progress === null ? '∞' : `${progress}%`}</strong>
            <Caption>{progress === null ? 'без срока' : 'общий прогресс'}</Caption>
          </div>
        </Div>
      </Group>
      {streak >= 3 && (
        <Div>
          <Button stretched size="m" mode="secondary" onClick={() => void shareStreak()}>
            🔥 Поделиться серией в истории
          </Button>
        </Div>
      )}
      <Group mode="plain" header={<Header size="s">Календарь</Header>}>
        <Div>
          <MonthCalendar goal={goal} canTapDays={canTapDays} onCycleDay={cycleDay} />
          <div className="calendar-legend">
            <span><i className="legend-dot legend-dot--done" />Выполнено</span>
            <span><i className="legend-dot legend-dot--skipped" />Пропуск</span>
            {goal.frequency === 'weekdays' && <span><i className="legend-dot legend-dot--off" />Выходной</span>}
          </div>
          {canTapDays && <Caption className="calendar-hint">Сегодня и вчера можно отметить нажатием на день.</Caption>}
        </Div>
      </Group>
      <Group mode="plain">
        <Div className="goal-info">
          <Title level="3" weight="2">О цели</Title>
          <Text>{goal.rule}</Text>
          <Caption>{scheduleText(goal)}</Caption>
          <Caption>
            Создана {created}
            {endDate ? ` · ${completed ? 'завершена' : 'до'} ${formatDate(endDate)}` : ' · без срока'}
            {' · '}{goal.privacy === 'private' ? 'личная цель' : 'цель с друзьями'}
          </Caption>
          {goal.type !== 'quantity' && (
            <Caption>Пропуск не обрывает серию. Серия прервётся после {MAX_SKIPS_IN_ROW} пропусков подряд или дня без отметки.</Caption>
          )}
        </Div>
      </Group>
      <Group mode="plain">
        <Div className="goal-manage">
          {canEdit && (
            <Button stretched size="l" mode="secondary" before={<Icon28EditOutline width={24} height={24} />} onClick={() => onEdit(goal.id)}>
              Изменить цель
            </Button>
          )}
          <Button className="delete-goal-button" stretched size="l" mode="tertiary" before={<Icon28DeleteOutline />} onClick={() => setDeleteOpen(true)}>
            {leaveRole === 'participant' ? 'Выйти из цели' : leaveRole === 'owner-with-friends' ? 'Выйти или удалить' : 'Удалить цель'}
          </Button>
        </Div>
      </Group>
      {isDeleteOpen && (
        <Alert
          title={leaveRole === 'participant' ? 'Выйти из цели?' : leaveRole === 'owner-with-friends' ? 'Выйти из общей цели?' : 'Удалить цель?'}
          description={{
            participant: 'Ваша история в этой цели будет удалена. Цель и прогресс остальных участников сохранятся.',
            'owner-with-friends': `Можно передать цель «${goal.title}» следующему участнику — у друзей сохранится прогресс. Или удалить её у всех участников — без возможности восстановления.`,
            sole: `«${goal.title}» и вся история прогресса будут удалены. Это действие нельзя отменить.`,
          }[leaveRole]}
          actionsLayout="vertical"
          actions={[
            ...(leaveRole === 'owner-with-friends' ? [{
              title: 'Передать цель и выйти',
              mode: 'default' as const,
              autoCloseDisabled: true,
              action: () => {
                onDelete(goal.id, true);
                setDeleteOpen(false);
              },
            }] : []),
            {
              title: leaveRole === 'participant' ? 'Выйти из цели' : leaveRole === 'owner-with-friends' ? 'Удалить у всех' : 'Удалить цель',
              mode: 'destructive' as const,
              autoCloseDisabled: true,
              action: () => {
                onDelete(goal.id);
                setDeleteOpen(false);
              },
            },
            { title: 'Отмена', mode: 'cancel' as const },
          ]}
          onClose={() => setDeleteOpen(false)}
          onClosed={() => setDeleteOpen(false)}
          dismissLabel="Закрыть"
        />
      )}
    </Panel>
  );
};
