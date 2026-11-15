import { CSSProperties, ReactNode } from 'react';
import { Avatar, Button, Caption, Div, Group, Header, Panel, PanelHeader, Text, Title } from '@vkontakte/vkui';
import { Icon28AddOutline, Icon28Users3Outline } from '@vkontakte/icons';
import { UserInfo } from '@vkontakte/vk-bridge';
import { useRouteNavigator } from '@vkontakte/vk-mini-apps-router';
import { Goal, NavIdProps } from '../types';
import { formatToday, isHandledToday, isPlannedToday, plural } from '../utils/goals';
import { GoalActions, GoalCard } from '../components/GoalCard';
import { Achievement } from '../utils/achievements';

interface HomeProps extends NavIdProps, GoalActions {
  fetchedUser?: UserInfo;
  goals: Goal[];
  serverError?: string;
  onOpenGoal: (id: string) => void;
  onCreateGoal: () => void;
  /** Reminders toggle card (rendered by the app, hidden when notifications are unavailable). */
  reminders?: ReactNode;
  achievements: Achievement[];
}

export const Home = ({ id, fetchedUser, goals: allGoals, serverError, onOpenGoal, onCreateGoal, onMark, onAddValue, onResetDay, reminders, achievements }: HomeProps) => {
  const unlockedAchievements = achievements.filter((achievement) => achievement.unlocked);
  const routeNavigator = useRouteNavigator();
  // Today's focus: goals that expect a mark today (not finished, not a day off of a «По будням» goal).
  const goals = allGoals.filter(isPlannedToday);
  const completed = goals.filter(isHandledToday).length;
  const progress = goals.length ? Math.round((completed / goals.length) * 100) : 0;
  const allDone = goals.length > 0 && completed === goals.length;
  const nothingPlanned = allGoals.length > 0 && goals.length === 0;

  return (
    <Panel id={id}>
      <PanelHeader>Цели вместе</PanelHeader>
      <Div className="welcome-block">
        <div>
          <Caption className="welcome-block__date">{formatToday()}</Caption>
          <Title level="1" weight="2" className="welcome-block__title">Привет, {fetchedUser?.first_name || 'друг'}!</Title>
          <Text>Маленький шаг сегодня важнее идеального плана.</Text>
        </div>
        <Avatar size={52} src={fetchedUser?.photo_200} initials={fetchedUser?.first_name?.slice(0, 1) || 'В'} gradientColor="blue" />
      </Div>

      <Div>
        <div className="daily-summary">
          <div className="daily-summary__content">
            <Caption className="daily-summary__eyebrow">Ваш фокус на сегодня</Caption>
            <Title level="2" weight="2" className="daily-summary__title">
              {nothingPlanned ? 'Сегодня свободный день' : goals.length === 0 ? 'Начните с первой цели' : allDone ? 'Всё выполнено!' : `${completed} из ${goals.length} ${plural(goals.length, ['цели', 'целей', 'целей'])}`}
            </Title>
            <Text className="daily-summary__text">
              {nothingPlanned
                ? 'По расписанию на сегодня отметок нет. Отдыхайте.'
                : goals.length === 0 ? 'Определите небольшой шаг, который хотите сделать.' : allDone ? 'Отличная работа. Можно выдохнуть.' : 'Отметьте прогресс — без давления и обязательств.'}
            </Text>
          </div>
          {goals.length > 0 && (
            <div className="progress-ring" role="img" aria-label={`Дневной прогресс: ${progress}%`} style={{ '--progress': `${progress * 3.6}deg` } as CSSProperties}>
              <span>{progress}%</span>
            </div>
          )}
        </div>
      </Div>

      {serverError && (
        <Div>
          <div className="server-banner" role="alert">Не удалось обновить цели: {serverError}</div>
        </Div>
      )}

      <Div className="top-actions">
        <Button stretched size="m" before={<Icon28AddOutline width={20} height={20} />} onClick={onCreateGoal}>Новая цель</Button>
        <Button stretched size="m" mode="secondary" onClick={() => routeNavigator.push('/catalog')}>Из шаблона</Button>
      </Div>

      {allGoals.length > 0 && (
        <Div>
          <button type="button" className="achievements-strip" onClick={() => routeNavigator.push('/achievements')}>
            <span className="achievements-strip__emojis" aria-hidden>
              {unlockedAchievements.length ? unlockedAchievements.slice(-4).map((achievement) => achievement.emoji).join('') : '🏅'}
            </span>
            <span className="achievements-strip__text">Достижения</span>
            <span className="achievements-strip__count">{unlockedAchievements.length} из {achievements.length} ›</span>
          </button>
        </Div>
      )}

      <Group mode="plain" header={<Header size="s">Что отметить сегодня</Header>}>
        <Div className="goal-list">
          {goals.map((goal) => (
            <GoalCard key={goal.id} goal={goal} onOpen={onOpenGoal} onMark={onMark} onAddValue={onAddValue} onResetDay={onResetDay} />
          ))}
          {nothingPlanned && (
            <div className="empty-state">
              <h3 className="empty-state__title">На сегодня всё спокойно</h3>
              <p className="empty-state__text">Остальные цели — в разделе «Мои цели».</p>
              <Button size="m" mode="secondary" onClick={() => routeNavigator.push('/goals')}>Мои цели</Button>
            </div>
          )}
          {allGoals.length === 0 && (
            <div className="empty-state">
              <h3 className="empty-state__title">Здесь появятся ваши цели</h3>
              <p className="empty-state__text">Нажмите «Новая цель» выше или начните с готового шаблона.</p>
            </div>
          )}
        </Div>
      </Group>

      <Group mode="plain">
        {reminders}
        <Div>
          <button type="button" className="support-card" onClick={() => routeNavigator.push('/group')}>
            <span className="support-card__icon"><Icon28Users3Outline /></span>
            <span className="support-card__body">
              <Title level="3" weight="2">Двигайтесь вместе</Title>
              <Caption>Создайте общую цель и пригласите друзей поддерживать друг друга.</Caption>
            </span>
            <span className="support-card__action">В группу</span>
          </button>
        </Div>
        <div className="footer-links">
          <Button size="s" mode="tertiary" appearance="neutral" onClick={() => routeNavigator.push('/about')}>О приложении и данных</Button>
        </div>
      </Group>
    </Panel>
  );
};
